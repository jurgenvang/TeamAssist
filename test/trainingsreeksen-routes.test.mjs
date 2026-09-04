// Trainingsreeksen: aanmaken, en de generator als droogloop.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { reeksAanmaken, reeksGenereren, reeksStoppen, trainingenTonen } from '../src/routes/admin/trainingsreeksen.js';
import { zetOpenOpFeestdagen } from '../src/routes/admin/zalen.js';
import { bouwRechten } from '../src/lib/rechten.js';

const seizoen = { code: '2026-27', naam: '2026-2027' };
const persoon = { id: 'p-admin' };
const T1 = 'BVBL1125J16  2';

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, onderwijsgroep)
         VALUES ('${T1}', '2026-27', 'J16 B', 'J16', 'secundair');
  `);
  return db;
}

function verzoek(pad, body, methode) {
  return new Request(`https://x${pad}`, { method: methode ?? (body ? 'POST' : 'GET'), body: body ? JSON.stringify(body) : undefined });
}

async function maakReeks(db, over = {}) {
  const res = await reeksAanmaken({
    db, persoon, seizoen,
    request: verzoek('/x', {
      team_guid: T1,
      weekdag: 2,
      begin: '18:30',
      einde: '20:00',
      locatie_tekst: 'Sporthal A',
      van: '2026-09-01',
      tot: '2026-09-30',
      ...over,
    }),
  });
  return res.json();
}

test('trainingsreeksen aanmaken vraagt systeem.beheren, bekijken team.configureren', () => {
  const maken = ROUTES.find((r) => r.pad === '/api/admin/trainingsreeksen' && r.methode === 'POST');
  assert.equal(maken.recht, 'systeem.beheren');
  const tonen = ROUTES.find((r) => r.pad === '/api/admin/trainingsreeksen' && r.methode === 'GET');
  assert.equal(tonen.recht, 'team.configureren');
  assert.equal(typeof tonen.team, 'function');
});

test('een reeks zonder zaal of locatie wordt geweigerd', async () => {
  const db = zetKlaar();
  const res = await reeksAanmaken({
    db, persoon, seizoen,
    request: verzoek('/x', { team_guid: T1, weekdag: 2, begin: '18:30', einde: '20:00', van: '2026-09-01', tot: '2026-09-30' }),
  });
  assert.equal(res.status, 400);
});

test('een reeks buiten het seizoen wordt geweigerd', async () => {
  const db = zetKlaar();
  const res = await reeksAanmaken({
    db, persoon, seizoen,
    request: verzoek('/x', {
      team_guid: T1, weekdag: 2, begin: '18:30', einde: '20:00',
      locatie_tekst: 'A', van: '2026-07-01', tot: '2026-07-15',
    }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.fout, /seizoen/);
});

test('een reeks voor een onbestaande ploeg geeft 404', async () => {
  const db = zetKlaar();
  const res = await reeksAanmaken({
    db, persoon, seizoen,
    request: verzoek('/x', {
      team_guid: 'NIET-BESTAAND', weekdag: 2, begin: '18:30', einde: '20:00',
      locatie_tekst: 'A', van: '2026-09-01', tot: '2026-09-30',
    }),
  });
  assert.equal(res.status, 404);
});

test('genereren zonder uitvoeren schrijft niets weg', async () => {
  const db = zetKlaar();
  const { id } = await maakReeks(db);
  const res = await reeksGenereren({ db, persoon, request: verzoek(`/x?reeks=${id}`, null, 'POST') });
  const body = await res.json();
  assert.equal(body.droogloop, true);
  assert.ok(body.nieuw.length > 0);

  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM trainingen`).get().n;
  assert.equal(aantal, 0);
});

test('genereren met uitvoeren schrijft de trainingen weg', async () => {
  const db = zetKlaar();
  const { id } = await maakReeks(db);
  await reeksGenereren({ db, persoon, request: verzoek(`/x?reeks=${id}&uitvoeren=1`, null, 'POST') });

  const rijen = db._sqlite.prepare(`SELECT * FROM trainingen ORDER BY datum`).all();
  assert.equal(rijen.length, 5); // vijf dinsdagen in september 2026: 1, 8, 15, 22, 29
  assert.equal(rijen[0].status, 'gepland');
  assert.equal(rijen[0].bron, 'reeks');
});

test('een tweede keer genereren maakt geen dubbels', async () => {
  const db = zetKlaar();
  const { id } = await maakReeks(db);
  await reeksGenereren({ db, persoon, request: verzoek(`/x?reeks=${id}&uitvoeren=1`, null, 'POST') });
  await reeksGenereren({ db, persoon, request: verzoek(`/x?reeks=${id}&uitvoeren=1`, null, 'POST') });
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM trainingen`).get().n;
  assert.equal(aantal, 5);
});

test('een examenperiode van de bijpassende doelgroep slaat trainingen over', async () => {
  const db = zetKlaar();
  const { id } = await maakReeks(db);
  db._sqlite.exec(`
    INSERT INTO periodes (seizoen, naam, van, tot, soort, doelgroep, bron)
         VALUES ('2026-27', 'Examens', '2026-09-08', '2026-09-08', 'vakantie', 'secundair', 'club');
  `);
  await reeksGenereren({ db, persoon, request: verzoek(`/x?reeks=${id}&uitvoeren=1`, null, 'POST') });
  const rijen = db._sqlite.prepare(`SELECT datum FROM trainingen`).all();
  assert.ok(!rijen.some((r) => r.datum === '2026-09-08'));
  assert.equal(rijen.length, 4);
});

test('een handmatig gewijzigde training overleeft opnieuw genereren', async () => {
  const db = zetKlaar();
  const { id } = await maakReeks(db);
  await reeksGenereren({ db, persoon, request: verzoek(`/x?reeks=${id}&uitvoeren=1`, null, 'POST') });

  db._sqlite.exec(
    `UPDATE trainingen SET begin = '19:00', handmatig_gewijzigd = 1 WHERE reeks_id = ${id} AND datum = '2026-09-08'`
  );
  await reeksGenereren({ db, persoon, request: verzoek(`/x?reeks=${id}&uitvoeren=1`, null, 'POST') });

  const rij = db._sqlite.prepare(`SELECT begin FROM trainingen WHERE reeks_id = ${id} AND datum = '2026-09-08'`).get();
  assert.equal(rij.begin, '19:00', 'de handmatige wijziging blijft staan');
});

test('een gestopte reeks blijft bestaan maar genereert niet meer', async () => {
  const db = zetKlaar();
  const { id } = await maakReeks(db);
  await reeksStoppen({ db, persoon, request: verzoek('/x', { id }) });
  const rij = db._sqlite.prepare(`SELECT actief FROM trainingsreeksen WHERE id = ${id}`).get();
  assert.equal(rij.actief, 0);
});

test('een reeks met een zaal neemt sluitingen van die zaal mee', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO zalen (id, naam) VALUES ('z1', 'Sporthal A');
    INSERT INTO zaal_sluitingen (zaal_id, van, tot, reden) VALUES ('z1', '2026-09-15', '2026-09-15', 'vloer geschuurd');
  `);
  const { id } = await maakReeks(db, { zaal_id: 'z1', locatie_tekst: null });
  await reeksGenereren({ db, persoon, request: verzoek(`/x?reeks=${id}&uitvoeren=1`, null, 'POST') });

  const rij = db._sqlite.prepare(`SELECT status FROM trainingen WHERE reeks_id = ${id} AND datum = '2026-09-15'`).get();
  assert.equal(rij.status, 'zaal_niet_beschikbaar');
});

test('genereren voor een onbestaande reeks geeft 404', async () => {
  const db = zetKlaar();
  const res = await reeksGenereren({ db, persoon, request: verzoek('/x?reeks=999', null, 'POST') });
  assert.equal(res.status, 404);
});

// --- trainingenTonen: de individuele trainingen, niet de reeksen ------------

test('trainingenTonen toont de geplande trainingen voor wie het team mag bekijken', async () => {
  const db = zetKlaar();
  const { id } = await maakReeks(db);
  await reeksGenereren({ db, persoon, request: verzoek(`/x?reeks=${id}&uitvoeren=1`, null, 'POST') });

  const coachRechten = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: T1 }] });
  const res = await trainingenTonen({
    db, rechten: coachRechten, seizoen,
    request: verzoek(`/x?team=${encodeURIComponent(T1)}`, null, 'GET'),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.trainingen.length > 0);
});

test('trainingenTonen weigert wie geen recht heeft op de ploeg', async () => {
  const db = zetKlaar();
  const geenRechten = bouwRechten();
  const res = await trainingenTonen({
    db, rechten: geenRechten, seizoen,
    request: verzoek(`/x?team=${encodeURIComponent(T1)}`, null, 'GET'),
  });
  assert.equal(res.status, 403);
});

test('trainingenTonen vraagt een team', async () => {
  const db = zetKlaar();
  const coachRechten = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: T1 }] });
  const res = await trainingenTonen({ db, rechten: coachRechten, seizoen, request: verzoek('/x', null, 'GET') });
  assert.equal(res.status, 400);
});

// --- Feestdagen: end-to-end via de echte route -----------------------------

test('een feestdag blokkeert een training bij een zaal die standaard dicht is', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO zalen (id, naam) VALUES ('z1', 'Sporthal A');
    INSERT INTO periodes (seizoen, naam, van, tot, soort, doelgroep, bron)
         VALUES ('2026-27', 'Feestdag', '2026-09-08', '2026-09-08', 'feestdag', 'iedereen', 'club');
  `);
  const { id } = await maakReeks(db, { zaal_id: 'z1', locatie_tekst: null });
  await reeksGenereren({ db, persoon, request: verzoek(`/x?reeks=${id}&uitvoeren=1`, null, 'POST') });

  const rij = db._sqlite.prepare(`SELECT * FROM trainingen WHERE reeks_id = ${id} AND datum = '2026-09-08'`).get();
  assert.equal(rij, undefined, 'geen training op de feestdag, want de zaal is standaard dicht');

  const overige = db._sqlite.prepare(`SELECT count(*) AS n FROM trainingen WHERE reeks_id = ${id}`).get().n;
  assert.equal(overige, 4, 'de andere vier dinsdagen van september blijven gewoon staan');
});

test('een zaal die open is op feestdagen, laat de training gewoon doorgaan', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO zalen (id, naam, open_op_feestdagen) VALUES ('z1', 'Sporthal A', 1);
    INSERT INTO periodes (seizoen, naam, van, tot, soort, doelgroep, bron)
         VALUES ('2026-27', 'Feestdag', '2026-09-08', '2026-09-08', 'feestdag', 'iedereen', 'club');
  `);
  const { id } = await maakReeks(db, { zaal_id: 'z1', locatie_tekst: null });
  await reeksGenereren({ db, persoon, request: verzoek(`/x?reeks=${id}&uitvoeren=1`, null, 'POST') });

  const rij = db._sqlite.prepare(`SELECT * FROM trainingen WHERE reeks_id = ${id} AND datum = '2026-09-08'`).get();
  assert.ok(rij, 'de training gaat door, want deze zaal is open op feestdagen');
  assert.equal(rij.status, 'gepland');
});

test('open_op_feestdagen via de route gezet, werkt meteen door in de generator', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO zalen (id, naam) VALUES ('z1', 'Sporthal A');
    INSERT INTO periodes (seizoen, naam, van, tot, soort, doelgroep, bron)
         VALUES ('2026-27', 'Feestdag', '2026-09-08', '2026-09-08', 'feestdag', 'iedereen', 'club');
  `);
  const { id } = await maakReeks(db, { zaal_id: 'z1', locatie_tekst: null });

  await zetOpenOpFeestdagen({ db, persoon, request: verzoek('/x', { zaal_id: 'z1', open: true }) });
  await reeksGenereren({ db, persoon, request: verzoek(`/x?reeks=${id}&uitvoeren=1`, null, 'POST') });

  const rij = db._sqlite.prepare(`SELECT * FROM trainingen WHERE reeks_id = ${id} AND datum = '2026-09-08'`).get();
  assert.ok(rij, 'de instelling via de route komt echt aan bij de generator');
});
