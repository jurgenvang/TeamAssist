// De woensdagregel en de woensdaglijst van de bond (0.34.0, I1 fase 3c).
//
// Dezelfde scenario's als in YOAssist (test/woensdaglijst.test.mjs daar), op
// de tabellen van TeamAssist. Datums rekenen vanaf de eerstvolgende woensdag.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { rechtenVoor } from '../src/lib/rechten-db.js';
import { takenVoorUur } from '../src/lib/planner.js';
import { voerGeplandeTakenUit } from '../src/lib/geplandetaken.js';
import worker from '../src/index.js';
import { leesMail, adresUit, gecodeerdeWoorden } from '../src/officials/mime.js';
import { pakUit, leesXlsx } from '../src/officials/xlsx.js';
import {
  leesLijst, koppel, lijstDatum, lijstUur, naamSleutel, woensdagVoor, voorbijMoment,
  ontvangMail, woensdagOm14, woensdagTerugval, herkenMail, avondcontrole,
} from '../src/officials/woensdaglijst.js';
import { komendWeekend } from '../src/officials/woensdag.js';
import { woensdaglijstTonen } from '../src/officials/woensdaglijst-route.js';
import {
  WOENSDAG, isoDag, ZA, ZO, alsLijst, VOOR_14, NA_14, LINK, KOP, bouwXlsx, bouwMail,
} from './woensdaglijst-hulp.mjs';

const SEIZOEN = '2026-27';
const B = 'AB InBev Leuven Bears';
const OM_14 = new Date(`${isoDag(WOENSDAG)}T12:00:00Z`);
const OM_20 = new Date(`${isoDag(WOENSDAG)}T18:00:00Z`);

function nieuweDb() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('${SEIZOEN}', '2026-2027', 1);
    UPDATE instellingen SET waarde = 'normaal' WHERE sleutel = 'bericht_modus';
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('baas', 'Bea', 'Baas', 'baas@club.be'), ('plus', 'Bert', 'Bosmans', 'plus@club.be'),
      ('yo', 'Ann', 'Aerts', 'yo@club.be');
    INSERT INTO rollen (persoon_id, rol) VALUES ('baas', 'YOADM'), ('plus', 'YOPLUS'), ('yo', 'YO');
  `);
  return db;
}
const ctxVan = (db) => ({ db, env: { RESEND_API_KEY: 're_test' } });

let ploegNr = 0;
/** Een thuiswedstrijd van een eigen ploeg, met haar rij in officials_wedstrijd. Geeft het id. */
function wed(db, sleutel, datum, uur, thuis, {
  off = 0, scope = 0, reden = null, scopeUit = 0, cat = 'J16', poule = 'U16 Niveau 3 P', forfait = null,
  officials = [], ploegOfficials = 1,
} = {}) {
  const team = `BVBL1125${cat}  ${++ploegNr}`;
  db._sqlite.exec(`
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd, officials)
      VALUES ('${team}', '${SEIZOEN}', '${thuis}', '${cat}', 0, ${ploegOfficials});
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander)
      VALUES ('${sleutel}', '${team}', '${SEIZOEN}', '${datum}', '${uur}', 1, 'Gast');
  `);
  const id = db._sqlite.prepare(`SELECT id FROM wedstrijden WHERE wedstrijd_guid = ?`).get(sleutel).id;
  db._sqlite.exec(`
    INSERT INTO officials_wedstrijd (wedstrijd_id, cat_code, poule_naam, off_aantal, scope, scope_reden, scope_uit, forfait)
    VALUES (${id}, '${cat}', '${poule}', ${off}, ${scope}, ${reden ? `'${reden}'` : 'NULL'}, ${scopeUit},
            ${forfait ? `'${forfait}'` : 'NULL'});
  `);
  for (const p of officials) {
    db._sqlite.exec(`INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, toegewezen_door) VALUES (${id}, '${p}', 'baas')`);
  }
  return id;
}

/** fetch nabootsen: het Excel-bestand, en de mails die Resend zou versturen. */
async function metFetch(xlsx, fn, { status = 200 } = {}) {
  const mails = [];
  const oude = globalThis.fetch;
  globalThis.fetch = async (url, opties) => {
    if (String(url).startsWith('https://mcusercontent.com/')) {
      return { ok: status === 200, status, arrayBuffer: async () => xlsx };
    }
    mails.push(JSON.parse(opties.body));
    return new Response('{"id":"m"}', { status: 200 });
  };
  try {
    await fn();
  } finally {
    globalThis.fetch = oude;
  }
  return mails;
}

const rij = (db, sleutel) =>
  db._sqlite
    .prepare(
      `SELECT o.scope, o.scope_reden, o.bond_officials FROM officials_wedstrijd o
         JOIN wedstrijden w ON w.id = o.wedstrijd_id WHERE w.wedstrijd_guid = ?`
    )
    .get(sleutel);
const aan = (mails, adres) => mails.filter((m) => m.to === adres);

// ===========================================================================

test('de mail uitlezen', () => {
  const m = leesMail(bouwMail());
  assert.equal(adresUit(m.van), 'info@basketbal.vlaanderen');
  assert.equal(m.onderwerp, 'Wedstrijden zonder officials komend weekend & nieuws');
  assert.deepEqual(m.tekstdelen.map((d) => d.type), ['text/plain', 'text/html']);
  assert.deepEqual(herkenMail(m), { soort: 'lijst', link: LINK }, 'link over zachte regelbreuken heen');
  assert.equal(gecodeerdeWoorden('=?UTF-8?B?w6l0w6k=?='), 'été');
  assert.equal(gecodeerdeWoorden('=?utf-8?Q?a?= =?utf-8?Q?b?='), 'ab');

  const genest = [
    'From: x@y.be', 'Content-Type: multipart/mixed; boundary="A"', '', '--A',
    'Content-Type: multipart/alternative; boundary="B"', '', '--B',
    'Content-Type: text/plain; charset="utf-8"', 'Content-Transfer-Encoding: base64', '',
    Buffer.from('Héllo daar').toString('base64'), '--B--', '--A--', '',
  ].join('\r\n');
  assert.equal(leesMail(genest).tekstdelen[0].tekst, 'Héllo daar');
});

test('het Excel-bestand uitlezen, met en zonder compressie', async () => {
  for (const opgeslagen of [false, true]) {
    const xlsx = bouwXlsx([{ datum: '3/10/2026', tijd: '9:00', thuis: 'A & B J16 A', o1: 'grijs' }], { opgeslagen });
    assert.ok(Object.keys(await pakUit(xlsx)).includes('xl/styles.xml'));
    const r = await leesXlsx(xlsx);
    assert.equal(r.blad, 'Aanduidingen');
    assert.deepEqual(r.rijen[0].map((c) => c.waarde), KOP);
    assert.equal(r.rijen[1][6].waarde, 'A & B J16 A');
    assert.equal(r.rijen[1][9].kleur, 'FFCCCCCC');
    assert.equal(r.rijen[1][10].kleur, 'FFFFFFFF');
  }
  await assert.rejects(pakUit(Buffer.from('geen zip')), /Geen geldig zip-bestand/);
});

test('de lijst lezen: kolommen, datums en grijze cellen', async () => {
  assert.equal(lijstDatum('3/10/2026'), '2026-10-03');
  assert.equal(lijstDatum('46298'), '2026-10-03');
  assert.equal(lijstDatum('32/13/2026'), null);
  assert.equal(lijstUur('9:00'), '09:00');
  assert.equal(lijstUur('16.30'), '16:30');
  assert.equal(lijstUur('0.375'), '09:00');
  assert.equal(lijstUur('9:00:00'), '09:00');
  assert.equal(lijstUur('9 uur'), null);
  assert.equal(naamSleutel('  AB  Inbev Leuven Bears G14 B '), naamSleutel('AB InBev Leuven Bears G14 B'));

  const r = await leesXlsx(bouwXlsx([
    { datum: '3/10/2026', tijd: '9:00', thuis: 'Ploeg A', reeks: 'U16 Niveau 4 O' },
    { datum: '3/10/2026', tijd: '11:00', thuis: 'Ploeg B', o1: 'grijs' },
    { datum: '4/10/2026', tijd: '13:00', thuis: 'Ploeg C', o2: 'grijs' },
  ]));
  const { wedstrijden } = leesLijst(r.rijen);
  assert.deepEqual(wedstrijden.map((w) => w.officials), [0, 1, 1], 'leeg = 0, grijs = 1');

  const grijzeRij = await leesXlsx(bouwXlsx([{ datum: '3/10/2026', tijd: '9:00', thuis: 'X' }], { rijKleur: 3 }));
  assert.equal(leesLijst(grijzeRij.rijen).wedstrijden[0].officials, 0, 'een hele grijze rij telt niet');

  const anders = [...KOP];
  [anders[1], anders[2]] = [anders[2], anders[1]];
  const omgewisseld = await leesXlsx(bouwXlsx([{ datum: '9:00', tijd: '3/10/2026', thuis: 'X' }], { kop: anders }));
  assert.equal(leesLijst(omgewisseld.rijen).wedstrijden[0].datum, '2026-10-03', 'kolomvolgorde mag wijzigen');

  const zonder = KOP.map((k) => (k === 'Official 2' ? 'Opmerking' : k));
  const rijen = (await leesXlsx(bouwXlsx([{ datum: '3/10/2026', tijd: '9:00', thuis: 'X' }], { kop: zonder }))).rijen;
  assert.throws(() => leesLijst(rijen), /'official 2'/);
  assert.throws(() => leesLijst([[{ waarde: 'iets anders', kleur: null }]]), /Thuis ploeg/);
});

test('wanneer is het woensdag 14 uur voorbij (Brussel, zomer- en wintertijd)', () => {
  assert.equal(woensdagVoor('2026-10-10'), '2026-10-07');
  assert.equal(woensdagVoor('2026-10-09'), '2026-10-07');
  assert.equal(woensdagVoor('2026-10-11'), '2026-10-07');
  assert.equal(voorbijMoment('2026-10-10', new Date('2026-10-07T11:59:00Z')), false);
  assert.equal(voorbijMoment('2026-10-10', new Date('2026-10-07T12:00:00Z')), true);
  assert.equal(voorbijMoment('2026-12-05', new Date('2026-12-02T12:30:00Z')), false);
  assert.equal(voorbijMoment('2026-12-05', new Date('2026-12-02T13:00:00Z')), true);
  assert.equal(voorbijMoment('2026-10-10', new Date('2026-10-08T06:00:00Z')), true);
  assert.deepEqual(komendWeekend(WOENSDAG), [ZA, ZO]);
});

test('koppelen aan de eigen thuiswedstrijden', () => {
  const eigen = [
    { id: 1, datum: ZA, uur: '09:00', thuis_naam: `${B} J16 A`, poule_naam: 'U16 Niveau 3 P' },
    { id: 2, datum: ZA, uur: '11:00', thuis_naam: 'AB Inbev Leuven Bears G14 B', poule_naam: 'U14 Niveau 3 K' },
  ];
  const r = koppel([
    { datum: ZA, uur: '09:00', thuis: `${B} J16 A`, reeks: 'U16 Niveau 3 P', officials: 0 },
    { datum: ZA, uur: '11:00', thuis: 'AB INBEV Leuven Bears G14 B', reeks: 'U14 Niveau 4 A', officials: 1 },
    { datum: ZA, uur: '14:00', thuis: 'Hageland United J18 A', uit: `${B} J18 B`, officials: 0 },
    { datum: ZO, uur: '15:00', thuis: `${B} J16 A`, officials: 0 },
  ], eigen);
  assert.deepEqual(r.gekoppeld, [{ id: 1, officials: 0 }, { id: 2, officials: 1 }]);
  assert.deepEqual(r.nietGekoppeld.map((x) => x.uur), ['15:00'], 'eigen ploeg op een onbekend uur');
  assert.deepEqual(r.reeksAfwijking.map((x) => [x.lijst, x.app]), [['U14 Niveau 4 A', 'U14 Niveau 3 K']]);
});

/** Een volledige week. */
function zetWeekKlaar(db) {
  wed(db, 'IN_LEEG', ZA, '09:00', `${B} J16 A`);
  wed(db, 'IN_GRIJS', ZA, '11:00', `${B} J16 B`);
  wed(db, 'IN_API2', ZA, '13:00', `${B} J16 C`, { off: 2 });
  wed(db, 'IN_UIT', ZA, '15:00', `${B} J16 D`, { scopeUit: 1 });
  wed(db, 'NIET_API0', ZO, '09:00', `${B} J18 A`, { cat: 'J18' });
  wed(db, 'NIET_AUTO', ZO, '11:00', `${B} J18 B`, { cat: 'J18', scope: 1, reden: 'woensdag' });
  wed(db, 'NIET_BEZET', ZO, '13:00', `${B} J18 C`, { cat: 'J18', scope: 1, reden: 'woensdag', officials: ['plus'] });
  wed(db, 'NIET_ADMIN', ZO, '15:00', `${B} J18 D`, { cat: 'J18', scope: 1, reden: 'admin' });
  wed(db, 'U12', ZA, '10:00', `${B} G12 A`, { cat: 'G12', scope: 1, reden: 'auto' });
  wed(db, 'FORFAIT', ZO, '17:00', `${B} J18 E`, { cat: 'J18', forfait: 'uit' });
  wed(db, 'G08', ZO, '09:30', `${B} G08 A`, { cat: 'G08' });
  wed(db, 'GEEN_OFF', ZO, '19:00', `${B} J21 A`, { cat: 'J21', ploegOfficials: 0 });
  return bouwXlsx([
    { datum: alsLijst(ZA), tijd: '9:00', thuis: `${B} J16 A`, reeks: 'U16 Niveau 3 P' },
    { datum: alsLijst(ZA), tijd: '11:00', thuis: `${B} J16 B`, o1: 'grijs' },
    { datum: alsLijst(ZA), tijd: '13:00', thuis: `${B} J16 C` },
    { datum: alsLijst(ZA), tijd: '15:00', thuis: `${B} J16 D` },
    { datum: alsLijst(ZO), tijd: '16:00', thuis: `${B} J16 A` },
    { datum: alsLijst(ZA), tijd: '14:00', thuis: 'Hageland United J18 A', uit: `${B} J18 B` },
    { datum: alsLijst(ZO), tijd: '10:00', thuis: 'Andere Club U16 A' },
  ]);
}

test('vóór 14 uur ontvangen, om 14 uur verwerkt', async () => {
  const db = nieuweDb();
  const ctx = ctxVan(db);
  const xlsx = zetWeekKlaar(db);

  let r;
  let mails = await metFetch(xlsx, async () => { r = await ontvangMail(ctx, bouwMail(), { nu: VOOR_14 }); });
  assert.equal(r.soort, 'ontvangen');
  assert.equal(rij(db, 'IN_LEEG').scope, 0, 'nog niets in de lijst gezet');
  assert.equal(mails.length, 0);

  let om14;
  mails = await metFetch(null, async () => { om14 = await woensdagOm14(ctx, OM_14); });
  assert.equal(om14.soort, 'verwerkt');
  const v = om14.resultaat;

  assert.deepEqual([rij(db, 'IN_LEEG').scope, rij(db, 'IN_LEEG').scope_reden], [1, 'woensdag']);
  assert.deepEqual(v.toegevoegd.map((w) => [w.thuis, w.nogNodig]),
    [[`${B} J16 A`, 2], [`${B} J16 B`, 1], [`${B} J16 C`, 0]]);
  assert.deepEqual([rij(db, 'IN_LEEG').bond_officials, rij(db, 'IN_GRIJS').bond_officials], [0, 1]);
  assert.equal(rij(db, 'IN_UIT').scope, 0, 'door de beheerder eruit gehaald: blijft eruit');
  assert.equal(rij(db, 'NIET_AUTO').scope, 0, 'automatisch erin, niet in de lijst, niemand op: eruit');
  assert.equal(rij(db, 'NIET_BEZET').scope, 1, 'met een aanduiding: blijft staan');
  assert.equal(rij(db, 'NIET_ADMIN').scope, 1, 'door een beheerder erin gezet: blijft');
  assert.equal(rij(db, 'NIET_API0').bond_officials, 2, 'niet in de lijst: de bond voorziet twee');
  assert.deepEqual(['U12', 'FORFAIT', 'G08', 'GEEN_OFF'].map((s) => rij(db, s).bond_officials), [null, null, null, null],
    'U12, forfait, onbekende categorie en een ploeg zonder officials ongemoeid');

  assert.deepEqual(v.uitGehaald.map((w) => w.thuis), [`${B} J18 B`]);
  assert.deepEqual(v.blijftStaan.map((w) => w.thuis), [`${B} J18 C`]);
  assert.equal(v.afwijkingA.length, 4);
  assert.deepEqual(v.afwijkingB.map((w) => [w.thuis, w.api, w.bond]), [[`${B} J16 C`, 2, 0]]);
  assert.deepEqual(v.nietGekoppeld.map((x) => x.uur), ['16:00']);

  const naarPlus = aan(mails, 'plus@club.be').map((m) => m.text).join('\n');
  assert.match(naarPlus, /J16 A/, 'YO+ krijgt de gewone mail');
  assert.doesNotMatch(naarPlus, /afwijk|API/i);
  const naarBaas = aan(mails, 'baas@club.be').map((m) => m.text).join('\n');
  assert.match(naarBaas, /nog geen naam zichtbaar in de API/);
  assert.match(naarBaas, /Laten staan/);
  assert.equal(aan(mails, 'yo@club.be').length, 0, 'de gewone YO krijgt niets');
  assert.ok(db._sqlite.prepare(`SELECT COUNT(*) AS n FROM berichten WHERE persoon_id = 'plus'`).get().n >= 1,
    'in Mijn berichten');

  await metFetch(null, async () => { r = await woensdagOm14(ctx, OM_14); });
  assert.equal(r.soort, 'al-verwerkt');
});

test('na 14 uur ontvangen: meteen verwerkt; een tweede exemplaar telt niet', async () => {
  const db = nieuweDb();
  const ctx = ctxVan(db);
  const xlsx = zetWeekKlaar(db);
  let r;
  await metFetch(xlsx, async () => { r = await ontvangMail(ctx, bouwMail(), { nu: NA_14 }); });
  assert.equal(r.soort, 'verwerkt');
  assert.equal(rij(db, 'IN_LEEG').scope, 1);
  await metFetch(xlsx, async () => { r = await ontvangMail(ctx, bouwMail(), { nu: NA_14 }); });
  assert.equal(r.soort, 'dubbel');
  assert.equal(db._sqlite.prepare(`SELECT COUNT(*) AS n FROM officials_vbl_lijsten WHERE status = 'dubbel'`).get().n, 1);
});

test('geen lijst om 14 uur, terugval om 20 uur, en een late lijst zet recht', async () => {
  const db = nieuweDb();
  const ctx = ctxVan(db);
  wed(db, 'API0', ZA, '09:00', `${B} J16 A`);
  wed(db, 'API0_G08', ZA, '10:00', `${B} G08 A`, { cat: 'G08' });

  let r;
  let mails = await metFetch(null, async () => { r = await woensdagOm14(ctx, OM_14); });
  assert.equal(r.soort, 'niet-binnen');
  assert.equal(rij(db, 'API0').scope, 0);
  assert.ok(aan(mails, 'baas@club.be').some((m) => /nog niet binnen/.test(m.subject)));
  assert.equal(aan(mails, 'plus@club.be').length, 0);

  mails = await metFetch(null, async () => { r = await woensdagTerugval(ctx, OM_20); });
  assert.equal(r.soort, 'terugval');
  assert.deepEqual([rij(db, 'API0').scope, rij(db, 'API0').scope_reden], [1, 'woensdag']);
  assert.equal(rij(db, 'API0_G08').scope, 0, 'een categorie waar de bond nooit iemand aanduidt, niet');
  assert.ok(aan(mails, 'plus@club.be').length > 0, 'YO+ krijgt nu de gewone mail');
  assert.ok(aan(mails, 'baas@club.be').some((m) => /met de API/.test(m.subject)));

  const laat = bouwXlsx([{ datum: alsLijst(ZO), tijd: '9:00', thuis: `${B} J18 Z` }]);
  await metFetch(laat, async () => {
    r = await ontvangMail(ctx, bouwMail(), { nu: new Date(`${isoDag(WOENSDAG, 1)}T08:00:00Z`) });
  });
  assert.equal(r.soort, 'verwerkt');
  assert.equal(rij(db, 'API0').scope, 0, 'niet in de lijst, niemand op: eruit');

  const db2 = nieuweDb();
  const xlsx = zetWeekKlaar(db2);
  await metFetch(xlsx, () => ontvangMail(ctxVan(db2), bouwMail(), { nu: VOOR_14 }));
  await metFetch(null, async () => { r = await woensdagTerugval(ctxVan(db2), OM_20); });
  assert.equal(r.soort, 'niet-nodig');
});

test('wat geen woensdaglijst is, of niet te lezen', async () => {
  const db = nieuweDb();
  const ctx = ctxVan(db);
  const goed = bouwXlsx([{ datum: alsLijst(ZA), tijd: '9:00', thuis: 'X' }]);
  let r;
  let mails = await metFetch(goed, async () => {
    r = await ontvangMail(ctx, bouwMail({ van: 'Vervalst <info@basketbal.vlaanderen.evil.com>' }), { nu: VOOR_14 });
  });
  assert.equal(r.soort, 'onbekend');
  mails.push(...(await metFetch(goed, async () => {
    r = await ontvangMail(ctx, bouwMail({ onderwerp: 'Nieuws over opleidingen' }), { nu: VOOR_14 });
  })));
  assert.equal(r.soort, 'andere-nieuwsbrief');
  assert.equal(mails.length, 0);

  mails = await metFetch(goed, async () => { r = await ontvangMail(ctx, bouwMail({ link: null }), { nu: VOOR_14 }); });
  assert.equal(r.soort, 'fout');
  assert.ok(aan(mails, 'baas@club.be').some((m) => /kon niet verwerkt/.test(m.subject)));

  await metFetch(null, async () => { r = await ontvangMail(ctx, bouwMail(), { nu: VOOR_14 }); }, { status: 404 });
  assert.match(r.reden, /HTTP 404/);

  const andereKop = bouwXlsx([{ datum: alsLijst(ZA), tijd: '9:00', thuis: 'X' }], { kop: KOP.map((k) => (k === 'Tijd' ? 'Uur' : k)) });
  await metFetch(andereKop, async () => { r = await ontvangMail(ctx, bouwMail(), { nu: VOOR_14 }); });
  assert.match(r.reden, /'tijd'/);

  await metFetch(bouwXlsx([{ datum: '3/10/2020', tijd: '9:00', thuis: 'X' }]), async () => {
    r = await ontvangMail(ctx, bouwMail(), { nu: VOOR_14 });
  });
  assert.match(r.reden, /voorbij/);
  assert.equal(db._sqlite.prepare(`SELECT COUNT(*) AS n FROM officials_vbl_lijsten WHERE status = 'fout'`).get().n, 4);

  await metFetch(null, async () => { r = await woensdagOm14(ctx, OM_14); });
  assert.equal(r.soort, 'niet-binnen', 'een fout telt niet als binnen');
});

test('Gmail en Mailchimp vragen een bevestiging: naar de beheerders', async () => {
  const db = nieuweDb();
  const ctx = ctxVan(db);
  const raw = [
    'From: Gmail Team <forwarding-noreply@google.com>', 'Subject: (#123456) Gmail Forwarding Confirmation',
    'Content-Type: text/plain; charset="UTF-8"', '',
    'Bevestigingscode: 123456. Klik op https://mail.google.com/mail/vf-abc om te bevestigen.', '',
  ].join('\r\n');
  let r;
  let mails = await metFetch(null, async () => { r = await ontvangMail(ctx, raw, { naar: 'vbl@clubassist.org', nu: VOOR_14 }); });
  assert.equal(r.soort, 'bevestiging');
  assert.match(aan(mails, 'baas@club.be')[0]?.text ?? '', /123456[\s\S]*mail\.google\.com\/mail\/vf-abc/);
  assert.ok(mails.every((m) => m.to === 'baas@club.be'), 'niet naar anderen');

  mails = await metFetch(null, async () => {
    r = await ontvangMail(ctx, bouwMail({
      onderwerp: 'Bevestig je inschrijving', link: 'https://vlaanderen.us3.list-manage.com/subscribe/confirm?u=1',
    }), { nu: VOOR_14 });
  });
  assert.equal(r.soort, 'bevestiging');
  assert.ok(aan(mails, 'baas@club.be').some((m) => /list-manage\.com\/subscribe\/confirm/.test(m.text)));
  assert.equal(herkenMail(leesMail(bouwMail({ onderwerp: 'Bevestigd: wedstrijden zonder officials' }))).soort, 'lijst');
});

test('de Worker-ingang voor mail weigert nooit', async () => {
  const db = nieuweDb();
  const env = { DB: db, RESEND_API_KEY: 're_test' };
  const bericht = (tekst) => ({
    from: 'iemand@ergens.be', to: 'vbl@clubassist.org',
    raw: new Blob([tekst]).stream(),
    setReject: () => { throw new Error('mag niet geweigerd worden'); },
  });
  await metFetch(null, async () => {
    await worker.email(bericht('totaal geen mail \u0000\u0001'), env, {});
    await worker.email(bericht(bouwMail({ van: 'x@y.be' })), env, {});
  });
  assert.ok(db._sqlite.prepare(`SELECT COUNT(*) AS n FROM logboek WHERE wat LIKE 'woensdaglijst:%'`).get().n >= 1);
});

test('status bij Beheer, enkel voor wie de officials beheert', async () => {
  const db = nieuweDb();
  const xlsx = zetWeekKlaar(db);
  await metFetch(xlsx, () => ontvangMail(ctxVan(db), bouwMail(), { nu: VOOR_14 }));
  const r = await (await woensdaglijstTonen({ db })).json();
  const l = r.lijsten[0];
  assert.deepEqual([l.status, l.van, l.tot, l.aantal_eigen, l.aantal_rijen, l.niet_gekoppeld],
    ['ontvangen', ZA, ZO, 4, 7, 1]);
  assert.equal((await rechtenVoor(db, 'plus', SEIZOEN)).mag('officials.beheren'), false);
  assert.equal((await rechtenVoor(db, 'baas', SEIZOEN)).mag('officials.beheren'), true);
});

test('Regio volgt de woensdaglijst', async () => {
  const db = nieuweDb();
  const ctx = ctxVan(db);
  const MAANDAG = isoDag(WOENSDAG, 5);
  db._sqlite.exec(`
    INSERT INTO officials_volg_clubs (guid, naam, toegevoegd_door) VALUES ('BVBL9999', 'Andere Club', 'baas');
    INSERT INTO officials_volg_wedstrijden (guid, club_guid, club_naam, thuis_naam, uit_naam, datum, uur, cat_code, vbl_aantal) VALUES
      ('V_LEEG',  'BVBL9999', 'Andere Club', 'Andere Club U16 A', 'Gast', '${ZO}', '10:00', 'J16', 0),
      ('V_GRIJS', 'BVBL9999', 'Andere Club', 'Andere Club U18 A', 'Gast', '${ZA}', '12:00', 'J18', 0),
      ('V_NIET',  'BVBL9999', 'Andere Club', 'Andere Club U16 B', 'Gast', '${ZA}', '16:00', 'J16', 0),
      ('V_LATER', 'BVBL9999', 'Andere Club', 'Andere Club U16 A', 'Gast', '${MAANDAG}', '20:00', 'J16', 0);
  `);
  wed(db, 'IN_LEEG', ZA, '09:00', `${B} J16 A`);
  const xlsx = bouwXlsx([
    { datum: alsLijst(ZA), tijd: '9:00', thuis: `${B} J16 A` },
    { datum: alsLijst(ZO), tijd: '10:00', thuis: 'Andere Club U16 A' },
    { datum: alsLijst(ZA), tijd: '12:00', thuis: 'Andere Club U18 A', o1: 'grijs' },
    { datum: alsLijst(ZO), tijd: '14:00', thuis: 'Andere Club U16 B' },
    { datum: alsLijst(ZO), tijd: '15:00', thuis: 'Niet Gevolgd U16 A' },
  ]);
  await metFetch(xlsx, () => ontvangMail(ctx, bouwMail(), { nu: VOOR_14 }));
  // Een club die pas na ontvangst gevolgd wordt, is niet tegen de lijst gelegd.
  db._sqlite.exec(`INSERT INTO officials_volg_wedstrijden (guid, club_guid, club_naam, thuis_naam, uit_naam, datum, uur, cat_code, vbl_aantal)
                   VALUES ('V_NIEUW', 'BVBL9999', 'Andere Club', 'Andere Club U21 A', 'Gast', '${ZA}', '19:00', 'J21', 0)`);
  const bond = (g) => db._sqlite.prepare(`SELECT bond_officials AS b FROM officials_volg_wedstrijden WHERE guid = ?`).get(g).b;
  assert.equal(bond('V_LEEG'), null, 'vóór 14 uur nog ongemoeid');

  let om14;
  const mails = await metFetch(null, async () => { om14 = await woensdagOm14(ctx, OM_14); });
  assert.deepEqual(['V_LEEG', 'V_GRIJS', 'V_NIET', 'V_LATER', 'V_NIEUW'].map(bond), [0, 1, 2, null, null]);
  assert.equal(rij(db, 'IN_LEEG').scope, 1);
  assert.equal(om14.resultaat.regioInLijst, 2);
  assert.deepEqual(om14.resultaat.regioNietGekoppeld.map((x) => [x.thuis, x.uur]), [['Andere Club U16 B', '14:00']]);
  const naarBaas = aan(mails, 'baas@club.be').map((m) => m.text).join('\n');
  assert.match(naarBaas, /Regio: ploeg van een gevolgde club.*\n.*Andere Club U16 B/);
  assert.doesNotMatch(naarBaas, /Niet Gevolgd/);
  assert.doesNotMatch(aan(mails, 'plus@club.be').map((m) => m.text).join('\n'), /Regio|Andere Club/);
});

test('avondcontrole: wat via de woensdagregel erin kwam, heeft nu twee refs van de bond', async () => {
  const db = nieuweDb();
  wed(db, 'TWEE', ZA, '09:00', `${B} J16 A`, { off: 2, scope: 1, reden: 'woensdag' });
  wed(db, 'EEN', ZA, '11:00', `${B} J16 B`, { off: 1, scope: 1, reden: 'woensdag' });
  wed(db, 'ADMIN', ZA, '13:00', `${B} J16 C`, { off: 2, scope: 1, reden: 'admin' });
  let r;
  const mails = await metFetch(null, async () => { r = await avondcontrole(ctxVan(db), OM_20); });
  assert.deepEqual(r.overbodig.map((o) => o.omschrijving), [`${ZA} 09:00 ${B} J16 A - Gast`]);
  assert.equal(rij(db, 'TWEE').scope, 1, 'niet automatisch eruit');
  assert.equal(aan(mails, 'baas@club.be').length, 1);
});

test('de planner, en de afscherming tot de overstap', async () => {
  assert.ok(takenVoorUur(14, 3).includes('woensdagregel'));
  assert.ok(!takenVoorUur(14, 4).includes('woensdagregel'));
  assert.ok(takenVoorUur(20, 3).includes('woensdag-terugval'));
  assert.ok(takenVoorUur(20, 3).indexOf('avondcontrole') > takenVoorUur(20, 3).indexOf('woensdag-terugval'));
  assert.ok(takenVoorUur(20, 5).includes('avondcontrole'));
  assert.ok(!takenVoorUur(20, 5).includes('woensdag-terugval'));

  const db = nieuweDb();
  wed(db, 'API0', komendWeekend(new Date())[0], '09:00', `${B} J16 A`);
  const runs = () => db._sqlite.prepare(`SELECT taak FROM taak_runs ORDER BY id`).all().map((x) => x.taak);
  await metFetch(null, () => voerGeplandeTakenUit(['woensdag-terugval'], db, { RESEND_API_KEY: 'x' }));
  assert.deepEqual(runs(), [], 'standaard uit: niets gedaan');
  assert.equal(rij(db, 'API0').scope, 0);

  db._sqlite.exec(`INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES ('officials_automatisch', '1')`);
  await metFetch(null, () => voerGeplandeTakenUit(['woensdag-terugval'], db, { RESEND_API_KEY: 'x' }));
  assert.deepEqual(runs(), ['woensdag-terugval']);
  assert.equal(rij(db, 'API0').scope, 1, 'aan: de terugval loopt');
});

test('V44: alle wedstrijden gedekt — een mail zonder link is een lege lijst', async () => {
  // De tekst zoals de bond hem op 28 oktober 2026 stuurde, met de dubbele
  // spatie en de regelbreuk erin.
  const LEEG_TEKST = '** Beste official\n\n0 wedstrijden met één of zonder officials\n\n\n' +
    'Alle wedstrijden zijn  dit weekend van officials voorzien. Bij eventuele wijzigingen zal rechtstreeks  ' +
    'contact opgenomen worden met de thuisploeg.\n';
  assert.deepEqual(herkenMail(leesMail(bouwMail({ link: null, inhoud: LEEG_TEKST }))), { soort: 'lijst', link: null, leeg: true });
  assert.equal(herkenMail(leesMail(bouwMail({
    link: null, inhoud: 'Beste official', htmlInhoud: '<p>Alle wedstrijden zijn&nbsp;dit weekend<br>van officials voorzien.</p>',
  }))).leeg, true, 'ook enkel in de HTML, met een <br> in de zin');
  assert.equal(herkenMail(leesMail(bouwMail({ link: null }))).leeg, false);

  const db = nieuweDb();
  const ctx = ctxVan(db);
  wed(db, 'API0', ZA, '09:00', `${B} J16 A`);
  wed(db, 'AUTO', ZO, '11:00', `${B} J18 B`, { cat: 'J18', scope: 1, reden: 'woensdag' });
  wed(db, 'BEZET', ZO, '13:00', `${B} J18 C`, { cat: 'J18', scope: 1, reden: 'woensdag', officials: ['plus'] });
  db._sqlite.exec(`
    INSERT INTO officials_volg_clubs (guid, naam, toegevoegd_door) VALUES ('BVBL9999', 'Andere Club', 'baas');
    INSERT INTO officials_volg_wedstrijden (guid, club_guid, club_naam, thuis_naam, uit_naam, datum, uur, cat_code, vbl_aantal)
      VALUES ('V_ZA', 'BVBL9999', 'Andere Club', 'Andere Club U16 A', 'Gast', '${ZA}', '10:00', 'J16', 0);
  `);
  let r;
  let mails = await metFetch(null, async () => { r = await ontvangMail(ctx, bouwMail({ link: null, inhoud: LEEG_TEKST }), { nu: VOOR_14 }); });
  assert.equal(r.soort, 'ontvangen', 'geen fout');
  assert.equal(mails.length, 0, 'geen foutmail');
  const l = db._sqlite.prepare(`SELECT weekend_van, weekend_tot, aantal_rijen, status FROM officials_vbl_lijsten`).get();
  assert.deepEqual([l.weekend_van, l.weekend_tot, l.aantal_rijen, l.status], [ZA, ZO, 0, 'ontvangen']);

  mails = await metFetch(null, async () => { r = await woensdagOm14(ctx, OM_14); });
  assert.equal(r.soort, 'verwerkt', 'geen "nog niet binnen"');
  assert.equal(r.resultaat.toegevoegd.length, 0);
  assert.equal(rij(db, 'AUTO').scope, 0, 'automatisch erin, niemand op: eruit');
  assert.equal(rij(db, 'BEZET').scope, 1, 'met een aanduiding: blijft');
  assert.equal(rij(db, 'API0').bond_officials, 2);
  assert.equal(db._sqlite.prepare(`SELECT bond_officials AS b FROM officials_volg_wedstrijden WHERE guid = 'V_ZA'`).get().b, 2, 'ook Regio');
  assert.equal(aan(mails, 'plus@club.be').length, 0, 'YO+ krijgt niets');

  await metFetch(null, async () => { r = await woensdagTerugval(ctx, OM_20); });
  assert.equal(r.soort, 'niet-nodig', 'om 20 uur geen terugval op de API');
  assert.equal(rij(db, 'API0').scope, 0);

  const db2 = nieuweDb();
  await metFetch(null, async () => { r = await ontvangMail(ctxVan(db2), bouwMail({ link: null }), { nu: VOOR_14 }); });
  assert.equal(r.soort, 'fout', 'zonder link en zonder die tekst: een fout, zoals vroeger');
});
