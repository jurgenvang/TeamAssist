// Mijn voorkeuren: dark mode en het communicatiekanaal.
//
// Het zwaartepunt: de persoon komt uit ctx.persoon (het token), nooit uit de
// request body — iemand kan hier enkel zijn eigen rij wijzigen, wat welke
// route dan ook betreft is er geen 'persoon_id' in de body om te vertrouwen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { voorkeurenBewaren } from '../src/routes/voorkeuren.js';

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p1', 'Anna', 'Peeters', 'a@b.c');
  `);
  return db;
}

function persoonRij(db, id = 'p1') {
  return db._sqlite.prepare(`SELECT * FROM personen WHERE id = ?`).get(id);
}

function verzoek(body) {
  return new Request('https://x', { method: 'POST', body: JSON.stringify(body) });
}

test('standaardwaarden bij een nieuwe persoon: systeem en mail', () => {
  const db = zetKlaar();
  const rij = persoonRij(db);
  assert.equal(rij.donkere_modus, 'systeem');
  assert.equal(rij.kanaal_voorkeur, 'mail');
});

test('donkere_modus bewaren werkt, kanaal_voorkeur blijft dan ongewijzigd', async () => {
  const db = zetKlaar();
  const persoon = persoonRij(db);
  const res = await voorkeurenBewaren({ db, persoon, request: verzoek({ donkere_modus: 'donker' }) });
  assert.equal(res.status, 200);
  const rij = persoonRij(db);
  assert.equal(rij.donkere_modus, 'donker');
  assert.equal(rij.kanaal_voorkeur, 'mail', 'niet meegegeven, dus ongewijzigd');
});

test('kanaal_voorkeur bewaren werkt, donkere_modus blijft dan ongewijzigd', async () => {
  const db = zetKlaar();
  const persoon = persoonRij(db);
  const res = await voorkeurenBewaren({ db, persoon, request: verzoek({ kanaal_voorkeur: 'push' }) });
  assert.equal(res.status, 200);
  const rij = persoonRij(db);
  assert.equal(rij.kanaal_voorkeur, 'push');
  assert.equal(rij.donkere_modus, 'systeem');
});

test('beide tegelijk bewaren werkt', async () => {
  const db = zetKlaar();
  const persoon = persoonRij(db);
  await voorkeurenBewaren({
    db, persoon, request: verzoek({ donkere_modus: 'licht', kanaal_voorkeur: 'beide' }),
  });
  const rij = persoonRij(db);
  assert.equal(rij.donkere_modus, 'licht');
  assert.equal(rij.kanaal_voorkeur, 'beide');
});

test('een ongeldige donkere_modus wordt geweigerd', async () => {
  const db = zetKlaar();
  const persoon = persoonRij(db);
  const res = await voorkeurenBewaren({ db, persoon, request: verzoek({ donkere_modus: 'paars' }) });
  assert.equal(res.status, 400);
  assert.equal(persoonRij(db).donkere_modus, 'systeem', 'niets gewijzigd bij een geweigerde waarde');
});

test('een ongeldig kanaal wordt geweigerd', async () => {
  const db = zetKlaar();
  const persoon = persoonRij(db);
  const res = await voorkeurenBewaren({ db, persoon, request: verzoek({ kanaal_voorkeur: 'sms' }) });
  assert.equal(res.status, 400);
});

test('een lege body geeft een duidelijke fout, geen stille no-op', async () => {
  const db = zetKlaar();
  const persoon = persoonRij(db);
  const res = await voorkeurenBewaren({ db, persoon, request: verzoek({}) });
  assert.equal(res.status, 400);
});

test('een persoon kan enkel zijn eigen rij wijzigen — er is geen persoon_id in de body om te vertrouwen', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p2', 'Bo', 'Anders', 'b@c.d')`);
  const persoon = persoonRij(db, 'p1'); // p1 is aangemeld
  await voorkeurenBewaren({ db, persoon, request: verzoek({ donkere_modus: 'donker' }) });
  assert.equal(persoonRij(db, 'p1').donkere_modus, 'donker');
  assert.equal(persoonRij(db, 'p2').donkere_modus, 'systeem', 'p2 blijft volledig ongemoeid');
});

test('een persoon_id in de body wordt genegeerd — de aangemelde persoon telt, niet wat er meegestuurd wordt', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p2', 'Bo', 'Anders', 'b@c.d')`);
  const persoon = persoonRij(db, 'p1'); // p1 is aangemeld, probeert p2 te wijzigen
  await voorkeurenBewaren({
    db, persoon, request: verzoek({ persoon_id: 'p2', donkere_modus: 'donker' }),
  });
  assert.equal(persoonRij(db, 'p1').donkere_modus, 'donker', 'de wijziging landt bij de aangemelde persoon');
  assert.equal(persoonRij(db, 'p2').donkere_modus, 'systeem', 'nooit bij wie in de body staat');
});
