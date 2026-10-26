// Automatisch aanvullen en de herinneringen (0.35.0, I1 fase 3d).
//
// De regels van het algoritme zoals in YOAssist (test/auto.test.mjs daar),
// plus de routes en geplande taken op de tabellen van TeamAssist. Datums
// relatief tegenover vandaag.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { rechtenVoor } from '../src/lib/rechten-db.js';
import { takenVoorUur } from '../src/lib/planner.js';
import { voerGeplandeTakenUit } from '../src/lib/geplandetaken.js';
import { brusselDatum, plusDagen } from '../src/lib/klok.js';
import { plan } from '../src/officials/autotoewijzing.js';
import { automatischAanvullen } from '../src/officials/aanvullen.js';
import { herinner, weekoverzicht, vulNogIn } from '../src/officials/herinneringen.js';

const seizoen = { code: '2026-27', naam: '2026-2027' };
const dag = (n) => plusDagen(new Date().toISOString().slice(0, 10), n);

// --- het algoritme -----------------------------------------------------------------

const W = (id, over = {}) => ({ id, datum: '2026-11-14', uur: '10:00', accGuid: 'Z', nodig: 2, bezet: 0, ...over });

test('plan: twee plaatsen, alfabetisch bij gelijke stand', () => {
  const r = plan({ wedstrijden: [W(1)], kandidaten: new Map([[1, ['c', 'a', 'b']]]) });
  assert.deepEqual(r.toewijzingen.map((t) => t.persoon_id), ['a', 'b']);
  assert.equal(r.onvolledig.length, 0);
});

test('plan: wie het minst heeft, komt eerst, en het blijft eerlijk', () => {
  let r = plan({ wedstrijden: [W(1, { nodig: 1 })], kandidaten: new Map([[1, ['veel', 'weinig']]]), telling: new Map([['veel', 5], ['weinig', 1]]) });
  assert.equal(r.toewijzingen[0].persoon_id, 'weinig');
  r = plan({
    wedstrijden: [W(1, { nodig: 1 }), W(2, { nodig: 1, uur: '15:00' }), W(3, { nodig: 1, datum: '2026-11-15' })],
    kandidaten: new Map([[1, ['a', 'b']], [2, ['a', 'b']], [3, ['a', 'b']]]),
  });
  const per = Object.fromEntries(['a', 'b'].map((p) => [p, r.toewijzingen.filter((t) => t.persoon_id === p).length]));
  assert.deepEqual([per.a, per.b].sort(), [1, 2], 'twee tegen één, niet drie tegen nul');
});

test('plan: botsingen vermeden, met dezelfde marges als bij handmatig aanduiden', () => {
  let r = plan({ wedstrijden: [W(1, { nodig: 1 }), W(2, { nodig: 1, uur: '11:00' })], kandidaten: new Map([[1, ['a']], [2, ['a']]]) });
  assert.equal(r.toewijzingen.length, 1);
  assert.match(r.onvolledig[0].reden, /botsen/);
  r = plan({ wedstrijden: [W(1, { nodig: 1 }), W(2, { nodig: 1, uur: '14:00' })], kandidaten: new Map([[1, ['a']], [2, ['a']]]) });
  assert.equal(r.toewijzingen.length, 2, 'vier uur ertussen mag');
  r = plan({ wedstrijden: [W(1, { nodig: 1 }), W(2, { nodig: 1, uur: '12:00', accGuid: 'Y' })], kandidaten: new Map([[1, ['a']], [2, ['a']]]) });
  assert.equal(r.toewijzingen.length, 1, 'twee uur naar een andere zaal is te krap');
  r = plan({ wedstrijden: [W(1, { nodig: 1 }), W(2, { nodig: 1, uur: '12:30', accGuid: 'Y' })], kandidaten: new Map([[1, ['a']], [2, ['a']]]) });
  assert.equal(r.toewijzingen.length, 2, 'tweeënhalf uur wel');
});

test('plan: bestaande aanduidingen tellen mee, schaarste eerst', () => {
  let r = plan({
    wedstrijden: [W(1, { nodig: 1 })], kandidaten: new Map([[1, ['a', 'b']]]),
    agenda: new Map([['a', [{ id: 9, datum: '2026-11-14', uur: '11:00', accGuid: 'Z' }]]]),
  });
  assert.equal(r.toewijzingen[0].persoon_id, 'b', 'wie al bezig is, wordt overgeslagen');
  r = plan({ wedstrijden: [W(1, { bezet: 1 })], kandidaten: new Map([[1, ['a', 'b']]]) });
  assert.equal(r.toewijzingen.length, 1, 'een half bezette wedstrijd krijgt er nog één');
  r = plan({
    wedstrijden: [W(1, { nodig: 1 }), W(2, { nodig: 1, datum: '2026-11-15' })],
    kandidaten: new Map([[1, ['a', 'b']], [2, ['a']]]),
  });
  assert.deepEqual(r.toewijzingen.map((t) => [t.id, t.persoon_id]).sort(), [[1, 'b'], [2, 'a']], 'de schaarse eerst');
});

test('plan: zonder kandidaten, reproduceerbaar, en de aanroeper blijft ongemoeid', () => {
  const r = plan({ wedstrijden: [W(1)], kandidaten: new Map() });
  assert.equal(r.onvolledig[0].reden, 'niemand heeft zich beschikbaar gezet');
  assert.equal(r.onvolledig[0].tekort, 2);
  const invoer = () => ({ wedstrijden: [W(1), W(2, { datum: '2026-11-15' })], kandidaten: new Map([[1, ['x', 'y', 'z']], [2, ['y', 'z']]]) });
  assert.deepEqual(plan(invoer()).toewijzingen, plan(invoer()).toewijzingen);
  const telling = new Map([['a', 3]]);
  const agenda = new Map([['a', []]]);
  plan({ wedstrijden: [W(1)], kandidaten: new Map([[1, ['a']]]), telling, agenda });
  assert.equal(telling.get('a'), 3);
  assert.equal(agenda.get('a').length, 0);
});

// --- de databank ---------------------------------------------------------------------

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    UPDATE instellingen SET waarde = 'normaal' WHERE sleutel = 'bericht_modus';
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd, officials) VALUES
      ('T12', '2026-27', 'Bears G12 A', 'G12', 0, 1), ('T16', '2026-27', 'Bears J16 A', 'J16', 0, 1);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('ann', 'Ann', 'Aerts', 'ann@x.be'), ('bert', 'Bert', 'Bosmans', 'bert@x.be'),
      ('cis', 'Cis', 'Claes', 'cis@x.be'), ('baas', 'Bea', 'Baas', 'baas@x.be'),
      ('weg', 'Wim', 'Weg', 'weg@x.be');
    UPDATE personen SET actief = 0 WHERE id = 'weg';
    INSERT INTO rollen (persoon_id, rol) VALUES
      ('ann', 'YO'), ('bert', 'YOPLUS'), ('cis', 'YOPLUS'), ('baas', 'YOADM'), ('weg', 'YOPLUS');
  `);
  return db;
}

let nr = 0;
/** Een thuiswedstrijd in de lijst; geeft het id. */
function wed(db, { team = 'T12', cat = 'G12', datum = dag(3), uur = '10:00', scope = 1, off = 0, forfait = null, zaal = 'Z1' } = {}) {
  nr += 1;
  db._sqlite.exec(`
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander, locatie_tekst, vbl_acc_guid)
    VALUES ('W${nr}', '${team}', '2026-27', '${datum}', '${uur}', 1, 'Tienen', 'Sporthal', '${zaal}');
  `);
  const id = db._sqlite.prepare(`SELECT id FROM wedstrijden WHERE wedstrijd_guid = ?`).get(`W${nr}`).id;
  db._sqlite.exec(`INSERT INTO officials_wedstrijd (wedstrijd_id, cat_code, scope, off_aantal, forfait)
                   VALUES (${id}, '${cat}', ${scope}, ${off}, ${forfait ? `'${forfait}'` : 'NULL'})`);
  return id;
}
const ja = (db, persoon, id, status = 'ja') =>
  db._sqlite.exec(`INSERT INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status) VALUES ('${persoon}', ${id}, '${status}')`);
const aangeduid = (db, persoon, id) =>
  db._sqlite.exec(`INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, toegewezen_door) VALUES (${id}, '${persoon}', 'baas')`);
const op = (db, id) =>
  db._sqlite.prepare(`SELECT persoon_id, toegewezen_door FROM officials_aanduidingen WHERE wedstrijd_id = ? AND status = 'toegewezen' ORDER BY persoon_id`).all(id);

async function ctx(db, persoonId, body) {
  return {
    db, env: { RESEND_API_KEY: 'x' }, seizoen, persoon: { id: persoonId },
    rechten: await rechtenVoor(db, persoonId, seizoen.code),
    request: new Request('https://x/', { method: 'POST', body: JSON.stringify(body ?? {}) }),
  };
}

async function metMails(fn) {
  const mails = [];
  const oude = globalThis.fetch;
  globalThis.fetch = async (url, opties) => {
    mails.push(JSON.parse(opties.body));
    return new Response('{"id":"m"}', { status: 200 });
  };
  let uit;
  try {
    uit = await fn();
  } finally {
    globalThis.fetch = oude;
  }
  return { mails, uit };
}
const json = async (res) => ({ status: res.status, ...(await res.json()) });

// --- automatisch aanvullen ---------------------------------------------------------------

test('aanvullen: een droogloop verandert niets en verstuurt niets', async () => {
  const db = zetKlaar();
  const id = wed(db);
  ja(db, 'ann', id);
  ja(db, 'bert', id);
  const { mails, uit } = await metMails(async () => json(await automatischAanvullen(await ctx(db, 'baas', {}))));
  assert.equal(uit.aantal_toegewezen, 2);
  assert.equal(uit.uitgevoerd, false);
  assert.deepEqual(uit.toewijzingen.map((t) => t.naam).sort(), ['Ann Aerts', 'Bert Bosmans']);
  assert.deepEqual(op(db, id), []);
  assert.equal(mails.length, 0);
});

test('aanvullen: uitvoeren schrijft weg, logt en verwittigt; een tweede run vindt niets meer', async () => {
  const db = zetKlaar();
  const id = wed(db);
  ja(db, 'ann', id);
  ja(db, 'bert', id);
  const { mails, uit } = await metMails(async () => json(await automatischAanvullen(await ctx(db, 'baas', { uitvoeren: true }))));
  assert.equal(uit.uitgevoerd, true);
  assert.deepEqual(op(db, id).map((x) => [x.persoon_id, x.toegewezen_door]), [['ann', 'baas'], ['bert', 'baas']]);
  assert.deepEqual(mails.map((m) => m.to).sort(), ['ann@x.be', 'bert@x.be'], 'zoals bij handmatig aanduiden');
  assert.match(mails[0].subject, /^Aangeduid:/);
  assert.ok(db._sqlite.prepare(`SELECT 1 FROM logboek WHERE wat LIKE 'automatisch aangevuld%'`).get());
  const nog = await json(await automatischAanvullen(await ctx(db, 'baas', { uitvoeren: true })));
  assert.equal(nog.aantal_toegewezen, 0);
});

test('aanvullen: een YO enkel U10/U12, inactief, forfait, buiten de lijst en de bond tellen mee', async () => {
  const db = zetKlaar();
  const u16 = wed(db, { team: 'T16', cat: 'J16' });
  ja(db, 'ann', u16);
  ja(db, 'bert', u16);
  ja(db, 'weg', u16);
  const forfait = wed(db, { datum: dag(4), forfait: 'uit' });
  ja(db, 'cis', forfait);
  const buiten = wed(db, { datum: dag(5), scope: 0 });
  ja(db, 'cis', buiten);
  const bond = wed(db, { datum: dag(6), off: 1 });
  ja(db, 'ann', bond);
  ja(db, 'cis', bond);

  const r = await json(await automatischAanvullen(await ctx(db, 'baas', {})));
  const per = (id) => r.toewijzingen.filter((t) => t.wedstrijd_id === id).map((t) => t.persoon_id);
  assert.deepEqual(per(u16), ['bert'], 'Ann is YO, Wim staat op inactief');
  assert.deepEqual(per(forfait), []);
  assert.deepEqual(per(buiten), []);
  assert.equal(per(bond).length, 1, 'de bond heeft er al één: nog één plaats');
  assert.equal(r.onvolledig.find((o) => o.wedstrijd_id === u16).tekort, 1);
  assert.match(r.onvolledig.find((o) => o.wedstrijd_id === u16).wedstrijd, /J16 A/);
});

test('aanvullen: wat een beheerder zette, blijft staan, en de botsing met een bestaande aanduiding telt', async () => {
  const db = zetKlaar();
  const id = wed(db);
  aangeduid(db, 'cis', id);
  ja(db, 'ann', id);
  ja(db, 'bert', id);
  const later = wed(db, { uur: '11:00' });
  aangeduid(db, 'ann', later);
  const r = await json(await automatischAanvullen(await ctx(db, 'baas', { uitvoeren: true })));
  assert.equal(r.aantal_toegewezen, 1);
  assert.deepEqual(op(db, id).map((x) => x.persoon_id), ['bert', 'cis'], 'Ann botst om 11 uur');
});

// --- herinneringen -------------------------------------------------------------------

test('herinnering de avond ervoor: één bericht per persoon, volgens de voorkeur, geen forfait', async () => {
  const db = zetKlaar();
  const morgen = plusDagen(brusselDatum(), 1);
  const a = wed(db, { datum: morgen, uur: '10:00' });
  const b = wed(db, { datum: morgen, uur: '14:00' });
  const f = wed(db, { datum: morgen, uur: '16:00', forfait: 'thuis' });
  const vandaag = wed(db, { datum: brusselDatum(), uur: '18:00' });
  aangeduid(db, 'bert', a);
  aangeduid(db, 'bert', b);
  aangeduid(db, 'cis', a);
  aangeduid(db, 'ann', f);
  aangeduid(db, 'ann', vandaag);
  db._sqlite.exec(`INSERT INTO officials_voorkeuren (persoon_id, herinner_avond) VALUES ('cis', 0)`);
  db._sqlite.exec(`INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, status) VALUES (${b}, 'ann', 'vrijgegeven')`);

  const { mails, uit } = await metMails(async () => herinner(await ctx(db, 'baas'), { avond: true }));
  assert.equal(uit.dag, morgen);
  assert.deepEqual(mails.map((m) => m.to), ['bert@x.be'], 'Cis wil niet, Ann staat enkel op een forfait of is vrijgegeven');
  assert.match(mails[0].subject, /2 wedstrijden/);
  assert.match(mails[0].text, /Morgen moet je fluiten[\s\S]*09:40[\s\S]*13:40/);

  const ochtend = await metMails(async () => herinner(await ctx(db, 'baas'), { avond: false }));
  assert.deepEqual(ochtend.mails.map((m) => m.to), ['ann@x.be']);
  assert.match(ochtend.mails[0].text, /Vandaag moet je fluiten/);
});

test('weekoverzicht: wat de komende week nog open staat, naar de beheerders', async () => {
  const db = zetKlaar();
  const open = wed(db, { datum: dag(2) });
  aangeduid(db, 'bert', open);
  wed(db, { team: 'T16', cat: 'J16', datum: dag(3), off: 1 });
  const vol = wed(db, { datum: dag(4) });
  aangeduid(db, 'ann', vol);
  aangeduid(db, 'cis', vol);
  wed(db, { datum: dag(10) });
  const { mails, uit } = await metMails(async () => weekoverzicht(await ctx(db, 'baas')));
  assert.equal(uit.open, 2);
  assert.deepEqual(mails.map((m) => m.to), ['baas@x.be']);
  assert.match(mails[0].text, /U10\/U12 \(1\):[\s\S]*nog 1 nodig[\s\S]*Overige \(1\):[\s\S]*J16 A[\s\S]*nog 1 nodig/);
});

test('vul nog in: enkel wie niets antwoordde, voor wat hij kan zien', async () => {
  const db = zetKlaar();
  const za = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10); })();
  const u12 = wed(db, { datum: za });
  const u16 = wed(db, { team: 'T16', cat: 'J16', datum: plusDagen(za, 1) });
  const anderWeekend = wed(db, { datum: plusDagen(za, 7) });
  ja(db, 'cis', u16, 'nee');
  ja(db, 'ann', anderWeekend);

  const { mails, uit } = await metMails(async () => json(await vulNogIn(await ctx(db, 'baas', { zaterdag: za }))));
  assert.equal(uit.aantal, 2, 'Ann (YO, voor de U12) en Bert; Cis antwoordde al, nee telt ook');
  assert.deepEqual(mails.map((m) => m.to).sort(), ['ann@x.be', 'bert@x.be']);
  const naarAnn = mails.find((m) => m.to === 'ann@x.be').text;
  assert.match(naarAnn, /G12 A/);
  assert.doesNotMatch(naarAnn, /J16 A/, 'een YO hoeft niet te antwoorden voor een U16');
  assert.ok(db._sqlite.prepare(`SELECT 1 FROM logboek WHERE wie = 'baas' AND wat LIKE 'herinnering%' AND details LIKE '%Ann Aerts%'`).get());

  ja(db, 'ann', u12);
  ja(db, 'bert', u12);
  const iedereen = await json(await vulNogIn(await ctx(db, 'baas', { zaterdag: za })));
  assert.equal(iedereen.aantal, 0);
  assert.match(iedereen.boodschap, /Iedereen heeft al geantwoord/);

  assert.equal((await vulNogIn(await ctx(db, 'baas', {}))).status, 400);
  assert.equal((await vulNogIn(await ctx(db, 'baas', { zaterdag: '14/11' }))).status, 400);
  assert.equal((await vulNogIn(await ctx(db, 'baas', { zaterdag: plusDagen(za, 14) }))).status, 404);
});

test('rechten: enkel wie de officials beheert', async () => {
  const db = zetKlaar();
  assert.equal((await rechtenVoor(db, 'bert', seizoen.code)).mag('officials.beheren'), false);
  assert.equal((await rechtenVoor(db, 'baas', seizoen.code)).mag('officials.beheren'), true);
});

test('de planner, en de afscherming tot de overstap', async () => {
  assert.ok(takenVoorUur(19, 2).includes('herinnering-avond'));
  assert.ok(takenVoorUur(7, 6).includes('herinnering-ochtend'));
  assert.ok(takenVoorUur(8, 1).includes('weekoverzicht'));
  assert.ok(!takenVoorUur(8, 2).includes('weekoverzicht'));

  const db = zetKlaar();
  const id = wed(db, { datum: plusDagen(brusselDatum(), 1) });
  aangeduid(db, 'bert', id);
  let r = await metMails(() => voerGeplandeTakenUit(['herinnering-avond'], db, { RESEND_API_KEY: 'x' }));
  assert.equal(r.mails.length, 0, 'standaard uit');
  db._sqlite.exec(`INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES ('officials_automatisch', '1')`);
  r = await metMails(() => voerGeplandeTakenUit(['herinnering-avond'], db, { RESEND_API_KEY: 'x' }));
  assert.deepEqual(r.mails.map((m) => m.to), ['bert@x.be']);
  assert.equal(db._sqlite.prepare(`SELECT status FROM taak_runs WHERE taak = 'herinnering-avond'`).get().status, 'ok');
});
