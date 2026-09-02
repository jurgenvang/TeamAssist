// De route die spelers en staf binnenhaalt.
//
// Het plan zelf is elders getest; hier gaat het om wat er werkelijk in de
// databank belandt — en vooral om wat er niet in belandt.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { ledenSync } from '../src/routes/admin/leden.js';

const J16 = 'BVBL1125J16  2';

const PLOEGDATA = [
  {
    guid: J16,
    spelers: [
      { lidNr: '717331', relGuid: 'REL-1', naam: 'Dries van Geijstelen Forier', sGebDat: '17-03-2010' },
      { lidNr: '730885', relGuid: 'REL-2', naam: 'Otto Muñiz Espinoza', sGebDat: '02-11-2010' },
      { lidNr: '725314', relGuid: 'REL-3', naam: 'Max Cuyvers', sGebDat: '25-06-2010' },
    ],
    tvlijst: [{ lidNr: '48713', relGuid: 'REL-C1', naam: 'Dieter Devroey', tvCaC: 'Coach' }],
  },
];

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO personen (id, voornaam, achternaam, email)
         VALUES ('p-admin', 'Jurgen', 'van Geijstelen', 'a@b.c');
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd)
         VALUES ('${J16}', '2026-27', 'J16 B', 'J16', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd)
         VALUES ('BVBL1125G12  1', '2026-27', 'G12 A', 'G12', 0);
  `);
  return db;
}

const seizoen = { code: '2026-27', naam: '2026-2027' };
const antwoordOk = () => new Response(JSON.stringify(PLOEGDATA), { status: 200 });

async function sync(db, zoekstring = '', antwoord = antwoordOk) {
  const oude = globalThis.fetch;
  globalThis.fetch = async () => antwoord();
  try {
    const res = await ledenSync({
      db,
      persoon: { id: 'p-admin' },
      seizoen,
      request: new Request(`https://x/api/admin/leden/sync${zoekstring}`, { method: 'POST' }),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = oude;
  }
}

const tel = (db, tabel) => db._sqlite.prepare(`SELECT count(*) AS n FROM ${tabel}`).get().n;

test('de route vraagt het recht om personen te beheren', () => {
  const route = ROUTES.find((r) => r.pad === '/api/admin/leden/sync');
  assert.equal(route.recht, 'personen.beheren');
  assert.notEqual(route.publiek, true);
});

test('een droogloop schrijft niets weg', async () => {
  const db = zetKlaar();
  const uit = await sync(db);
  assert.equal(uit.body.droogloop, true);
  assert.equal(uit.body.totalen.nieuw, 4);
  assert.equal(tel(db, 'personen'), 1, 'enkel de beheerder die er al stond');
  assert.equal(tel(db, 'team_spelers'), 0);
});

test('met uitvoeren komen spelers en coach erin', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  assert.equal(tel(db, 'personen'), 5);
  assert.equal(tel(db, 'team_spelers'), 3, 'de coach hoort niet in team_spelers');

  const coach = db._sqlite
    .prepare(`SELECT r.rol, r.bron FROM rollen r JOIN personen p ON p.id = r.persoon_id
               WHERE p.rel_guid = 'REL-C1'`)
    .get();
  assert.equal(coach.rol, 'COACH');
  assert.equal(coach.bron, 'vbl');
});

test('de naam wordt op de eerste spatie gesplitst en de VBL-naam bewaard', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const rij = db._sqlite.prepare(`SELECT * FROM personen WHERE rel_guid = 'REL-1'`).get();
  assert.equal(rij.voornaam, 'Dries');
  assert.equal(rij.achternaam, 'van Geijstelen Forier');
  assert.equal(rij.naam_vbl, 'Dries van Geijstelen Forier');
  assert.equal(rij.naam_bron, 'afgeleid');
  assert.equal(rij.geboortedatum, '2010-03-17');
});

test('een tweede synchronisatie maakt geen dubbels', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const uit = await sync(db, '?uitvoeren=1');
  assert.equal(uit.body.totalen.nieuw, 0);
  assert.equal(tel(db, 'personen'), 5);
  assert.equal(tel(db, 'team_spelers'), 3);
});

test('enkel gevolgde ploegen worden opgehaald', async () => {
  const db = zetKlaar();
  let opgeroepen = 0;
  await sync(db, '?uitvoeren=1', () => {
    opgeroepen += 1;
    return antwoordOk();
  });
  assert.equal(opgeroepen, 1, 'de niet-gevolgde G12 hoort overgeslagen te worden');
});

test('zonder gevolgde ploeg volgt een duidelijke fout', async () => {
  const db = maakDb();
  db._sqlite.exec(`INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1)`);
  const uit = await sync(db);
  assert.equal(uit.status, 400);
});

test('een bestaande persoon wordt gekoppeld in plaats van gedupliceerd', async () => {
  // De beheerder staat er al in en is ook coach. Zonder matching zou hij twee
  // keer in de databank belanden.
  const db = zetKlaar();
  db._sqlite.exec(
    `UPDATE personen SET voornaam = 'Dieter', achternaam = 'Devroey' WHERE id = 'p-admin'`
  );
  const uit = await sync(db, '?uitvoeren=1');
  assert.equal(uit.body.totalen.koppelen, 1);
  assert.equal(tel(db, 'personen'), 4, 'geen dubbele Dieter');

  const rij = db._sqlite.prepare(`SELECT rel_guid, email FROM personen WHERE id = 'p-admin'`).get();
  assert.equal(rij.rel_guid, 'REL-C1');
  assert.equal(rij.email, 'a@b.c', 'het e-mailadres blijft staan');
});

test('een storing bij één ploeg stopt de rest niet', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`UPDATE teams SET gevolgd = 1 WHERE guid = 'BVBL1125G12  1'`);
  let n = 0;
  await sync(db, '?uitvoeren=1', () => {
    n += 1;
    return n === 1
      ? new Response('<html>Request Error</html>', { status: 200 })
      : antwoordOk();
  });
  const uitslagen = db._sqlite.prepare(`SELECT * FROM logboek WHERE soort = 'fout'`).all();
  assert.equal(uitslagen.length, 1);
  assert.equal(tel(db, 'personen'), 5, 'de tweede ploeg is wel verwerkt');
});

test('een speler die verdwijnt blijft in de ploeg met een vlag', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, rel_guid) VALUES
      ('p-a','A','Een','REL-8'), ('p-b','B','Twee','REL-9'),
      ('p-c','C','Drie','REL-10'), ('p-d','D','Vier','REL-11'),
      ('p-e','E','Vijf','REL-12'), ('p-f','F','Zes','REL-13');
    INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES
      ('p-a','${J16}','2026-27'), ('p-b','${J16}','2026-27'),
      ('p-c','${J16}','2026-27'), ('p-d','${J16}','2026-27'),
      ('p-e','${J16}','2026-27'), ('p-f','${J16}','2026-27');
  `);
  const vijfVanZes = () =>
    new Response(
      JSON.stringify([
        {
          guid: J16,
          spelers: ['REL-8', 'REL-9', 'REL-10', 'REL-11', 'REL-12'].map((g, i) => ({
            relGuid: g,
            naam: `Naam ${i}`,
          })),
          tvlijst: [],
        },
      ]),
      { status: 200 }
    );
  await sync(db, '?uitvoeren=1', vijfVanZes);

  const rij = db._sqlite
    .prepare(`SELECT * FROM team_spelers WHERE persoon_id = 'p-f'`)
    .get();
  assert.ok(rij, 'de rij hoort te blijven bestaan');
  assert.equal(rij.bij_bond, 0);
});

test('een lege spelerslijst haalt niemand uit de ploeg', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const leeg = () => new Response(JSON.stringify([{ guid: J16, spelers: [], tvlijst: [] }]), { status: 200 });
  const uit = await sync(db, '?uitvoeren=1', leeg);

  assert.equal(uit.body.ploegen[0].status, 'deels');
  const nog = db._sqlite
    .prepare(`SELECT count(*) AS n FROM team_spelers WHERE bij_bond = 1`)
    .get();
  assert.equal(nog.n, 3, 'geen enkele speler mag weggezet zijn');
});
