// Het schema van de module Officials (0.30.0).
//
// Geen logica nog — die komt in fase 3 — maar wel de regels die het schema
// zelf afdwingt. Die moeten kloppen vóór er code op gebouwd wordt.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { verwijderInactievePersonenOp } from '../src/lib/opkuis.js';

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie) VALUES ('T1', '2026-27', 'U12 A', 'G12');
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p1', 'Anna', 'P', 'a@x.be');
    INSERT INTO wedstrijden (id, wedstrijd_guid, team_guid, seizoen, datum, begin, thuis) VALUES (1, 'W1', 'T1', '2026-27', '2026-11-07', '10:30', 1);
  `);
  return db;
}
const fout = (db, sql) => assert.throws(() => db._sqlite.exec(sql));

test('de categorieën en tarieven staan klaar, U10/U12 automatisch in de lijst', () => {
  const db = zetKlaar();
  const rijen = db._sqlite.prepare(`SELECT code, tarief_cent, auto_scope FROM officials_categorieen ORDER BY volgorde`).all();
  assert.equal(rijen.length, 12);
  assert.deepEqual(rijen.filter((r) => r.auto_scope).map((r) => r.code), ['G10', 'G12', 'M12']);
  assert.equal(rijen.find((r) => r.code === 'HSE').tarief_cent, 2500);
});

test('een ploeg krijgt standaard officials, zoals volgen in YOAssist', () => {
  const db = zetKlaar();
  assert.equal(db._sqlite.prepare(`SELECT officials FROM teams`).get().officials, 1);
});

test('een wedstrijd is standaard van de bond; enkel vbl of handmatig', () => {
  const db = zetKlaar();
  assert.equal(db._sqlite.prepare(`SELECT bron FROM wedstrijden`).get().bron, 'vbl');
  fout(db, `UPDATE wedstrijden SET bron = 'gok'`);
});

test('scope_reden kent enkel auto, admin en woensdag', () => {
  const db = zetKlaar();
  db._sqlite.exec(`INSERT INTO officials_wedstrijd (wedstrijd_id, scope, scope_reden) VALUES (1, 1, 'woensdag')`);
  fout(db, `UPDATE officials_wedstrijd SET scope_reden = 'lijst'`);
});

test('een wedstrijd wissen neemt haar officials-rijen mee', () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO officials_wedstrijd (wedstrijd_id) VALUES (1);
    INSERT INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status) VALUES ('p1', 1, 'ja');
    INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, toegewezen_door) VALUES (1, 'p1', 'systeem');
    DELETE FROM wedstrijden WHERE id = 1;
  `);
  for (const t of ['officials_wedstrijd', 'officials_beschikbaarheid', 'officials_aanduidingen']) {
    assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM ${t}`).get().n, 0, t);
  }
});

test('een agendasleutel is uniek', () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO personen (id, email) VALUES ('p2', 'b@x.be');
    UPDATE personen SET agenda_sleutel = 'abc' WHERE id = 'p1';
  `);
  fout(db, `UPDATE personen SET agenda_sleutel = 'abc' WHERE id = 'p2'`);
});

test('een vertrokken official verdwijnt, zijn uitbetaalde vergoedingen blijven', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    UPDATE personen SET actief = 0, inactief_sinds = datetime('now', '-200 days') WHERE id = 'p1';
    INSERT INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status) VALUES ('p1', 1, 'ja');
    INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, toegewezen_door) VALUES (1, 'p1', 'p1');
    INSERT INTO officials_problemen (wedstrijd_id, persoon_id, bericht) VALUES (1, 'p1', 'ziek');
    INSERT INTO officials_voorkeuren (persoon_id) VALUES ('p1');
    INSERT INTO officials_maanden (maand, seizoen, afgesloten_door) VALUES ('2026-10', '2026-27', 'p1');
    INSERT INTO officials_vergoeding_regels (maand, persoon_id, naam, cat_code, aantal, tarief_cent, bedrag_cent)
      VALUES ('2026-10', 'p1', 'Anna P', 'G12', 2, 1500, 3000);
    INSERT INTO officials_vergoeding_verwerkt (wedstrijd_guid, persoon_id, maand, cat_code, tarief_cent) VALUES ('W1', 'p1', '2026-10', 'G12', 1500);
  `);
  await verwijderInactievePersonenOp(db);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM personen WHERE id = 'p1'`).get().n, 0);
  assert.equal(db._sqlite.prepare(`SELECT bedrag_cent FROM officials_vergoeding_regels`).get().bedrag_cent, 3000);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM officials_vergoeding_verwerkt`).get().n, 1);
});

test('YO, YO+ en YOADM gelden clubbreed: met een ploeg erbij weigert het schema', () => {
  const db = zetKlaar();
  db._sqlite.exec(`INSERT INTO rollen (persoon_id, rol) VALUES ('p1', 'YOPLUS'), ('p1', 'YOADM')`);
  fout(db, `INSERT INTO rollen (persoon_id, rol, team_guid, seizoen) VALUES ('p1', 'YO', 'T1', '2026-27')`);
  fout(db, `INSERT INTO rollen (persoon_id, rol) VALUES ('p1', 'COACH')`);
});
