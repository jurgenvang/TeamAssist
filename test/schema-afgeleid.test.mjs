// schema-alles-in-een.sql en schema-kaal.sql volgen schema.sql (0.28.0).
//
// Tot 0.28.0 werden ze met de hand bijgehouden. Een nieuwe tabel die enkel in
// schema.sql staat, ontbreekt dan in de heropbouw — en dat merk je pas als je
// het script in nood nodig hebt.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { allesInEen, kaal, drops } from '../tools/genereer-schemas.mjs';

const lees = (n) => readFileSync(new URL(`../${n}`, import.meta.url), 'utf8');
const schema = lees('schema.sql');

test('schema-alles-in-een.sql is bijgewerkt (node tools/genereer-schemas.mjs)', () => {
  assert.equal(lees('schema-alles-in-een.sql'), allesInEen(schema));
});

test('schema-kaal.sql is bijgewerkt (node tools/genereer-schemas.mjs)', () => {
  assert.equal(lees('schema-kaal.sql'), kaal(schema));
});

test('beide zijn twee keer na elkaar uit te voeren op een databank met gegevens', () => {
  // Precies wat het script belooft: alles weg, alles opnieuw — ook bovenop
  // een bestaande databank, met de foreign keys aan zoals in D1.
  for (const sql of [lees('schema-alles-in-een.sql'), lees('schema-kaal.sql')]) {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(sql);
    db.exec(`INSERT INTO personen (id) VALUES ('p1');
             INSERT INTO mededelingen (id, tekst, geldig_tot, gezet_door) VALUES (1, 'x', '2099', 'p1');
             INSERT INTO mededeling_gezien (mededeling_id, persoon_id) VALUES (1, 'p1');`);
    db.exec(sql);
    assert.equal(db.prepare(`SELECT count(*) AS n FROM personen`).get().n, 0);
  }
});

test('elke tabel krijgt een DROP', () => {
  const tabellen = [...schema.matchAll(/^CREATE TABLE (\w+)/gm)].map((m) => m[1]);
  for (const t of tabellen) assert.ok(drops(schema).includes(`DROP TABLE IF EXISTS ${t};`), t);
});
