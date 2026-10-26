// De rest van de module Officials (0.37.0, I1 fase 3f): Regio, forfait,
// agendafeed en externe API, en PV's en coaches. Dezelfde regels als in
// YOAssist (V31, V34, V40–V42), op de tabellen van TeamAssist. Datums
// relatief tegenover vandaag.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { rechtenVoor } from '../src/lib/rechten-db.js';
import { takenVoorUur } from '../src/lib/planner.js';
import { voerGeplandeTakenUit } from '../src/lib/geplandetaken.js';
import { plusDagen } from '../src/lib/klok.js';
import worker, { doorverwijzingVoor } from '../src/index.js';
import {
  leesVolgWedstrijden, leesClubNaam, synchroniseerVolgClubs, volgClubToevoegen, volgClubWeg, regioTonen, regioLeegmaken,
} from '../src/officials/regio.js';
import { verwerkForfaits } from '../src/officials/forfait.js';
import { externeAanduidingen, kalender, agendaLink, initialen } from '../src/officials/extern.js';
import { verwittigPloegen } from '../src/officials/ploegtekort.js';
import { komendWeekend } from '../src/officials/woensdag.js';

const seizoen = { code: '2026-27', naam: '2026-2027' };
const vandaag = new Date().toISOString().slice(0, 10);
const dag = (n) => plusDagen(vandaag, n);
const vblDatum = (iso) => iso.split('-').reverse().join('-');

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    UPDATE instellingen SET waarde = 'normaal' WHERE sleutel = 'bericht_modus';
    INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES ('club_guid', 'BVBL1125'), ('clubnaam', 'Leuven Bears');
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd, officials) VALUES
      ('T12', '2026-27', 'Bears G12 A', 'G12', 1, 1), ('T16', '2026-27', 'Bears J16 A', 'J16', 1, 1),
      ('T08', '2026-27', 'Bears G08 A', 'G08', 1, 1);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('ann', 'Ann', 'Aerts', 'ann@x.be'), ('bert', 'Bert', 'Bosmans', 'bert@x.be'),
      ('baas', 'Bea', 'Baas', 'baas@x.be'), ('pv', 'Paul', 'Ploeg', 'pv@x.be'),
      ('coach', 'Cora', 'Coach', 'coach@x.be'), ('kind', 'Kim', 'Kind', NULL), ('ouder', 'Olga', 'Kind', 'olga@x.be');
    INSERT INTO rollen (persoon_id, rol) VALUES ('ann', 'YO'), ('bert', 'YOPLUS'), ('baas', 'YOADM'), ('kind', 'YO');
    INSERT INTO rollen (persoon_id, rol, team_guid, seizoen) VALUES
      ('pv', 'PLOEGV', 'T16', '2026-27'), ('pv', 'PLOEGV', 'T12', '2026-27'), ('coach', 'COACH', 'T16', '2026-27');
    INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('ouder', 'kind');
  `);
  return db;
}

let nr = 0;
function wed(db, { team = 'T12', cat = 'G12', datum = dag(3), uur = '10:00', scope = 1, off = 0, forfait = null, officials = [] } = {}) {
  nr += 1;
  db._sqlite.exec(`
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander, locatie_tekst)
      VALUES ('W${nr}', '${team}', '2026-27', '${datum}', '${uur}', 1, 'Tienen', 'Sporthal');
    INSERT INTO officials_wedstrijd (wedstrijd_id, cat_code, scope, off_aantal, forfait)
      SELECT id, '${cat}', ${scope}, ${off}, ${forfait ? `'${forfait}'` : 'NULL'} FROM wedstrijden WHERE wedstrijd_guid = 'W${nr}';
  `);
  const id = db._sqlite.prepare(`SELECT id FROM wedstrijden WHERE wedstrijd_guid = ?`).get(`W${nr}`).id;
  for (const p of officials) {
    db._sqlite.exec(`INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, toegewezen_door) VALUES (${id}, '${p}', 'baas')`);
  }
  return id;
}

async function ctx(db, persoonId, { body, url = 'https://x/', headers = {} } = {}) {
  return {
    db, env: { RESEND_API_KEY: 'x', EXTERN_API_SLEUTEL: 'geheim-sleutel' }, seizoen, persoon: { id: persoonId },
    rechten: persoonId ? await rechtenVoor(db, persoonId, seizoen.code) : null,
    request: new Request(url, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, headers }),
  };
}
const json = async (res) => ({ status: res.status, ...(await res.json()) });

/** Vangt de mails op, en antwoordt op VBL-oproepen per club. */
async function metFetch(fn, vbl = {}) {
  const mails = [];
  const oude = globalThis.fetch;
  globalThis.fetch = async (url, opties) => {
    if (String(url).includes('resend.com')) {
      mails.push(JSON.parse(opties.body));
      return new Response('{"id":"m"}', { status: 200 });
    }
    const club = new URL(url).searchParams.get('issguid');
    const antwoord = vbl[club];
    if (antwoord instanceof Error) return new Response('kapot', { status: 500 });
    return new Response(JSON.stringify(antwoord ?? []), { status: 200 });
  };
  let uit;
  try {
    uit = await fn();
  } finally {
    globalThis.fetch = oude;
  }
  return { mails, uit };
}

const rec = (guid, cat, datum, over = {}) => ({
  guid, tTGUID: `BVBL9999${cat}  1`, tTNaam: `Andere ${cat} A`, tUGUID: 'BVBL1125J16  1', tUNaam: 'Bears',
  datumString: vblDatum(datum), beginTijd: '14.00', wedOff: [], ...over,
});

// --- Regio ---------------------------------------------------------------------

test('Regio: enkel thuis, vanaf U14, wat nog komt, en een naam enkel bij één ref', () => {
  const r = leesVolgWedstrijden([
    rec('A', 'J16', dag(3), { wedOff: ['Jan Ref'] }),
    rec('B', 'G12', dag(3)),
    rec('C', 'G08', dag(3)),
    rec('D', 'J16', dag(-1)),
    rec('E', 'J16', dag(3), { beginTijd: '00.00' }),
    rec('F', 'J16', dag(3), { tTGUID: 'BVBL1125J16  1' }),
    rec('G', 'HSE', dag(4), { wedOff: ['X', 'Y'] }),
  ], 'BVBL9999', vandaag);
  assert.deepEqual(r.map((w) => [w.guid, w.cat_code, w.vbl_aantal, w.vbl_naam]), [['A', 'J16', 1, 'Jan Ref'], ['G', 'HSE', 2, null]]);
  assert.equal(r[0].thuis_naam, 'Andere J16 A');
  assert.equal(leesClubNaam({ data: [{ orgGUID: 'BVBL9999', orgNaam: 'Andere Club' }] }), 'Andere Club');
});

test('Regio: de synchronisatie werkt bij, ruimt op, laat de woensdaglijst staan, en één kapotte club houdt de rest niet tegen', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`INSERT INTO officials_volg_clubs (guid, naam, toegevoegd_door) VALUES ('BVBL9999', 'Andere', 'baas'), ('BVBL8888', 'Kapot', 'baas')`);
  const { uit } = await metFetch(() => synchroniseerVolgClubs(db), {
    BVBL9999: [rec('A', 'J16', dag(3)), rec('B', 'J18', dag(4)), rec('C', 'J21', dag(5))],
    BVBL8888: new Error('stuk'),
  });
  assert.deepEqual([uit.clubs, uit.gevonden, uit.fouten.length], [2, 3, 1]);

  db._sqlite.exec(`UPDATE officials_volg_wedstrijden SET bond_officials = 0 WHERE guid IN ('A', 'B')`);
  await metFetch(() => synchroniseerVolgClubs(db), {
    BVBL9999: [rec('A', 'J16', dag(3), { wedOff: ['Jan'] }), rec('B', 'J18', dag(4), { beginTijd: '16.00' })],
  });
  const rijen = Object.fromEntries(db._sqlite.prepare(`SELECT guid, bond_officials, vbl_aantal FROM officials_volg_wedstrijden`).all().map((x) => [x.guid, x]));
  assert.equal(rijen.A.bond_officials, 0, 'zelfde moment: wat de lijst zei, blijft');
  assert.equal(rijen.A.vbl_aantal, 1);
  assert.equal(rijen.B.bond_officials, null, 'verschoven: weer de API');
  assert.ok(!rijen.C, 'niet meer gezien: weg');
});

test('Regio: clubs volgen, tonen (het hoogste van API en lijst), leegmaken met droogloop', async () => {
  const db = zetKlaar();
  assert.equal((await volgClubToevoegen(await ctx(db, 'baas', { body: { guid: 'geen guid' } }))).status, 400);
  assert.equal((await volgClubToevoegen(await ctx(db, 'baas', { body: { guid: 'bvbl1125' } }))).status, 400, 'de eigen club');
  const { uit } = await metFetch(async () => json(await volgClubToevoegen(await ctx(db, 'baas', { body: { guid: 'bvbl9999' } }))), {
    BVBL9999: { data: [{ orgNaam: 'Andere Club' }] },
  });
  assert.deepEqual([uit.guid, uit.naam], ['BVBL9999', 'Andere Club']);
  assert.equal((await volgClubToevoegen(await ctx(db, 'baas', { body: { guid: 'BVBL9999' } }))).status, 409);

  db._sqlite.exec(`
    INSERT INTO officials_volg_wedstrijden (guid, club_guid, club_naam, thuis_naam, uit_naam, datum, uur, cat_code, vbl_aantal, vbl_naam, bond_officials) VALUES
      ('NUL', 'BVBL9999', 'Andere Club', 'A', 'B', '${dag(2)}', '10:00', 'J16', 0, NULL, NULL),
      ('EEN', 'BVBL9999', 'Andere Club', 'A', 'B', '${dag(2)}', '12:00', 'J16', 1, 'Jan', 0),
      ('LIJST2', 'BVBL9999', 'Andere Club', 'A', 'B', '${dag(2)}', '14:00', 'J16', 0, NULL, 2),
      ('VER', 'BVBL9999', 'Andere Club', 'A', 'B', '${dag(20)}', '14:00', 'J16', 0, NULL, NULL);
  `);
  const r = await json(await regioTonen(await ctx(db, 'baas')));
  assert.deepEqual(r.wedstrijden.map((w) => [w.guid, w.refs, w.bron, w.naam]), [['NUL', 0, 'api', null], ['EEN', 1, 'lijst', 'Jan']]);

  const droog = await json(await regioLeegmaken(await ctx(db, 'baas', { body: {} })));
  assert.deepEqual([droog.droogloop, droog.zou_wissen], [true, 4]);
  assert.equal(db._sqlite.prepare(`SELECT COUNT(*) AS n FROM officials_volg_wedstrijden`).get().n, 4);
  await regioLeegmaken(await ctx(db, 'baas', { body: { uitvoeren: true } }));
  assert.equal(db._sqlite.prepare(`SELECT COUNT(*) AS n FROM officials_volg_wedstrijden`).get().n, 0);
  assert.equal(db._sqlite.prepare(`SELECT COUNT(*) AS n FROM officials_volg_clubs`).get().n, 1, 'de clubs blijven');

  db._sqlite.exec(`INSERT INTO officials_volg_wedstrijden (guid, club_guid, thuis_naam, uit_naam, datum, uur) VALUES ('X', 'BVBL9999', 'A', 'B', '${dag(2)}', '10:00')`);
  await volgClubWeg(await ctx(db, 'baas', { body: { guid: 'BVBL9999' } }));
  assert.equal(db._sqlite.prepare(`SELECT COUNT(*) AS n FROM officials_volg_wedstrijden`).get().n, 0, 'de wedstrijden gaan mee');
});

// --- forfait ------------------------------------------------------------------------

test('forfait: vooraf gekend wordt vrijgegeven met een bericht; op de dag zelf enkel gemeld', async () => {
  const db = zetKlaar();
  const later = wed(db, { datum: dag(3), forfait: 'uit', officials: ['ann'] });
  const vandaagW = wed(db, { datum: vandaag, forfait: 'thuis', officials: ['bert'] });
  const leeg = wed(db, { datum: dag(4), forfait: 'uit' });
  const { mails, uit } = await metFetch(() => verwerkForfaits({ db, env: { RESEND_API_KEY: 'x' } }, [{ id: later }, { id: vandaagW }, { id: leeg }]));
  assert.deepEqual([uit.vrijgegeven.length, uit.teBekijken.length], [1, 1]);
  const status = (id, p) => db._sqlite.prepare(`SELECT status FROM officials_aanduidingen WHERE wedstrijd_id = ? AND persoon_id = ?`).get(id, p).status;
  assert.equal(status(later, 'ann'), 'vrijgegeven');
  assert.equal(status(vandaagW, 'bert'), 'toegewezen', 'de official kan al ter plaatse geweest zijn');
  assert.match(mails.find((m) => m.to === 'ann@x.be').subject, /Gaat niet door \(forfait\)/);
  assert.equal(mails.filter((m) => m.to === 'bert@x.be').length, 0);
  assert.match(mails.find((m) => m.to === 'baas@x.be').text, /Automatisch vrijgegeven[\s\S]*Zelf te bekijken/);
});

test("forfait: met 'melden' blijft alles staan; voorbij in een afgesloten maand: niets", async () => {
  const db = zetKlaar();
  db._sqlite.exec(`INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES ('forfait_aanduiding', 'melden')`);
  const later = wed(db, { datum: dag(3), forfait: 'uit', officials: ['ann'] });
  const oud = wed(db, { datum: '2026-09-12', forfait: 'uit', officials: ['bert'] });
  db._sqlite.exec(`INSERT INTO officials_maanden (maand, seizoen, afgesloten_door) VALUES ('2026-09', '2026-27', 'baas')`);
  const { uit } = await metFetch(() => verwerkForfaits({ db, env: { RESEND_API_KEY: 'x' } }, [{ id: later }, { id: oud }]));
  assert.deepEqual([uit.vrijgegeven.length, uit.teBekijken.map((x) => x.id)], [0, [later]]);
});

// --- van buitenaf -----------------------------------------------------------------

test('externe API: enkel met de juiste sleutel, initialen tenzij volledig ingesteld', async () => {
  const db = zetKlaar();
  wed(db, { datum: dag(2), officials: ['ann'] });
  wed(db, { datum: dag(-2), officials: ['bert'] });
  wed(db, { datum: dag(3), scope: 0 });
  assert.equal((await externeAanduidingen(await ctx(db, null))).status, 401);
  assert.equal((await externeAanduidingen(await ctx(db, null, { headers: { authorization: 'Bearer fout-sleutel-xx' } }))).status, 401);
  const goed = { headers: { authorization: 'Bearer geheim-sleutel' } };
  let r = await json(await externeAanduidingen(await ctx(db, null, goed)));
  assert.deepEqual(r.wedstrijden.map((w) => [w.wedstrijd, w.officials, w.club]), [['Bears G12 A - Tienen', ['A.A.'], 'Leuven Bears']]);
  db._sqlite.exec(`INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES ('extern_namen', 'volledig')`);
  r = await json(await externeAanduidingen(await ctx(db, null, goed)));
  assert.deepEqual(r.wedstrijden[0].officials, ['Ann Aerts']);
  assert.equal(initialen('ann', ''), 'A.');
});

test('agenda: een link per persoon, vernieuwen maakt de oude ongeldig, ook voor een kind', async () => {
  const db = zetKlaar();
  wed(db, { datum: dag(2), uur: '10:30', officials: ['ann'] });
  wed(db, { datum: dag(3), officials: ['bert'] });
  wed(db, { datum: dag(4), officials: ['kind'] });

  const a = await json(await agendaLink(await ctx(db, 'ann', { body: {} })));
  const nog = await json(await agendaLink(await ctx(db, 'ann', { body: {} })));
  assert.equal(nog.pad, a.pad, 'de bestaande link');
  const ics = await (await kalender({ db, request: new Request(`https://x${a.pad}`) })).text();
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, new RegExp(`DTSTART;TZID=Europe/Brussels:${dag(2).replace(/-/g, '')}T103000`));
  assert.match(ics, /BEGIN:VTIMEZONE/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1, 'enkel de eigen aanduiding');

  const n = await json(await agendaLink(await ctx(db, 'ann', { body: { vernieuw: true } })));
  assert.notEqual(n.pad, a.pad);
  assert.equal((await kalender({ db, request: new Request(`https://x${a.pad}`) })).status, 404);
  assert.equal((await kalender({ db, request: new Request('https://x/api/kalender/kort.ics') })).status, 404);

  assert.equal((await agendaLink(await ctx(db, 'baas', { body: {} }))).status, 403, 'geen Youth Official');
  const k = await json(await agendaLink(await ctx(db, 'ouder', { body: { namens: 'kind' } })));
  const ki = await (await kalender({ db, request: new Request(`https://x${k.pad}`) })).text();
  assert.equal((ki.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.equal((await agendaLink(await ctx(db, 'bert', { body: { namens: 'kind' } }))).status, 403);
});

test('de Worker: de agendafeed op een prefix zonder aanmelden, en yoassist.org stuurt door behalve kalender en extern', async () => {
  const db = zetKlaar();
  const res = await worker.fetch(new Request('https://teamassist.clubassist.org/api/kalender/onbestaande-sleutel-123.ics'), { DB: db }, {});
  assert.equal(res.status, 404);
  assert.match((await res.json()).fout, /agendalink/);
  assert.equal(doorverwijzingVoor(new URL('https://yoassist.org/?open=berichten')), 'https://teamassist.clubassist.org/?open=berichten');
  assert.equal(doorverwijzingVoor(new URL('https://www.yoassist.org/api/mij')), 'https://teamassist.clubassist.org/api/mij');
  assert.equal(doorverwijzingVoor(new URL('https://yoassist.org/api/kalender/abc.ics')), null);
  assert.equal(doorverwijzingVoor(new URL('https://yoassist.org/api/extern/aanduidingen')), null);
  assert.equal(doorverwijzingVoor(new URL('https://teamassist.clubassist.org/')), null);
  const r = await worker.fetch(new Request('https://yoassist.org/'), { DB: db }, {});
  assert.equal(r.status, 301);
});

// --- PV's en coaches -----------------------------------------------------------------

test("PV's en coaches: één bericht per persoon, enkel bij te weinig, woensdag anders dan donderdag", async () => {
  const db = zetKlaar();
  const [za, zo] = komendWeekend(new Date());
  wed(db, { team: 'T16', cat: 'J16', datum: za, off: 1, scope: 0 });
  wed(db, { team: 'T12', datum: zo, officials: ['ann'] });
  wed(db, { team: 'T16', cat: 'J16', datum: zo, uur: '16:00', off: 2 });
  wed(db, { team: 'T16', cat: 'J16', datum: zo, uur: '18:00', forfait: 'uit' });
  wed(db, { team: 'T08', cat: 'G08', datum: za });

  const c = await ctx(db, null);
  const { mails, uit } = await metFetch(() => verwittigPloegen(c, 'woensdag'));
  assert.deepEqual([uit.wedstrijden, uit.ontvangers], [2, 2]);
  const naarPv = mails.filter((m) => m.to === 'pv@x.be');
  assert.equal(naarPv.length, 1, 'PV van twee ploegen: één bericht');
  assert.match(naarPv[0].text, /J16 A[\s\S]*nog 1 scheidsrechter nodig[\s\S]*G12 A[\s\S]*nog 1 scheidsrechter nodig/);
  assert.match(naarPv[0].text, /Je hoeft nu niets te doen[\s\S]*Bea Baas \(baas@x\.be\)/);
  assert.match(mails.find((m) => m.to === 'coach@x.be').text, /J16 A/);
  assert.doesNotMatch(mails.find((m) => m.to === 'coach@x.be').text, /G12 A/);

  db._sqlite.exec(`UPDATE officials_wedstrijd SET refs_bevestigd = 1 WHERE wedstrijd_id IN (SELECT id FROM wedstrijden WHERE team_guid = 'T16')`);
  const don = await metFetch(() => verwittigPloegen(c, 'donderdag'));
  assert.deepEqual(don.mails.map((m) => m.to), ['pv@x.be']);
  assert.match(don.mails[0].text, /Kan iemand van de ploeg inspringen/);
});

test('de planner, en de afscherming tot de overstap', async () => {
  assert.ok(takenVoorUur(5, 2).includes('regio'));
  assert.ok(takenVoorUur(20, 3).includes('ploegen-woensdag'));
  assert.ok(takenVoorUur(20, 3).indexOf('ploegen-woensdag') > takenVoorUur(20, 3).indexOf('woensdag-terugval'));
  assert.ok(takenVoorUur(20, 4).includes('ploegen-donderdag'));

  const db = zetKlaar();
  const [za] = komendWeekend(new Date());
  wed(db, { team: 'T16', cat: 'J16', datum: za });
  let r = await metFetch(() => voerGeplandeTakenUit(['ploegen-woensdag'], db, { RESEND_API_KEY: 'x' }));
  assert.equal(r.mails.length, 0, 'standaard uit');
  db._sqlite.exec(`INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES ('officials_automatisch', '1')`);
  r = await metFetch(() => voerGeplandeTakenUit(['ploegen-woensdag'], db, { RESEND_API_KEY: 'x' }));
  assert.deepEqual(r.mails.map((m) => m.to).sort(), ['coach@x.be', 'pv@x.be']);

  db._sqlite.exec(`INSERT INTO officials_volg_clubs (guid, naam, toegevoegd_door) VALUES ('BVBL9999', 'Andere', 'baas')`);
  await metFetch(() => voerGeplandeTakenUit(['regio'], db, {}), { BVBL9999: [rec('A', 'J16', dag(3))] });
  assert.equal(db._sqlite.prepare(`SELECT COUNT(*) AS n FROM officials_volg_wedstrijden`).get().n, 1, 'Regio loopt altijd');
});

test('forfait via de synchronisatie: pas vrijgegeven na de overstap', async () => {
  const { officialsSync } = await import('../src/officials/sync-route.js');
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander)
      VALUES ('BVBL2627F1', 'T16', '2026-27', '${dag(5)}', '10:00', 1, 'Tienen');
    INSERT INTO officials_wedstrijd (wedstrijd_id, cat_code, scope) SELECT id, 'J16', 1 FROM wedstrijden WHERE wedstrijd_guid = 'BVBL2627F1';
    INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, toegewezen_door) SELECT id, 'bert', 'baas' FROM wedstrijden WHERE wedstrijd_guid = 'BVBL2627F1';
  `);
  const record = {
    guid: 'BVBL2627F1', tTGUID: 'T16', tUNaam: 'Tienen', datumString: vblDatum(dag(5)), beginTijd: '10.00',
    wedOff: [], gespeeld: 'N', uitslag: ' 20-  0  BFOR',
  };
  const sync = async () => {
    const oude = globalThis.fetch;
    const mails = [];
    globalThis.fetch = async (url, o) => {
      if (String(url).includes('resend.com')) { mails.push(JSON.parse(o.body)); return new Response('{}'); }
      return new Response(JSON.stringify([record]));
    };
    try {
      await officialsSync(await ctx(db, 'baas', { url: 'https://x/?uitvoeren=1' }));
    } finally {
      globalThis.fetch = oude;
    }
    return mails;
  };
  const status = () => db._sqlite.prepare(`SELECT status FROM officials_aanduidingen WHERE persoon_id = 'bert'`).get().status;

  let mails = await sync();
  assert.equal(status(), 'toegewezen', 'standaard uit: YOAssist doet het nog');
  assert.equal(mails.length, 0);

  db._sqlite.exec(`UPDATE officials_wedstrijd SET forfait = NULL; INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES ('officials_automatisch', '1')`);
  mails = await sync();
  assert.equal(status(), 'vrijgegeven');
  assert.ok(mails.some((m) => m.to === 'bert@x.be' && /forfait/.test(m.subject)));
});
