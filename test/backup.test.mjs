// De backup: alle tabellen, dynamisch opgehaald.
//
// De kerntest hier is niet 'bevat de backup tabel X' — dat zou een even
// broze test zijn als de fout die dit moest voorkomen. De kerntest is: voeg
// een gloednieuwe tabel toe aan de databank, ná het schrijven van deze route,
// en bevestig dat de backup ze zonder enige codewijziging meeneemt. Dat
// bewijst de eigenschap zelf, niet enkel een momentopname ervan.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { backupExporteren, alleTabellen } from '../src/routes/admin/backup.js';

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p1', 'Anna', 'Peeters', 'a@b.c');
  `);
  return db;
}

test('de route vraagt systeem.beheren', () => {
  const route = ROUTES.find((r) => r.pad === '/api/admin/backup');
  assert.equal(route.recht, 'systeem.beheren');
});

test('alleTabellen komt rechtstreeks uit sqlite_master, geen eigen lijst', async () => {
  const db = zetKlaar();
  const tabellen = await alleTabellen(db);
  assert.ok(tabellen.includes('personen'));
  assert.ok(tabellen.includes('seizoenen'));
  assert.ok(tabellen.includes('logboek'));
  assert.ok(!tabellen.some((t) => t.startsWith('sqlite_')), 'geen SQLite-systeemtabellen erbij');
});

test('de kerntest: een gloednieuwe tabel wordt zonder enige codewijziging meegenomen', async () => {
  const db = zetKlaar();
  // Een tabel die op het moment van schrijven van backup.js niet bestond —
  // gesimuleerd door ze hier, ná het importeren van de route, pas aan te
  // maken. Als de route een hardcoded lijst zou gebruiken, zou dit falen.
  db._sqlite.exec(`
    CREATE TABLE een_helemaal_nieuwe_tabel_uit_de_toekomst (id INTEGER PRIMARY KEY, waarde TEXT);
    INSERT INTO een_helemaal_nieuwe_tabel_uit_de_toekomst (waarde) VALUES ('test');
  `);

  const res = await backupExporteren({ db });
  const body = await res.json();

  assert.ok(
    'een_helemaal_nieuwe_tabel_uit_de_toekomst' in body.tabellen,
    'een tabel die pas na het schrijven van deze route ontstond, zit er toch in'
  );
  assert.equal(body.tabellen.een_helemaal_nieuwe_tabel_uit_de_toekomst[0].waarde, 'test');
});

test('de backup bevat elke tabel die vandaag in het schema staat', async () => {
  const db = zetKlaar();
  const res = await backupExporteren({ db });
  const body = await res.json();
  const tabellen = await alleTabellen(db);
  for (const naam of tabellen) {
    assert.ok(naam in body.tabellen, `${naam} ontbreekt in de backup`);
  }
});

test('de echte data komt mee, niet enkel een lege structuur', async () => {
  const db = zetKlaar();
  const res = await backupExporteren({ db });
  const body = await res.json();
  assert.equal(body.tabellen.personen.length, 1);
  assert.equal(body.tabellen.personen[0].id, 'p1');
  assert.equal(body.tabellen.seizoenen[0].code, '2026-27');
});

test('een lege tabel komt mee als een lege lijst, niet ontbrekend', async () => {
  const db = zetKlaar(); // logboek is leeg in deze fixture
  const res = await backupExporteren({ db });
  const body = await res.json();
  assert.ok('logboek' in body.tabellen);
  assert.deepEqual(body.tabellen.logboek, []);
});

test('het antwoord heeft de juiste content-type en een gedateerde bestandsnaam', async () => {
  const db = zetKlaar();
  const res = await backupExporteren({ db });
  assert.equal(res.headers.get('content-type'), 'application/json');
  assert.match(res.headers.get('content-disposition'), /teamassist-backup-\d{4}-\d{2}-\d{2}\.json/);
});

test('het tijdstip van de backup zelf staat mee in het bestand', async () => {
  const db = zetKlaar();
  const res = await backupExporteren({ db });
  const body = await res.json();
  assert.ok(body.gemaakt);
  assert.ok(!Number.isNaN(new Date(body.gemaakt).getTime()));
});
