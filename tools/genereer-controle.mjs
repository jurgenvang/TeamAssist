// Genereert schema-controle.sql uit schema.sql.
//
// De controlequery met de hand bijhouden werkt niet: in YOAssist bleef de
// backuplijst jarenlang achter op het schema zonder dat iemand het merkte,
// telkens wanneer er een tabel bijkwam. Dus wordt ze afgeleid uit de bron, en
// bewaakt een test dat het bestand nog klopt.
//
// Draaien met:  node tools/genereer-controle.mjs

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const wortel = join(dirname(fileURLToPath(import.meta.url)), '..');

export function leesStructuur(schemaSql) {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);

  const objecten = db
    .prepare(
      `SELECT type, name FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY type, name`
    )
    .all();

  const kolommen = [];
  for (const o of objecten.filter((x) => x.type === 'table')) {
    for (const k of db.prepare(`SELECT name FROM pragma_table_info(?)`).all(o.name)) {
      kolommen.push({ tabel: o.name, kolom: k.name });
    }
  }
  return { objecten, kolommen };
}

function waarden(rijen, velden) {
  return rijen
    .map((r) => `  (${velden.map((v) => `'${String(r[v]).replace(/'/g, "''")}'`).join(', ')})`)
    .join(',\n');
}

export function bouwControle(schemaSql, versie) {
  const { objecten, kolommen } = leesStructuur(schemaSql);

  return `-- TeamAssist — controle op de databankstructuur (versie ${versie})
--
-- Plak dit in de D1-console na het uitvoeren van een schemawijziging. Het wijzigt
-- niets; het vergelijkt wat er staat met wat er hoort te staan.
--
-- Lees de bovenste regel: staat er ALLES OK, dan is de databank in orde. Staat er
-- een aantal, dan volgen daaronder de tabellen, indexen of kolommen die
-- ontbreken. Kolommen die er te veel zijn worden niet gemeld: die doen geen
-- kwaad en komen voor wanneer een oudere versie iets achterliet.
--
-- Dit bestand wordt gegenereerd uit schema.sql. Niet met de hand aanpassen —
-- draai 'node tools/genereer-controle.mjs' en er staat een test op.

WITH verwacht_object(soort, naam) AS (VALUES
${waarden(objecten, ['type', 'name'])}
),
verwacht_kolom(tabel, kolom) AS (VALUES
${waarden(kolommen, ['tabel', 'kolom'])}
),
ontbrekend_object AS (
  SELECT v.soort AS soort, v.naam AS naam
    FROM verwacht_object v
    LEFT JOIN sqlite_master m ON m.name = v.naam AND m.type = v.soort
   WHERE m.name IS NULL
),
ontbrekende_kolom AS (
  SELECT 'kolom' AS soort, v.tabel || '.' || v.kolom AS naam
    FROM verwacht_kolom v
    LEFT JOIN pragma_table_info(v.tabel) p ON p.name = v.kolom
   WHERE p.name IS NULL
),
problemen AS (
  SELECT * FROM ontbrekend_object
  UNION ALL
  SELECT * FROM ontbrekende_kolom
)
SELECT 0 AS volgorde,
       CASE WHEN (SELECT count(*) FROM problemen) = 0
            THEN 'ALLES OK'
            ELSE (SELECT count(*) FROM problemen) || ' PROBLEEM/PROBLEMEN'
       END AS soort,
       'structuur versie ${versie}' AS naam
UNION ALL
SELECT 1, soort, naam FROM problemen
ORDER BY volgorde, soort, naam;
`;
}

// Enkel schrijven wanneer dit bestand rechtstreeks gedraaid wordt, zodat de
// test de functies kan importeren zonder iets te overschrijven.
if (process.argv[1] && process.argv[1].endsWith('genereer-controle.mjs')) {
  const schemaSql = readFileSync(join(wortel, 'schema.sql'), 'utf8');
  const versie = readFileSync(join(wortel, 'src', 'versie.js'), 'utf8').match(/'([^']+)'/)[1];
  writeFileSync(join(wortel, 'schema-controle.sql'), bouwControle(schemaSql, versie));
  console.log('schema-controle.sql bijgewerkt');
}
