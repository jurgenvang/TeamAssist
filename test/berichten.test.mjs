// Mijn berichten en de banner (0.28.0).
//
// Het zwaartepunt: alles gaat over de persoon uit het token. Een id van
// iemand anders markeren, verwijderen of wegklikken doet niets aan diens rij.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import {
  berichtenTonen, berichtenOngelezen, berichtGelezen, berichtVerwijderen,
  mededelingTonen, mededelingWegklikken, korteRegel,
} from '../src/routes/berichten.js';

const T1 = 'BVBL1125J16  2';
const T2 = 'BVBL1125G12  1';
const seizoen = { code: '2026-27', naam: '2026-2027' };
const morgen = () => new Date(Date.now() + 86400000).toISOString();
const gisteren = () => new Date(Date.now() - 86400000).toISOString();

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie) VALUES ('${T1}', '2026-27', 'J16 B', 'J16'), ('${T2}', '2026-27', 'G12 A', 'G12');
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('anna', 'Anna', 'P', 'a@x.be'), ('bert', 'Bert', 'Q', 'b@x.be'),
      ('kind', 'Kind', 'R', NULL), ('ouder', 'Ouder', 'R', 'o@x.be'), ('coach', 'Coach', 'S', 'c@x.be');
    INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES ('kind', '${T1}', '2026-27'), ('anna', '${T2}', '2026-27');
    INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('ouder', 'kind');
    INSERT INTO rollen (persoon_id, rol, team_guid, seizoen) VALUES ('coach', 'COACH', '${T1}', '2026-27');
  `);
  return db;
}

const verzoek = (body) => new Request('https://x', { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined });
const ctx = (db, id, body) => ({ db, persoon: { id }, seizoen, request: verzoek(body) });
const body = async (res) => res.json();

function bericht(db, persoon, over = {}) {
  const r = { onderwerp: 'Onderwerp', inhoud: 'Eerste regel\nTweede regel', kort: null, soort: 'taak', ...over };
  return db._sqlite
    .prepare(`INSERT INTO berichten (persoon_id, kanaal, onderwerp, inhoud, kort, soort) VALUES (?, 'mail', ?, ?, ?, ?)`)
    .run(persoon, r.onderwerp, r.inhoud, r.kort, r.soort).lastInsertRowid;
}

test('ik zie enkel mijn eigen berichten, nieuwste eerst', async () => {
  const db = zetKlaar();
  bericht(db, 'anna', { onderwerp: 'eerste' });
  bericht(db, 'anna', { onderwerp: 'tweede' });
  bericht(db, 'bert', { onderwerp: 'van bert' });
  const uit = await body(await berichtenTonen(ctx(db, 'anna')));
  assert.deepEqual(uit.berichten.map((b) => b.onderwerp), ['tweede', 'eerste']);
  assert.equal(uit.ongelezen, 2);
});

test('zonder kort is de lijstregel de eerste regel, en de volledige tekst staat apart voor lees meer', async () => {
  const db = zetKlaar();
  bericht(db, 'anna');
  const [b] = (await body(await berichtenTonen(ctx(db, 'anna')))).berichten;
  assert.equal(b.kort, 'Eerste regel');
  assert.equal(b.inhoud, 'Eerste regel\nTweede regel');
});

test('is de inhoud niet meer dan de korte regel, dan is er geen lees meer', async () => {
  const db = zetKlaar();
  bericht(db, 'anna', { inhoud: 'Enkel dit' });
  const [b] = (await body(await berichtenTonen(ctx(db, 'anna')))).berichten;
  assert.equal(b.kort, 'Enkel dit');
  assert.equal(b.inhoud, null);
});

test('een lange regel eindigt op … in plaats van midden in een zin te stoppen', () => {
  const lang = 'woord '.repeat(60);
  const kort = korteRegel(null, lang);
  assert.ok(kort.length <= 160);
  assert.ok(kort.endsWith('…'));
});

test('gelezen markeren raakt enkel mijn eigen bericht', async () => {
  const db = zetKlaar();
  const vanBert = bericht(db, 'bert');
  const vanAnna = bericht(db, 'anna');
  await berichtGelezen(ctx(db, 'anna', { id: Number(vanBert) }));
  assert.equal(db._sqlite.prepare(`SELECT gelezen_op FROM berichten WHERE id = ?`).get(vanBert).gelezen_op, null);
  await berichtGelezen(ctx(db, 'anna', { id: Number(vanAnna) }));
  assert.ok(db._sqlite.prepare(`SELECT gelezen_op FROM berichten WHERE id = ?`).get(vanAnna).gelezen_op);
  assert.equal((await body(await berichtenOngelezen(ctx(db, 'anna')))).ongelezen, 0);
  assert.equal((await body(await berichtenOngelezen(ctx(db, 'bert')))).ongelezen, 1);
});

test('alles gelezen raakt enkel mijn eigen berichten', async () => {
  const db = zetKlaar();
  bericht(db, 'anna'); bericht(db, 'anna'); bericht(db, 'bert');
  const uit = await body(await berichtGelezen(ctx(db, 'anna', { alles: true })));
  assert.equal(uit.gewijzigd, 2);
  assert.equal((await body(await berichtenOngelezen(ctx(db, 'bert')))).ongelezen, 1);
});

test('verwijderen raakt enkel mijn eigen bericht', async () => {
  const db = zetKlaar();
  const vanBert = bericht(db, 'bert');
  const uit = await body(await berichtVerwijderen(ctx(db, 'anna', { id: Number(vanBert) })));
  assert.equal(uit.verwijderd, 0);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM berichten`).get().n, 1);
});

// --- de banner ---------------------------------------------------------------

function mededeling(db, over = {}) {
  const m = { doelgroep: 'iedereen', team_guid: null, geldig_tot: morgen(), actief: 1, ...over };
  return Number(db._sqlite
    .prepare(`INSERT INTO mededelingen (tekst, doelgroep, team_guid, seizoen, geldig_tot, gezet_door, actief)
              VALUES ('Nieuws', ?, ?, '2026-27', ?, 'anna', ?)`)
    .run(m.doelgroep, m.team_guid, m.geldig_tot, m.actief).lastInsertRowid);
}

const banner = async (db, id) => (await body(await mededelingTonen(ctx(db, id)))).mededeling;

test('een mededeling voor iedereen ziet iedereen, tot ze verloopt', async () => {
  const db = zetKlaar();
  mededeling(db);
  assert.ok(await banner(db, 'bert'));
  db._sqlite.exec(`UPDATE mededelingen SET geldig_tot = '${gisteren()}'`);
  assert.equal(await banner(db, 'bert'), null);
});

test('wegklikken geldt enkel voor wie klikte', async () => {
  const db = zetKlaar();
  const id = mededeling(db);
  await mededelingWegklikken(ctx(db, 'anna', { id }));
  await mededelingWegklikken(ctx(db, 'anna', { id })); // twee keer klikken is geen fout
  assert.equal(await banner(db, 'anna'), null);
  assert.ok(await banner(db, 'bert'));
});

test('een ingetrokken mededeling toont niemand nog', async () => {
  const db = zetKlaar();
  mededeling(db, { actief: 0 });
  assert.equal(await banner(db, 'anna'), null);
});

test('een mededeling voor één ploeg zien de spelers, hun ouders en de begeleiding — niemand anders', async () => {
  const db = zetKlaar();
  mededeling(db, { doelgroep: 'ploeg', team_guid: T1 });
  assert.ok(await banner(db, 'kind'), 'speler');
  assert.ok(await banner(db, 'ouder'), 'ouder van een speler');
  assert.ok(await banner(db, 'coach'), 'begeleiding');
  assert.equal(await banner(db, 'anna'), null, 'speler van een andere ploeg');
  assert.equal(await banner(db, 'bert'), null, 'iemand zonder ploeg');
});

test('een mededeling voor de begeleiding ziet enkel de begeleiding', async () => {
  const db = zetKlaar();
  mededeling(db, { doelgroep: 'begeleiding' });
  assert.ok(await banner(db, 'coach'));
  assert.equal(await banner(db, 'kind'), null);
  assert.equal(await banner(db, 'ouder'), null);
});

test('een onbekende mededeling wegklikken geeft 404', async () => {
  const db = zetKlaar();
  const res = await mededelingWegklikken(ctx(db, 'anna', { id: 999 }));
  assert.equal(res.status, 404);
});
