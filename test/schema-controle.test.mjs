// De controlequery.
//
// Twee dingen worden hier bewaakt. Dat het bestand nog overeenkomt met
// schema.sql — anders meldt het na een schemawijziging vrolijk ALLES OK terwijl
// er een tabel ontbreekt. En dat het werkelijk aanslaat wanneer er iets weg is;
// een controle die nooit iets vindt, is geen controle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { bouwControle } from '../tools/genereer-controle.mjs';

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');
const schemaSql = lees('../schema.sql');
const controleSql = lees('../schema-controle.sql');
const versie = lees('../src/versie.js').match(/'([^']+)'/)[1];

function draai(sql, voorbereiding) {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  if (voorbereiding) db.exec(voorbereiding);
  return db.prepare(sql).all();
}

test('schema-controle.sql is bijgewerkt na de laatste schemawijziging', () => {
  // Faalt dit, draai dan: node tools/genereer-controle.mjs
  assert.equal(
    controleSql,
    bouwControle(schemaSql, versie),
    'schema-controle.sql loopt achter op schema.sql of op het versienummer'
  );
});

test('tegen een vers schema meldt de controle dat alles in orde is', () => {
  const rijen = draai(controleSql);
  assert.equal(rijen.length, 1);
  assert.equal(rijen[0].soort, 'ALLES OK');
});

test('een ontbrekende tabel wordt gemeld', () => {
  const rijen = draai(controleSql, 'DROP TABLE ouder_kind');
  assert.match(rijen[0].soort, /PROBLEEM/);
  assert.ok(
    rijen.some((r) => r.soort === 'table' && r.naam === 'ouder_kind'),
    'de ontbrekende tabel hoort in de lijst te staan'
  );
});

test('een ontbrekende index wordt gemeld', () => {
  const rijen = draai(controleSql, 'DROP INDEX idx_rollen_uniek');
  assert.ok(rijen.some((r) => r.soort === 'index' && r.naam === 'idx_rollen_uniek'));
});

test('een ontbrekende kolom wordt gemeld', () => {
  // Het geval waarvoor deze query bestaat: een ALTER die niet is uitgevoerd,
  // waarna de app faalt met 'no such column' op een moment dat niemand het
  // verwacht.
  const rijen = draai(
    controleSql,
    `DROP TABLE taak_runs;
     CREATE TABLE taak_runs (id INTEGER PRIMARY KEY, taak TEXT, gestart TEXT, status TEXT)`
  );
  assert.ok(rijen.some((r) => r.soort === 'kolom' && r.naam === 'taak_runs.melding'));
  assert.ok(rijen.some((r) => r.soort === 'kolom' && r.naam === 'taak_runs.geeindigd'));
});

test('de controle wijzigt niets aan de databank', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  const voor = db.prepare(`SELECT count(*) AS n FROM instellingen`).get().n;
  db.prepare(controleSql).all();
  const na = db.prepare(`SELECT count(*) AS n FROM instellingen`).get().n;
  assert.equal(na, voor);
});

test('elke tabel uit het schema komt in de controle voor', () => {
  // De les uit YOAssist: daar bleef de backuplijst achter op het schema, telkens
  // wanneer er een tabel bijkwam, zonder dat er een test op stond.
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  const tabellen = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => r.name);

  assert.ok(tabellen.length >= 11, 'het schema hoort minstens elf tabellen te hebben');
  for (const naam of tabellen) {
    assert.ok(controleSql.includes(`'${naam}'`), `${naam} ontbreekt in de controlequery`);
  }
});
