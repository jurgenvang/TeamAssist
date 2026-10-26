// De kern van de module Officials (0.33.0): de synchronisatie, wat een
// official ziet en opgeeft, en wat een beheerder aanduidt.
//
// Datums relatief tegenover vandaag: een vaste datum wordt een tijdbom zodra
// ze voorbij is (learnings.md).

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { rechtenVoor } from '../src/lib/rechten-db.js';
import { takenVoorUur } from '../src/lib/planner.js';
import { aantalNodig, botst, normaliseerForfait, scheidsrechters, vblSeizoen } from '../src/officials/regels.js';
import { maakOfficialsplan, leesOfficialsWedstrijd } from '../src/officials/sync.js';
import { officialsSync } from '../src/officials/sync-route.js';
import {
  officialsWedstrijden, beschikbaarheidZetten, probleemMelden, kandidatenTonen, aanduiden, vrijgeven,
  scopeZetten, refsBevestigen,
} from '../src/officials/routes.js';

const seizoen = { code: '2026-27', naam: '2026-2027' };
const G12 = 'BVBL1125G12  1'; // officials, gevolgd
const J16 = 'BVBL1125J16  1'; // officials, niet gevolgd
const HSE = 'BVBL1125HSE  1'; // geen officials

function dag(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const vblDatum = (iso) => iso.split('-').reverse().join('-');

function record(guid, thuis, over = {}) {
  return {
    guid, tTGUID: thuis, tTNaam: 'Bears', tUGUID: 'BVBL1053G12  1', tUNaam: 'Tienen',
    datumString: vblDatum(dag(5)), beginTijd: '10.00', accGUID: 'ZAAL1', accNaam: 'Sporthal',
    pouleNaam: 'Poule A', wedOff: [], gespeeld: 'N', uitslag: '', ...over,
  };
}

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    UPDATE instellingen SET waarde = 'normaal' WHERE sleutel = 'bericht_modus';
    INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES ('club_guid', 'BVBL1125');
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd, officials) VALUES
      ('${G12}', '2026-27', 'Bears G12 A', 'G12', 1, 1),
      ('${J16}', '2026-27', 'Bears J16 A', 'J16', 0, 1),
      ('${HSE}', '2026-27', 'Bears HSE A', 'HSE', 1, 0);
    INSERT INTO personen (id, voornaam, achternaam, email, geboortedatum) VALUES
      ('yo', 'Yara', 'O', 'yo@x.be', NULL), ('plus', 'Pieter', 'Plus', 'plus@x.be', NULL),
      ('kind', 'Kim', 'Kind', NULL, NULL), ('ouder', 'Olga', 'Kind', 'ouder@x.be', NULL),
      ('beheer', 'Bea', 'Heer', 'beheer@x.be', NULL), ('vreemde', 'Vic', 'Vreemd', 'v@x.be', NULL);
    INSERT INTO rollen (persoon_id, rol) VALUES ('yo', 'YO'), ('plus', 'YOPLUS'), ('kind', 'YO'), ('beheer', 'YOADM');
    INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('ouder', 'kind');
  `);
  return db;
}

/** Een gesynchroniseerde stand: W1 (G12, thuis) en W2 (J16, thuis), allebei in de lijst. */
async function metWedstrijden(db, records = [record('BVBL2627W1', G12), record('BVBL2627W2', J16)]) {
  db._sqlite.exec(`
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander, locatie_tekst, vbl_acc_guid)
    VALUES ('BVBL2627W1', '${G12}', '2026-27', '${dag(5)}', '10:00', 1, 'Tienen', 'Sporthal', 'ZAAL1');
  `);
  await sync(db, records, true);
  db._sqlite.exec(`UPDATE officials_wedstrijd SET scope = 1, scope_reden = 'admin'`);
  const id = (guid) => db._sqlite.prepare(`SELECT id FROM wedstrijden WHERE wedstrijd_guid = ?`).get(guid)?.id;
  return { w1: id('BVBL2627W1'), w2: id('BVBL2627W2') };
}

async function ctx(db, persoonId, body, url = 'https://x/') {
  return {
    db, env: { RESEND_API_KEY: 'x' }, seizoen,
    persoon: { id: persoonId },
    rechten: await rechtenVoor(db, persoonId, seizoen.code),
    request: new Request(url, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined }),
  };
}

/** Vangt de mails en de VBL-oproep op. */
async function metFetch(fn, records = []) {
  const mails = [];
  const oude = globalThis.fetch;
  globalThis.fetch = async (url, opties) => {
    if (String(url).includes('resend.com')) {
      mails.push(JSON.parse(opties.body));
      return new Response('{"id":"m"}', { status: 200 });
    }
    return new Response(JSON.stringify(records), { status: 200 });
  };
  try {
    await fn();
  } finally {
    globalThis.fetch = oude;
  }
  return mails;
}

async function sync(db, records, uitvoeren = true) {
  let body;
  await metFetch(async () => {
    const res = await officialsSync(await ctx(db, 'beheer', null, `https://x/?${uitvoeren ? 'uitvoeren=1' : ''}`));
    body = await res.json();
  }, records);
  return body;
}

const json = async (res) => ({ status: res.status, ...(await res.json()) });

// --- de regels --------------------------------------------------------------------

test('regels: nog nodig, botsingen, forfait, scheidsrechters, seizoen', () => {
  assert.equal(aantalNodig(0), 2);
  assert.equal(aantalNodig(1), 1);
  assert.equal(aantalNodig(0, { bondOfficials: 2 }), 0, 'de woensdaglijst wint');
  assert.equal(aantalNodig(0, { forfait: 'uit' }), 0);
  const a = { datum: '2026-11-14', uur: '10:00', accGuid: 'Z' };
  assert.equal(botst(a, { ...a, uur: '11:59' }), true);
  assert.equal(botst(a, { ...a, uur: '12:00' }), false, 'twee uur in dezelfde zaal');
  assert.equal(botst(a, { ...a, uur: '12:00', accGuid: 'Y' }), true, 'een andere zaal: tweeënhalf uur');
  assert.equal(normaliseerForfait(' 20-  0  BFOR'), 'uit');
  assert.equal(normaliseerForfait('  0- 20  AFOR'), 'thuis');
  assert.equal(normaliseerForfait(' 63- 92'), null);
  assert.deepEqual(scheidsrechters(['A ', '', 'B']), ['A', 'B']);
  assert.deepEqual(scheidsrechters('Enkel'), ['Enkel']);
  assert.equal(vblSeizoen('2026-27'), '2627');
});

test('de planner zet de officials meteen na de gewone wedstrijdsync', () => {
  for (const uur of [0, 6, 12, 18]) {
    const t = takenVoorUur(uur, 1);
    assert.ok(t.indexOf('officials') > t.indexOf('wedstrijden'), `uur ${uur}`);
  }
  assert.ok(!takenVoorUur(7, 1).includes('officials'));
});

// --- de synchronisatie ----------------------------------------------------------------

test('het plan: enkel thuiswedstrijden van ploegen met officials, in dit seizoen', () => {
  const plan = maakOfficialsplan(
    [
      record('BVBL2627W1', G12),
      record('BVBL2627W2', J16),
      record('BVBL2627W3', HSE), // geen officials
      record('BVBL2627W4', 'BVBL1053G12  1', { tUGUID: G12 }), // uit
      record('BVBL2526W5', J16), // ander seizoen
    ],
    {
      ploegen: [{ guid: G12, categorie: 'G12', gevolgd: 1 }, { guid: J16, categorie: 'J16', gevolgd: 0 }],
      bestaand: [], seizoen: '2026-27', autoScope: new Set(['G12']), vandaag: dag(0),
    }
  );
  assert.equal(plan.gevonden, 2);
  assert.deepEqual(plan.wachtOpSync.map((w) => w.wedstrijd_guid), ['BVBL2627W1'], 'gevolgd: de gewone sync maakt de rij');
  assert.deepEqual(plan.nieuweWedstrijden.map((w) => w.wedstrijd_guid), ['BVBL2627W2']);
  assert.equal(plan.officialsNieuw[0].scope, false, 'J16 komt niet vanzelf in de lijst');
});

test('uitgevoerd: een rij voor de niet-gevolgde ploeg, officials bij beide, U12 vanzelf in de lijst', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis)
    VALUES ('BVBL2627W1', '${G12}', '2026-27', '${dag(5)}', '10:00', 1);
  `);
  const uit = await sync(db, [record('BVBL2627W1', G12, { wedOff: ['Ref Een'] }), record('BVBL2627W2', J16)]);
  assert.equal(uit.totalen.nieuw, 1);
  const rijen = db._sqlite
    .prepare(`SELECT w.wedstrijd_guid, w.team_guid, o.scope, o.scope_reden, o.off_aantal, o.cat_code
                FROM wedstrijden w JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id ORDER BY w.wedstrijd_guid`)
    .all()
    .map((r) => ({ ...r }));
  assert.deepEqual(rijen, [
    { wedstrijd_guid: 'BVBL2627W1', team_guid: G12, scope: 1, scope_reden: 'auto', off_aantal: 1, cat_code: 'G12' },
    { wedstrijd_guid: 'BVBL2627W2', team_guid: J16, scope: 0, scope_reden: null, off_aantal: 0, cat_code: 'J16' },
  ]);
  // Geen taken voor een ploeg die TeamAssist niet beheert.
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM wedstrijdtaken`).get().n, 0);
});

test('een droogloop wijzigt niets', async () => {
  const db = zetKlaar();
  const uit = await sync(db, [record('BVBL2627W2', J16)], false);
  assert.equal(uit.droogloop, true);
  assert.equal(uit.totalen.nieuw, 1);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM wedstrijden`).get().n, 0);
});

test('een tweede ronde werkt de scheidsrechters bij, laat de scope staan, en wist een overbodige bevestiging', async () => {
  const db = zetKlaar();
  const { w2 } = await metWedstrijden(db);
  db._sqlite.exec(`UPDATE officials_wedstrijd SET refs_bevestigd = 1 WHERE wedstrijd_id = ${w2}`);
  await sync(db, [record('BVBL2627W1', G12), record('BVBL2627W2', J16, { wedOff: ['A', 'B'] })]);
  const o = db._sqlite.prepare(`SELECT scope, scope_reden, off_aantal, refs_bevestigd FROM officials_wedstrijd WHERE wedstrijd_id = ?`).get(w2);
  assert.deepEqual({ ...o }, { scope: 1, scope_reden: 'admin', off_aantal: 2, refs_bevestigd: 0 });
});

test('een verschoven wedstrijd van een niet-gevolgde ploeg: bijgewerkt en in het logboek', async () => {
  const db = zetKlaar();
  const { w2 } = await metWedstrijden(db);
  await sync(db, [record('BVBL2627W1', G12), record('BVBL2627W2', J16, { beginTijd: '14.00' })]);
  assert.equal(db._sqlite.prepare(`SELECT begin FROM wedstrijden WHERE id = ?`).get(w2).begin, '14:00');
  assert.ok(db._sqlite.prepare(`SELECT 1 FROM logboek WHERE soort = 'officials' AND wat LIKE 'wedstrijd gewijzigd%' AND afgehandeld = 0`).get());
});

test('een forfait wordt overgenomen en gemeld', async () => {
  const db = zetKlaar();
  const { w2 } = await metWedstrijden(db);
  await sync(db, [record('BVBL2627W1', G12), record('BVBL2627W2', J16, { uitslag: ' 20-  0  BFOR' })]);
  assert.equal(db._sqlite.prepare(`SELECT forfait FROM officials_wedstrijd WHERE wedstrijd_id = ?`).get(w2).forfait, 'uit');
  assert.ok(db._sqlite.prepare(`SELECT 1 FROM logboek WHERE wat LIKE 'forfait:%'`).get());
});

test('nul wedstrijden terwijl er bewaard zijn: niets gewijzigd', async () => {
  const db = zetKlaar();
  await metWedstrijden(db);
  const uit = await sync(db, []);
  assert.match(uit.fout, /nul wedstrijden/);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM wedstrijden WHERE bij_bond = 0`).get().n, 0);
});

test('meer dan drie tegelijk verdwenen: niets weggezet', async () => {
  const db = zetKlaar();
  const recs = [1, 2, 3, 4, 5].map((i) => record(`BVBL2627J${i}`, J16));
  await metWedstrijden(db, [record('BVBL2627W1', G12), ...recs]);
  const uit = await sync(db, [record('BVBL2627W1', G12), recs[0]]);
  assert.equal(uit.status, 'deels');
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM wedstrijden WHERE bij_bond = 0`).get().n, 0);
  // Eén weg is gewoon een verdwenen wedstrijd.
  await sync(db, [record('BVBL2627W1', G12), ...recs.slice(0, 4)]);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM wedstrijden WHERE bij_bond = 0`).get().n, 1);
});

test('leesOfficialsWedstrijd: zonder datum of uur geen rij', () => {
  assert.equal(leesOfficialsWedstrijd(record('BVBL2627W9', J16, { beginTijd: '' })), null);
});

// --- wat een official ziet en opgeeft ------------------------------------------------------

test('een YO ziet enkel U10/U12, een YO+ ook de rest uit de lijst', async () => {
  const db = zetKlaar();
  await metWedstrijden(db);
  const yo = await json(await officialsWedstrijden(await ctx(db, 'yo')));
  assert.deepEqual(yo.wedstrijden.map((w) => w.cat_code), ['G12']);
  const plus = await json(await officialsWedstrijden(await ctx(db, 'plus')));
  assert.deepEqual(plus.wedstrijden.map((w) => w.cat_code).sort(), ['G12', 'J16']);
  assert.equal(plus.wedstrijden[0].nodig, 2);
  assert.equal((await officialsWedstrijden(await ctx(db, 'vreemde'))).status, 403);
});

test('een ouder ziet de lijst van zijn kind, een vreemde niet', async () => {
  const db = zetKlaar();
  await metWedstrijden(db);
  const r = await json(await officialsWedstrijden(await ctx(db, 'ouder', null, 'https://x/?namens=kind')));
  assert.equal(r.namens.naam, 'Kim Kind');
  assert.equal(r.wedstrijden.length, 1);
  assert.equal((await officialsWedstrijden(await ctx(db, 'vreemde', null, 'https://x/?namens=kind'))).status, 403);
});

test('beschikbaarheid: zetten, namens een kind, en niet buiten de eigen lijst', async () => {
  const db = zetKlaar();
  const { w1, w2 } = await metWedstrijden(db);
  assert.equal((await beschikbaarheidZetten(await ctx(db, 'yo', { wedstrijd_id: w1, status: 'ja' }))).status, 200);
  assert.equal((await beschikbaarheidZetten(await ctx(db, 'yo', { wedstrijd_id: w2, status: 'ja' }))).status, 404, 'J16 is niets voor een YO');
  assert.equal((await beschikbaarheidZetten(await ctx(db, 'ouder', { wedstrijd_id: w1, status: 'nee', namens: 'kind' }))).status, 200);
  assert.equal(db._sqlite.prepare(`SELECT status FROM officials_beschikbaarheid WHERE persoon_id = 'kind'`).get().status, 'nee');
  assert.equal((await beschikbaarheidZetten(await ctx(db, 'vreemde', { wedstrijd_id: w1, status: 'ja', namens: 'kind' }))).status, 403);
  // null wist het antwoord.
  await beschikbaarheidZetten(await ctx(db, 'yo', { wedstrijd_id: w1, status: null }));
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM officials_beschikbaarheid WHERE persoon_id = 'yo'`).get().n, 0);
});

test('beschikbaarheid: niet bij forfait, en niet meer eens aangeduid', async () => {
  const db = zetKlaar();
  const { w1 } = await metWedstrijden(db);
  db._sqlite.exec(`UPDATE officials_wedstrijd SET forfait = 'uit' WHERE wedstrijd_id = ${w1}`);
  assert.equal((await beschikbaarheidZetten(await ctx(db, 'yo', { wedstrijd_id: w1, status: 'ja' }))).status, 409);
  db._sqlite.exec(`
    UPDATE officials_wedstrijd SET forfait = NULL WHERE wedstrijd_id = ${w1};
    INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id) VALUES (${w1}, 'yo');
  `);
  assert.equal((await beschikbaarheidZetten(await ctx(db, 'yo', { wedstrijd_id: w1, status: 'nee' }))).status, 409);
});

// --- aanduiden ------------------------------------------------------------------------------

test('aanduiden: de official krijgt bericht; een YO niet op J16; niet buiten de lijst', async () => {
  const db = zetKlaar();
  const { w1, w2 } = await metWedstrijden(db);
  let res;
  const mails = await metFetch(async () => {
    res = await json(await aanduiden(await ctx(db, 'beheer', { wedstrijd_id: w1, persoon_id: 'yo' })));
  });
  assert.equal(res.aangeduid, true);
  assert.deepEqual(mails.map((m) => m.to), ['yo@x.be']);
  assert.match(mails[0].text, /Aanwezig op het terrein om 09:40/);
  assert.equal((await aanduiden(await ctx(db, 'beheer', { wedstrijd_id: w2, persoon_id: 'yo' }))).status, 409);
  assert.equal((await aanduiden(await ctx(db, 'beheer', { wedstrijd_id: w1, persoon_id: 'vreemde' }))).status, 409);
  db._sqlite.exec(`UPDATE officials_wedstrijd SET scope = 0 WHERE wedstrijd_id = ${w2}`);
  assert.equal((await aanduiden(await ctx(db, 'beheer', { wedstrijd_id: w2, persoon_id: 'plus' }))).status, 409);
});

test('aanduiden namens een kind: het bericht gaat naar de ouder (het kind heeft geen adres)', async () => {
  const db = zetKlaar();
  const { w1 } = await metWedstrijden(db);
  const mails = await metFetch(async () => {
    await aanduiden(await ctx(db, 'beheer', { wedstrijd_id: w1, persoon_id: 'kind' }));
  });
  assert.deepEqual(mails.map((m) => m.to), ['ouder@x.be']);
  assert.match(mails[0].subject, /^Voor Kim: Aangeduid/);
});

test('aanduiden: wie nee zei of al ergens staat, enkel met bevestiging; volzet is volzet', async () => {
  const db = zetKlaar();
  const { w1, w2 } = await metWedstrijden(db);
  db._sqlite.exec(`INSERT INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status) VALUES ('plus', ${w1}, 'nee')`);
  await metFetch(async () => {
    assert.equal((await aanduiden(await ctx(db, 'beheer', { wedstrijd_id: w1, persoon_id: 'plus' }))).status, 409);
    assert.equal((await aanduiden(await ctx(db, 'beheer', { wedstrijd_id: w1, persoon_id: 'plus', forceer: true }))).status, 200);
    // W2 is op hetzelfde uur in dezelfde zaal: een botsing.
    const b = await json(await aanduiden(await ctx(db, 'beheer', { wedstrijd_id: w2, persoon_id: 'plus' })));
    assert.equal(b.status, 409);
    assert.match(b.fout, /staat al op/);
    await aanduiden(await ctx(db, 'beheer', { wedstrijd_id: w1, persoon_id: 'yo' }));
    // Twee plaatsen, allebei bezet.
    assert.equal((await aanduiden(await ctx(db, 'beheer', { wedstrijd_id: w1, persoon_id: 'kind' }))).status, 409);
  });
});

test('aanduiden en vrijgeven op een voorbije wedstrijd: geen bericht, wel in het logboek', async () => {
  const db = zetKlaar();
  const { w1 } = await metWedstrijden(db);
  db._sqlite.exec(`UPDATE wedstrijden SET datum = '${dag(-3)}' WHERE id = ${w1}`);
  const mails = await metFetch(async () => {
    const r = await json(await aanduiden(await ctx(db, 'beheer', { wedstrijd_id: w1, persoon_id: 'yo' })));
    assert.equal(r.voorbij, true);
    await vrijgeven(await ctx(db, 'beheer', { wedstrijd_id: w1, persoon_id: 'yo' }));
  });
  assert.equal(mails.length, 0);
  assert.equal(db._sqlite.prepare(`SELECT status FROM officials_aanduidingen`).get().status, 'vrijgegeven', 'de rij blijft, voor de facturatie');
  assert.ok(db._sqlite.prepare(`SELECT 1 FROM logboek WHERE wat LIKE 'vrijgegeven:%'`).get());
});

test('uit de lijst halen kan niet zolang er iemand op staat, en onthoudt scope_uit', async () => {
  const db = zetKlaar();
  const { w1 } = await metWedstrijden(db);
  db._sqlite.exec(`INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id) VALUES (${w1}, 'yo')`);
  assert.equal((await scopeZetten(await ctx(db, 'beheer', { wedstrijd_id: w1, scope: false }))).status, 409);
  db._sqlite.exec(`UPDATE officials_aanduidingen SET status = 'vrijgegeven'`);
  await scopeZetten(await ctx(db, 'beheer', { wedstrijd_id: w1, scope: false }));
  const o = db._sqlite.prepare(`SELECT scope, scope_uit FROM officials_wedstrijd WHERE wedstrijd_id = ?`).get(w1);
  assert.deepEqual({ ...o }, { scope: 0, scope_uit: 1 });
});

test('refs bevestigen: niet als de bond er al twee toont', async () => {
  const db = zetKlaar();
  const { w1 } = await metWedstrijden(db);
  assert.equal((await refsBevestigen(await ctx(db, 'beheer', { wedstrijd_id: w1 }))).status, 200);
  db._sqlite.exec(`UPDATE officials_wedstrijd SET off_aantal = 2 WHERE wedstrijd_id = ${w1}`);
  assert.equal((await refsBevestigen(await ctx(db, 'beheer', { wedstrijd_id: w1 }))).status, 409);
});

test('kandidaten: een YO valt weg bij J16; een botsing staat erbij', async () => {
  const db = zetKlaar();
  const { w1, w2 } = await metWedstrijden(db);
  db._sqlite.exec(`INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id) VALUES (${w1}, 'plus')`);
  const k = await json(await kandidatenTonen(await ctx(db, 'beheer', null, `https://x/?wedstrijd_id=${w2}`)));
  assert.deepEqual(k.kandidaten.map((x) => x.id), ['plus']);
  assert.equal(k.kandidaten[0].botsingen.length, 1);
});

test('een probleem melden, ook namens een kind; de beheerders krijgen bericht', async () => {
  const db = zetKlaar();
  const { w1 } = await metWedstrijden(db);
  db._sqlite.exec(`INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id) VALUES (${w1}, 'kind')`);
  const mails = await metFetch(async () => {
    const r = await probleemMelden(await ctx(db, 'ouder', { wedstrijd_id: w1, bericht: 'Kim is ziek', namens: 'kind' }));
    assert.equal(r.status, 200);
  });
  assert.deepEqual(mails.map((m) => m.to), ['beheer@x.be']);
  assert.match(mails[0].text, /Kim Kind meldt een probleem/);
  assert.equal(db._sqlite.prepare(`SELECT persoon_id FROM officials_problemen`).get().persoon_id, 'kind');
  assert.equal((await probleemMelden(await ctx(db, 'yo', { wedstrijd_id: w1, bericht: 'kan niet' }))).status, 404);
});
