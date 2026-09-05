// De zaaluren-sjabloonroutes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { zaalsjabloonExporteren, zaalsjabloonImporteren } from '../src/routes/admin/zaalsjabloon.js';
import { csvLezen } from '../src/lib/csv.js';

const seizoen = { code: '2026-27', naam: '2026-2027' };
const beheerder = { id: 'p-admin' };

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p-admin', 'Beheer', 'der');
    INSERT INTO zalen (id, naam) VALUES ('z1', 'Sportoase Wilsele');
    INSERT INTO zaal_blokken (zaal_id, seizoen, weekdag, begin, einde) VALUES ('z1', '2026-27', 1, '18:00', '19:15');
  `);
  return db;
}

async function importeer(db, csv, { uitvoeren = false } = {}) {
  const pad = uitvoeren ? '/api/admin/zalen/sjabloon?uitvoeren=1' : '/api/admin/zalen/sjabloon';
  const res = await zaalsjabloonImporteren({
    db, persoon: beheerder,
    request: new Request(`https://x${pad}`, { method: 'POST', body: csv }),
  });
  return { status: res.status, body: await res.json() };
}

test('de routes vragen systeem.beheren', () => {
  for (const route of ROUTES.filter((r) => r.pad === '/api/admin/zalen/sjabloon')) {
    assert.equal(route.recht, 'systeem.beheren');
  }
});

test('exporteren geeft de bestaande blokken als CSV', async () => {
  const db = zetKlaar();
  const res = await zaalsjabloonExporteren({ db, seizoen });
  const tekst = await res.text();
  const rijen = csvLezen(tekst);
  assert.equal(rijen.length, 1);
  assert.equal(rijen[0].zaal, 'Sportoase Wilsele');
  assert.equal(rijen[0].weekdag, '1');
});

test('een droogloop schrijft niets weg', async () => {
  const db = zetKlaar();
  const csv = 'zaal,weekdag,begin,einde,seizoen\r\nNieuwe Zaal,2,19:00,20:00,2026-27\r\n';
  const uit = await importeer(db, csv);
  assert.equal(uit.body.droogloop, true);
  assert.deepEqual(uit.body.nieuweZalen, ['Nieuwe Zaal']);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM zalen`).get().n;
  assert.equal(aantal, 1, 'enkel de al bestaande zaal');
});

test('uitvoeren maakt de nieuwe zaal en het blok echt aan', async () => {
  const db = zetKlaar();
  const csv = 'zaal,weekdag,begin,einde,seizoen\r\nNieuwe Zaal,2,19:00,20:00,2026-27\r\n';
  await importeer(db, csv, { uitvoeren: true });
  const zaal = db._sqlite.prepare(`SELECT * FROM zalen WHERE naam = 'Nieuwe Zaal'`).get();
  assert.ok(zaal);
  const blok = db._sqlite.prepare(`SELECT * FROM zaal_blokken WHERE zaal_id = ?`).get(zaal.id);
  assert.equal(blok.weekdag, 2);
});

test('een tweede import op hetzelfde bestand maakt geen dubbele zaal of blok', async () => {
  const db = zetKlaar();
  const csv = 'zaal,weekdag,begin,einde,seizoen\r\nNieuwe Zaal,2,19:00,20:00,2026-27\r\n';
  await importeer(db, csv, { uitvoeren: true });
  await importeer(db, csv, { uitvoeren: true });
  const aantalZalen = db._sqlite.prepare(`SELECT count(*) AS n FROM zalen WHERE naam = 'Nieuwe Zaal'`).get().n;
  const aantalBlokken = db._sqlite.prepare(`SELECT count(*) AS n FROM zaal_blokken`).get().n;
  assert.equal(aantalZalen, 1);
  assert.equal(aantalBlokken, 2, '1 bestaand + 1 nieuw, niet verdubbeld');
});

test('een blok dat niet meer in het bestand staat, blijft bestaan', async () => {
  const db = zetKlaar();
  const csv = 'zaal,weekdag,begin,einde,seizoen\r\nAndere Zaal,3,10:00,11:00,2026-27\r\n';
  const uit = await importeer(db, csv, { uitvoeren: true });
  assert.equal(uit.body.verdwenenBlokken.length, 1);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM zaal_blokken WHERE zaal_id = 'z1'`).get().n;
  assert.equal(aantal, 1, 'het originele blok bij Sportoase Wilsele blijft gewoon staan');
});

test('een leeg bestand geeft een duidelijke fout', async () => {
  const db = zetKlaar();
  const uit = await importeer(db, '   ');
  assert.equal(uit.status, 400);
});
