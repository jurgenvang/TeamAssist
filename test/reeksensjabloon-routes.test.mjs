// De trainingsuren-sjabloonroutes.
//
// Het zwaartepunt: een onbekend team blokkeert de import niet, en drie
// teams op hetzelfde tijdslot in dezelfde zaal (parallelle terreinen)
// worden alle drie correct weggeschreven, niet als conflict behandeld.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { reeksensjabloonExporteren, reeksensjabloonImporteren } from '../src/routes/admin/reeksensjabloon.js';
import { csvLezen } from '../src/lib/csv.js';

const seizoen = { code: '2026-27', naam: '2026-2027' };
const beheerder = { id: 'p-admin' };
const T1 = 'BVBL1125J14  2';

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p-admin', 'Beheer', 'der');
    INSERT INTO teams (guid, seizoen, naam, naam_kort) VALUES
      ('${T1}', '2026-27', 'AB InBev Leuven Bears G14 A', 'U14 A');
    INSERT INTO zalen (id, naam) VALUES ('z1', 'Sportoase Heverlee');
  `);
  return db;
}

async function importeer(db, csv, { uitvoeren = false } = {}) {
  const pad = uitvoeren ? '/api/admin/trainingsreeksen/sjabloon?uitvoeren=1' : '/api/admin/trainingsreeksen/sjabloon';
  const res = await reeksensjabloonImporteren({
    db, persoon: beheerder,
    request: new Request(`https://x${pad}`, { method: 'POST', body: csv }),
  });
  return { status: res.status, body: await res.json() };
}

test('de routes vragen systeem.beheren', () => {
  for (const route of ROUTES.filter((r) => r.pad === '/api/admin/trainingsreeksen/sjabloon')) {
    assert.equal(route.recht, 'systeem.beheren');
  }
});

test('exporteren geeft de bestaande reeksen als CSV', async () => {
  const db = zetKlaar();
  db._sqlite.exec(
    `INSERT INTO trainingsreeksen (team_guid, seizoen, weekdag, begin, einde, zaal_id, van, tot)
          VALUES ('${T1}', '2026-27', 1, '18:00', '19:15', 'z1', '2026-08-01', '2027-06-30')`
  );
  const res = await reeksensjabloonExporteren({ db, seizoen });
  const rijen = csvLezen(await res.text());
  assert.equal(rijen.length, 1);
  assert.equal(rijen[0].team_naam, 'U14 A');
  assert.equal(rijen[0].zaal, 'Sportoase Heverlee');
});

test('een gekend team en gekende zaal geven een nieuwe reeks bij uitvoeren', async () => {
  const db = zetKlaar();
  const csv = 'team_naam,zaal,weekdag,begin,einde,seizoen,van,tot\r\nU14 A,Sportoase Heverlee,1,18:00,19:15,2026-27,,\r\n';
  await importeer(db, csv, { uitvoeren: true });
  const reeks = db._sqlite.prepare(`SELECT * FROM trainingsreeksen WHERE team_guid = ?`).get(T1);
  assert.ok(reeks);
  assert.equal(reeks.van, '2026-08-01', 'de seizoensgrens wordt gebruikt als er geen eigen van/tot is');
});

test('een onbekend team laat de import niet mislukken en wordt gerapporteerd', async () => {
  const db = zetKlaar();
  const csv =
    'team_naam,zaal,weekdag,begin,einde,seizoen,van,tot\r\n' +
    'BB4FUN +14,Sportoase Heverlee,1,18:00,19:15,2026-27,,\r\n';
  const uit = await importeer(db, csv, { uitvoeren: true });
  assert.equal(uit.status, 200, 'een onbekend team geeft geen foutstatus voor de hele import');
  assert.equal(uit.body.onbekendeTeams.length, 1);
  assert.equal(uit.body.onbekendeTeams[0].team_naam, 'BB4FUN +14');
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM trainingsreeksen`).get().n;
  assert.equal(aantal, 0);
});

test('een onbekend team blokkeert de andere rijen niet', async () => {
  const db = zetKlaar();
  const csv =
    'team_naam,zaal,weekdag,begin,einde,seizoen,van,tot\r\n' +
    'BB4FUN +14,Sportoase Heverlee,1,18:00,19:15,2026-27,,\r\n' +
    'U14 A,Sportoase Heverlee,2,18:00,19:15,2026-27,,\r\n';
  const uit = await importeer(db, csv, { uitvoeren: true });
  assert.equal(uit.body.nieuweReeksen.length, 1);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM trainingsreeksen`).get().n;
  assert.equal(aantal, 1);
});

test('drie teams op hetzelfde tijdslot in dezelfde zaal geven drie reeksen, geen conflict', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO teams (guid, seizoen, naam) VALUES
      ('T-B', '2026-27', 'U14 B'), ('T-C', '2026-27', 'U14 C'), ('T-D', '2026-27', 'U14 D');
  `);
  const csv =
    'team_naam,zaal,weekdag,begin,einde,seizoen,van,tot\r\n' +
    'U14 B,Sportoase Heverlee,4,18:30,19:15,2026-27,,\r\n' +
    'U14 C,Sportoase Heverlee,4,18:30,19:15,2026-27,,\r\n' +
    'U14 D,Sportoase Heverlee,4,18:30,19:15,2026-27,,\r\n';
  const uit = await importeer(db, csv, { uitvoeren: true });
  assert.equal(uit.body.nieuweReeksen.length, 3);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM trainingsreeksen WHERE zaal_id = 'z1' AND weekdag = 4`).get().n;
  assert.equal(aantal, 3);
});

test('geen seizoen in het hele bestand geeft een duidelijke fout', async () => {
  const db = zetKlaar();
  const csv = 'team_naam,zaal,weekdag,begin,einde,seizoen,van,tot\r\nU14 A,Sportoase Heverlee,1,18:00,19:15,,,\r\n';
  const uit = await importeer(db, csv);
  assert.equal(uit.status, 400);
});

test('een reeks die niet meer in het bestand staat, blijft actief', async () => {
  const db = zetKlaar();
  db._sqlite.exec(
    `INSERT INTO trainingsreeksen (team_guid, seizoen, weekdag, begin, einde, zaal_id, van, tot)
          VALUES ('${T1}', '2026-27', 5, '18:00', '19:00', 'z1', '2026-08-01', '2027-06-30')`
  );
  const csv = 'team_naam,zaal,weekdag,begin,einde,seizoen,van,tot\r\nU14 A,Sportoase Heverlee,1,18:00,19:15,2026-27,,\r\n';
  const uit = await importeer(db, csv, { uitvoeren: true });
  assert.equal(uit.body.verdwenenReeksen.length, 1);
  const rij = db._sqlite.prepare(`SELECT actief FROM trainingsreeksen WHERE weekdag = 5`).get();
  assert.equal(rij.actief, 1, 'de reeks blijft actief, wordt niet stil uitgeschakeld');
});

test('de export gebruikt naam_kort, niet de volledige VBL-naam van de bond', async () => {
  const db = zetKlaar();
  db._sqlite.exec(
    `INSERT INTO trainingsreeksen (team_guid, seizoen, weekdag, begin, einde, zaal_id, van, tot)
          VALUES ('${T1}', '2026-27', 1, '18:00', '19:15', 'z1', '2026-08-01', '2027-06-30')`
  );
  const res = await reeksensjabloonExporteren({ db, seizoen });
  const rijen = csvLezen(await res.text());
  assert.equal(rijen[0].team_naam, 'U14 A', 'de korte naam, niet de volledige clubnaam-naam');
});

test('rondtrip: exporteren en meteen weer inlezen matcht zonder handmatig ingrijpen', async () => {
  const db = zetKlaar();
  db._sqlite.exec(
    `INSERT INTO trainingsreeksen (team_guid, seizoen, weekdag, begin, einde, zaal_id, van, tot)
          VALUES ('${T1}', '2026-27', 1, '18:00', '19:15', 'z1', '2026-08-01', '2027-06-30')`
  );
  const geexporteerd = await (await reeksensjabloonExporteren({ db, seizoen })).text();

  // Simuleer een lege databank (bijvoorbeeld een ander seizoen) met enkel het
  // team en de zaal, geen bestaande reeksen — de export moet zonder verdere
  // aanpassing opnieuw inleesbaar zijn.
  const db2 = maakDb();
  db2._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p-admin', 'Beheer', 'der');
    INSERT INTO teams (guid, seizoen, naam, naam_kort) VALUES
      ('${T1}', '2026-27', 'AB InBev Leuven Bears G14 A', 'U14 A');
    INSERT INTO zalen (id, naam) VALUES ('z1', 'Sportoase Heverlee');
  `);
  const uit = await importeer(db2, geexporteerd, { uitvoeren: true });
  assert.equal(uit.body.onbekendeTeams.length, 0);
  assert.equal(uit.body.nieuweReeksen.length, 1);
});
