// Tabbladen per stuk uitzetten (0.42.0, I1 fase 4e).
//
// De regels (src/lib/tabbladen.js), de route bij Mijn voorkeuren en /api/mij,
// de tabbalk, en de migratie: het schema van 0.41.0 plus migratie-0.42.0.sql
// geeft dezelfde tabel personen als een vers schema.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { maakDb } from './d1.mjs';
import { VERBERGBAAR, STANDAARD_VERBORGEN, leesVerborgen, keurVerborgenGoed, vanYoassist } from '../src/lib/tabbladen.js';
import { voorkeurenBewaren } from '../src/routes/voorkeuren.js';
import { TABBLADEN, tabbalkTabbladen, verbergbareTabbladen } from '../public/js/navigatie.js';
import { bouwRechten } from '../src/lib/rechten.js';

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');

test('lezen en nakijken: NULL is de standaard, Overzicht kan niet weg', () => {
  assert.deepEqual(leesVerborgen(null), ['regio']);
  assert.deepEqual(leesVerborgen('[]'), []);
  assert.deepEqual(leesVerborgen('["ploegen","onbekend"]'), ['ploegen']);
  assert.deepEqual(leesVerborgen('geen json'), ['regio']);
  assert.deepEqual(keurVerborgenGoed(['regio', 'ploegen', 'regio']), ['ploegen', 'regio']);
  assert.equal(keurVerborgenGoed(['mij']), null, 'Overzicht blijft altijd staan');
  assert.equal(keurVerborgenGoed(['dagelijksbeheer']), null, 'een paneel onder Beheer is geen tabblad');
  assert.equal(keurVerborgenGoed('regio'), null);
});

test('van YOAssist: de standaard blijft de standaard, een keuze gaat mee', () => {
  assert.equal(vanYoassist('log,aandacht'), null);
  assert.equal(vanYoassist('aandacht'), null);
  assert.equal(vanYoassist(''), '[]');
  assert.equal(vanYoassist('club,aandacht,log'), '["cluboverzicht","regio"]');
  assert.equal(vanYoassist('mijn'), '["aanduidingen"]');
});

test('backend en tabbalk kennen dezelfde tabbladen', () => {
  assert.deepEqual(TABBLADEN.filter((t) => t.verbergbaar).map((t) => t.id).sort(), [...VERBERGBAAR].sort());
  assert.deepEqual(TABBLADEN.filter((t) => t.standaardUit).map((t) => t.id), STANDAARD_VERBORGEN);
  assert.ok(!TABBLADEN.some((t) => t.inMenu && t.verbergbaar), 'panelen onder Beheer zijn niet verbergbaar');
});

test('de tabbalk laat weg wat verborgen is, maar nooit Overzicht', () => {
  const admin = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] }).overzicht();
  const ids = (extra) => tabbalkTabbladen(admin, extra).map((t) => t.id);
  assert.deepEqual(ids({ verborgen: ['regio'] }), ['mij', 'cluboverzicht', 'ploegen', 'personen']);
  assert.deepEqual(ids({ verborgen: ['mij', 'ploegen', 'personen', 'cluboverzicht', 'regio'] }), ['mij']);
  assert.deepEqual(verbergbareTabbladen(admin).map((t) => t.id), ['cluboverzicht', 'regio', 'ploegen', 'personen']);
  // Een coach kan Regio niet aanzetten: hij ziet het niet eens in de keuze.
  const coach = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: 'BVBL1125J16  1' }] }).overzicht();
  assert.ok(!verbergbareTabbladen(coach).some((t) => t.id === 'regio'));
});

test('Mijn voorkeuren bewaart de tabbladen, en laat ze staan als ze niet meekomen', async () => {
  const db = maakDb();
  db._sqlite.exec(`INSERT INTO personen (id, voornaam, achternaam) VALUES ('p', 'Piet', 'P')`);
  const persoon = () => db._sqlite.prepare(`SELECT * FROM personen WHERE id = 'p'`).get();
  const bewaar = async (body) => {
    const res = await voorkeurenBewaren({ db, persoon: persoon(), request: new Request('https://x/', { method: 'POST', body: JSON.stringify(body) }) });
    return { status: res.status, ...(await res.json()) };
  };
  assert.equal(persoon().verborgen_tabs, null);
  const uit = await bewaar({ verborgen_tabs: [] });
  assert.deepEqual(uit.verborgen_tabs, [], 'Regio aangezet');
  assert.equal(persoon().verborgen_tabs, '[]');
  await bewaar({ donkere_modus: 'donker' });
  assert.equal(persoon().verborgen_tabs, '[]', 'enkel de modus bewaren raakt de tabbladen niet');
  assert.equal((await bewaar({ verborgen_tabs: ['mij'] })).status, 400);
  assert.equal(persoon().verborgen_tabs, '[]');
});

test('/api/mij geeft de verborgen tabbladen mee, en de app bouwt de tabbalk ermee', () => {
  assert.match(lees('../src/routes/mij.js'), /verborgen_tabs: leesVerborgen\(persoon\.verborgen_tabs\)/);
  assert.match(lees('../public/js/app.js'), /verborgen: gegevens\.verborgen_tabs \?\? \[\]/);
});

test('migratie-0.42.0.sql: het schema van 0.41.0 plus de migratie is het schema van nu', () => {
  const nu = lees('../schema.sql');
  const oud = nu.replace(/,\n(\s*--[^\n]*\n)*\s*verborgen_tabs\s+TEXT\n\);/, '\n);');
  assert.notEqual(oud, nu, 'de kolom staat in schema.sql');
  const kolommen = (sql) => {
    const db = new DatabaseSync(':memory:');
    db.exec(sql);
    return db.prepare(`PRAGMA table_info(personen)`).all().map((k) => `${k.name} ${k.type} ${k.notnull} ${k.dflt_value}`);
  };
  const migratie = lees('../migratie-0.42.0.sql');
  assert.deepEqual(kolommen(`${oud}\n${migratie}`), kolommen(nu));
  // Een tweede keer faalt luid, zoals de kop van het script zegt.
  const db = new DatabaseSync(':memory:');
  db.exec(`${oud}\n${migratie}`);
  assert.throws(() => db.exec(migratie), /duplicate column/);
});
