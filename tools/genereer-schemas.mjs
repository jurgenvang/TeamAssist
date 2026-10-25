// schema-alles-in-een.sql en schema-kaal.sql opnieuw opbouwen uit schema.sql.
//
//   node tools/genereer-schemas.mjs
//
// Tot 0.28.0 werden die twee met de hand bijgehouden. De DROP's staan in de
// omgekeerde volgorde van de CREATE TABLE's in schema.sql: wat later
// aangemaakt wordt, kan naar wat eerder kwam verwijzen, nooit omgekeerd — dus
// klopt die volgorde vanzelf met de foreign keys. Een test legt beide
// bestanden naast wat dit script zou maken.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const wortel = join(dirname(fileURLToPath(import.meta.url)), '..');

const KOP = `-- TeamAssist — schema opnieuw opbouwen, in één keer uitvoerbaar.
--
-- Dit wist alle gegevens. Gebruik het bij een schemawijziging die niet met een
-- ALTER TABLE kan: een gewijzigde CHECK, een hernoemde tabel of een nieuwe
-- foreign key. Een gewone kolom erbij hoort met ALTER te gebeuren.
--
-- De volgorde van de DROP's is omgekeerd aan die van de foreign keys.
`;

export function drops(schema) {
  const tabellen = [...schema.matchAll(/^CREATE TABLE (\w+)/gm)].map((m) => m[1]);
  return tabellen.reverse().map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n');
}

/** Zonder commentaar: wat de D1-console in één keer slikt, zonder ruis. */
export function zonderCommentaar(schema) {
  const regels = schema
    .split('\n')
    .filter((r) => !/^\s*--/.test(r))
    .map((r) => r.replace(/\s+--.*$/, '').replace(/\s+$/, ''));
  const uit = [];
  for (const r of regels) {
    if (r === '' && (uit.length === 0 || uit[uit.length - 1] === '')) continue;
    uit.push(r);
  }
  return uit.join('\n').replace(/\n+$/, '\n');
}

export function allesInEen(schema) {
  return `${KOP}\n${drops(schema)}\n\n${schema}`;
}

export function kaal(schema) {
  return `${drops(schema)}\n\n${zonderCommentaar(schema)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const schema = readFileSync(join(wortel, 'schema.sql'), 'utf8');
  writeFileSync(join(wortel, 'schema-alles-in-een.sql'), allesInEen(schema));
  writeFileSync(join(wortel, 'schema-kaal.sql'), kaal(schema));
  console.log('schema-alles-in-een.sql en schema-kaal.sql bijgewerkt');
}
