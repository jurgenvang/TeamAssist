// Zalen en hun blokken.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { zalenTonen, zaalAanmaken, blokAanmaken, vrijeBlokken, sluitingAanmaken, zetOpenOpFeestdagen } from '../src/routes/admin/zalen.js';

const seizoen = { code: '2026-27', naam: '2026-2027' };
const persoon = { id: 'p-admin' };

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1)`);
  return db;
}

function verzoek(pad, body) {
  return new Request(`https://x${pad}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined });
}

test('de beheerroutes voor zalen vragen het recht om het systeem te beheren', () => {
  for (const pad of ['/api/admin/zalen', '/api/admin/zalen/blok']) {
    const route = ROUTES.find((r) => r.pad === pad && r.methode === 'POST');
    assert.equal(route.recht, 'systeem.beheren');
  }
});

test('een sluiting melden mag met team.configureren, ruimer dan enkel ADMIN', () => {
  const route = ROUTES.find((r) => r.pad === '/api/admin/zalen/sluiting');
  assert.equal(route.recht, 'team.configureren');
});

test('een zaal aanmaken en tonen', async () => {
  const db = zetKlaar();
  const res = await zaalAanmaken({ db, persoon, request: verzoek('/x', { naam: 'Sporthal A' }) });
  assert.equal(res.status, 200);

  const lijst = await zalenTonen({ db, seizoen });
  const body = await lijst.json();
  assert.equal(body.zalen.length, 1);
  assert.equal(body.zalen[0].naam, 'Sporthal A');
  assert.deepEqual(body.zalen[0].blokken, []);
});

test('een blok weigert een ongeldige weekdag', async () => {
  const db = zetKlaar();
  const zaal = await (await zaalAanmaken({ db, persoon, request: verzoek('/x', { naam: 'A' }) })).json();
  const res = await blokAanmaken({
    db,
    persoon,
    seizoen,
    request: verzoek('/x', { zaal_id: zaal.id, weekdag: 8, begin: '18:00', einde: '20:00' }),
  });
  assert.equal(res.status, 400);
});

test('een blok met einde vóór begin wordt geweigerd', async () => {
  const db = zetKlaar();
  const zaal = await (await zaalAanmaken({ db, persoon, request: verzoek('/x', { naam: 'A' }) })).json();
  const res = await blokAanmaken({
    db,
    persoon,
    seizoen,
    request: verzoek('/x', { zaal_id: zaal.id, weekdag: 1, begin: '20:00', einde: '18:00' }),
  });
  assert.equal(res.status, 400);
});

test('een blok toevoegen en de zaal opnieuw tonen', async () => {
  const db = zetKlaar();
  const zaal = await (await zaalAanmaken({ db, persoon, request: verzoek('/x', { naam: 'A' }) })).json();
  await blokAanmaken({
    db, persoon, seizoen,
    request: verzoek('/x', { zaal_id: zaal.id, weekdag: 2, begin: '18:30', einde: '20:00' }),
  });
  const lijst = await (await zalenTonen({ db, seizoen })).json();
  assert.equal(lijst.zalen[0].blokken.length, 1);
  assert.equal(lijst.zalen[0].blokken[0].weekdag, 2);
});

test('een blok dat door geen enkele reeks gebruikt wordt, is vrij', async () => {
  const db = zetKlaar();
  const zaal = await (await zaalAanmaken({ db, persoon, request: verzoek('/x', { naam: 'A' }) })).json();
  await blokAanmaken({
    db, persoon, seizoen,
    request: verzoek('/x', { zaal_id: zaal.id, weekdag: 2, begin: '18:30', einde: '20:00' }),
  });
  const res = await vrijeBlokken({
    db, seizoen, request: new Request(`https://x/api/admin/zalen/vrij?zaal=${zaal.id}`),
  });
  const body = await res.json();
  assert.equal(body.vrij.length, 1);
});

test('een blok dat al bij een reeks hoort, is niet vrij', async () => {
  const db = zetKlaar();
  const zaal = await (await zaalAanmaken({ db, persoon, request: verzoek('/x', { naam: 'A' }) })).json();
  await blokAanmaken({
    db, persoon, seizoen,
    request: verzoek('/x', { zaal_id: zaal.id, weekdag: 2, begin: '18:30', einde: '20:00' }),
  });
  db._sqlite.exec(`
    INSERT INTO teams (guid, seizoen, naam) VALUES ('T1', '2026-27', 'Ploeg 1');
    INSERT INTO trainingsreeksen (team_guid, seizoen, weekdag, begin, einde, zaal_id, van, tot)
         VALUES ('T1', '2026-27', 2, '18:30', '20:00', '${zaal.id}', '2026-09-01', '2026-09-30');
  `);
  const res = await vrijeBlokken({ db, seizoen, request: new Request(`https://x/api/admin/zalen/vrij?zaal=${zaal.id}`) });
  const body = await res.json();
  assert.equal(body.vrij.length, 0);
});

test('een sluiting komt onafgehandeld in het logboek', async () => {
  const db = zetKlaar();
  const zaal = await (await zaalAanmaken({ db, persoon, request: verzoek('/x', { naam: 'A' }) })).json();
  await sluitingAanmaken({
    db, persoon,
    request: verzoek('/x', { zaal_id: zaal.id, van: '2026-09-15', tot: '2026-09-15', reden: 'vloer geschuurd' }),
  });
  const regel = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.equal(regel.afgehandeld, 0, 'iemand hoort te kijken of getroffen trainingen een alternatief nodig hebben');
});

test('open_op_feestdagen staat standaard uit bij een nieuwe zaal', async () => {
  const db = zetKlaar();
  const zaal = await (await zaalAanmaken({ db, persoon, request: verzoek('/x', { naam: 'A' }) })).json();
  const rij = db._sqlite.prepare(`SELECT open_op_feestdagen FROM zalen WHERE id = ?`).get(zaal.id);
  assert.equal(rij.open_op_feestdagen, 0);
});

test('een zaal open zetten op feestdagen wordt bewaard en gelogd', async () => {
  const db = zetKlaar();
  const zaal = await (await zaalAanmaken({ db, persoon, request: verzoek('/x', { naam: 'A' }) })).json();
  const res = await zetOpenOpFeestdagen({ db, persoon, request: verzoek('/x', { zaal_id: zaal.id, open: true }) });
  assert.equal(res.status, 200);
  const rij = db._sqlite.prepare(`SELECT open_op_feestdagen FROM zalen WHERE id = ?`).get(zaal.id);
  assert.equal(rij.open_op_feestdagen, 1);
  const regel = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.match(regel.wat, /open op feestdagen/);
});

test('terugzetten naar dicht werkt ook', async () => {
  const db = zetKlaar();
  const zaal = await (await zaalAanmaken({ db, persoon, request: verzoek('/x', { naam: 'A' }) })).json();
  await zetOpenOpFeestdagen({ db, persoon, request: verzoek('/x', { zaal_id: zaal.id, open: true }) });
  await zetOpenOpFeestdagen({ db, persoon, request: verzoek('/x', { zaal_id: zaal.id, open: false }) });
  const rij = db._sqlite.prepare(`SELECT open_op_feestdagen FROM zalen WHERE id = ?`).get(zaal.id);
  assert.equal(rij.open_op_feestdagen, 0);
});

test('een onbestaande zaal geeft 404 bij het zetten van open_op_feestdagen', async () => {
  const db = zetKlaar();
  const res = await zetOpenOpFeestdagen({ db, persoon, request: verzoek('/x', { zaal_id: 'niet-bestaand', open: true }) });
  assert.equal(res.status, 404);
});
