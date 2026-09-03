// De beheerroutes voor ploegen.
//
// Het zwaartepunt: een synchronisatie doet standaard niets. Wie 'uitvoeren'
// vergeet, hoort een droogloop te krijgen en geen uitgevoerde wijziging.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { teamsLijst, teamsSync, teamGevolgd } from '../src/routes/admin/teams.js';

const ORG = {
  naam: 'AB InBev Leuven Bears',
  guid: 'BVBL1125',
  teams: [
    { guid: 'BVBL1125J16  2', naam: 'J16 B' },
    { guid: 'BVBL1125G12  1', naam: 'G12 A' },
    { guid: 'BVBL1125ROL  1', naam: 'Rolstoel' },
  ],
};

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO personen (id, voornaam, achternaam, email)
         VALUES ('p-admin', 'Jurgen', 'van Geijstelen', 'a@b.c');
  `);
  return db;
}

const seizoen = { code: '2026-27', naam: '2026-2027' };
const antwoordOk = () => new Response(JSON.stringify(ORG), { status: 200 });

async function sync(db, zoekstring = '', antwoord = antwoordOk) {
  const oude = globalThis.fetch;
  globalThis.fetch = async () => antwoord();
  try {
    const res = await teamsSync({
      db,
      persoon: { id: 'p-admin' },
      seizoen,
      request: new Request(`https://x/api/admin/teams/sync${zoekstring}`, { method: 'POST' }),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = oude;
  }
}

test('de drie routes staan achter systeem.beheren en zijn niet publiek', () => {
  for (const pad of ['/api/admin/teams', '/api/admin/teams/sync', '/api/admin/teams/gevolgd']) {
    const route = ROUTES.find((r) => r.pad === pad);
    assert.equal(route.recht, 'systeem.beheren', pad);
    assert.notEqual(route.publiek, true, pad);
  }
});

test('zonder uitvoeren wordt er niets weggeschreven', () => {
  // De belangrijkste regel van deze route.
  return sync(zetKlaar()).then(async (uit) => {
    assert.equal(uit.body.droogloop, true);
    assert.equal(uit.body.nieuw.length, 3);
  });
});

test('een droogloop laat de tabel leeg', async () => {
  const db = zetKlaar();
  await sync(db);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM teams`).get();
  assert.equal(aantal.n, 0);
});

test('met uitvoeren komen de ploegen erin, standaard niet gevolgd', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const rijen = db._sqlite.prepare(`SELECT * FROM teams ORDER BY guid`).all();
  assert.equal(rijen.length, 3);
  assert.ok(rijen.every((r) => r.gevolgd === 0), 'een nieuwe ploeg start op niet-volgen');
  assert.equal(rijen.find((r) => r.categorie === 'J16').onderwijsgroep, 'secundair');
});

test('een tweede synchronisatie maakt geen dubbels', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const uit = await sync(db, '?uitvoeren=1');
  assert.equal(uit.body.nieuw.length, 0);
  assert.equal(uit.body.ongewijzigd.length, 3);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM teams`).get();
  assert.equal(aantal.n, 3);
});

test('een synchronisatie overschrijft de keuze om een ploeg te volgen niet', async () => {
  // Dat is een beslissing van de club en geen gegeven van de bond.
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  db._sqlite.exec(`UPDATE teams SET gevolgd = 1 WHERE categorie = 'J16'`);
  await sync(db, '?uitvoeren=1');
  const rij = db._sqlite.prepare(`SELECT gevolgd FROM teams WHERE categorie = 'J16'`).get();
  assert.equal(rij.gevolgd, 1);
});

test('een verdwenen ploeg wordt gemarkeerd, niet verwijderd', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const minderTeams = () =>
    new Response(JSON.stringify({ ...ORG, teams: ORG.teams.slice(0, 2) }), { status: 200 });
  await sync(db, '?uitvoeren=1', minderTeams);

  const rij = db._sqlite.prepare(`SELECT * FROM teams WHERE categorie = 'ROL'`).get();
  assert.ok(rij, 'de rij hoort te blijven bestaan');
  assert.equal(rij.bij_bond, 0);
});

test('een leeg antwoord zet niets weg en logt dat', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const leeg = () => new Response(JSON.stringify({ guid: 'BVBL1125', teams: [] }), { status: 200 });
  const uit = await sync(db, '?uitvoeren=1', leeg);

  assert.equal(uit.body.status, 'deels');
  const nog = db._sqlite.prepare(`SELECT count(*) AS n FROM teams WHERE bij_bond = 1`).get();
  assert.equal(nog.n, 3, 'geen enkele ploeg mag weggezet zijn');

  const regel = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.equal(regel.afgehandeld, 0, 'dit hoort opvolging te vragen');
});

test('een storing bij de bond geeft 502 en raakt de tabel niet aan', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const stuk = () => new Response('<html>Request Error</html>', { status: 200 });
  const uit = await sync(db, '?uitvoeren=1', stuk);

  assert.equal(uit.status, 502);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM teams WHERE bij_bond = 1`).get();
  assert.equal(aantal.n, 3);
});

test('een ploeg aanvinken werkt en staat in het logboek', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const res = await teamGevolgd({
    db,
    persoon: { id: 'p-admin' },
    seizoen,
    request: new Request('https://x/api/admin/teams/gevolgd', {
      method: 'POST',
      body: JSON.stringify({ guid: 'BVBL1125J16  2', gevolgd: true }),
    }),
  });
  assert.equal(res.status, 200);
  const rij = db._sqlite.prepare(`SELECT gevolgd FROM teams WHERE guid = 'BVBL1125J16  2'`).get();
  assert.equal(rij.gevolgd, 1);
  const regel = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.match(regel.wat, /gevolgd/);
});

test('een onbestaande ploeg aanvinken geeft 404', async () => {
  const db = zetKlaar();
  const res = await teamGevolgd({
    db,
    persoon: { id: 'p-admin' },
    seizoen,
    request: new Request('https://x/api/admin/teams/gevolgd', {
      method: 'POST',
      body: JSON.stringify({ guid: 'BVBL9999ZZZ  1', gevolgd: true }),
    }),
  });
  assert.equal(res.status, 404);
});

test('de lijst toont enkel ploegen van het gevraagde seizoen', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2025-26', '2025-2026', 0);
    INSERT INTO teams (guid, seizoen, naam, categorie) VALUES ('BVBL1125J18  1', '2025-26', 'oud', 'J18');
  `);
  const res = await teamsLijst({ db, seizoen });
  const body = await res.json();
  assert.equal(body.teams.length, 3);
});

test('een synchronisatie leest de clubnaam-instelling en berekent naam_kort ermee', async () => {
  const db = zetKlaar();
  // De standaardinstelling 'clubnaam' staat al in het schema, geen eigen
  // INSERT nodig — die zou botsen met de bestaande rij.
  const zonderClubnaamInDeMockdata = {
    naam: 'AB InBev Leuven Bears', guid: 'BVBL1125',
    teams: [{ guid: 'BVBL1125G12  1', naam: 'AB InBev Leuven Bears G12 A' }],
  };
  await sync(db, '?uitvoeren=1', () => new Response(JSON.stringify(zonderClubnaamInDeMockdata), { status: 200 }));
  const rij = db._sqlite.prepare(`SELECT naam_kort FROM teams WHERE guid = 'BVBL1125G12  1'`).get();
  assert.equal(rij.naam_kort, 'U12 A');
});

test('zonder de clubnaam-instelling zelf, gebeurt er geen crash, naam_kort valt netjes terug', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`DELETE FROM instellingen WHERE sleutel = 'clubnaam'`);
  await sync(db, '?uitvoeren=1');
  const rij = db._sqlite.prepare(`SELECT naam, naam_kort FROM teams WHERE guid = 'BVBL1125G12  1'`).get();
  assert.equal(rij.naam_kort, 'U12 A');
});
