// Een persoon bekijken en aanpassen.
//
// Het zwaartepunt ligt op de bron-vlag. Zonder die vlag zou elke correctie de
// eerstvolgende synchronisatie weer verdwijnen; met een te ruime toepassing
// ervan zou één keer opslaan de synchronisatie voorgoed uitschakelen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { persoonTonen, persoonBewaren, persoonActief, controleer } from '../src/routes/admin/persoon.js';

const seizoen = { code: '2026-27', naam: '2026-2027' };
const beheerder = { id: 'p-admin' };

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd)
         VALUES ('BVBL1125J16  2', '2026-27', 'J16 B', 'J16', 1);
    INSERT INTO personen (id, voornaam, achternaam, naam_vbl, naam_bron, rel_guid, lid_nr,
                          geboortedatum, geboortedatum_bron, email)
         VALUES ('p1', 'Anna', 'Maria Peeters', 'Anna Maria Peeters', 'afgeleid', 'REL-1',
                 '717331', '2011-01-01', 'vbl', NULL);
    INSERT INTO personen (id, voornaam, achternaam, email)
         VALUES ('p-admin', 'Jurgen', 'van Geijstelen', 'a@b.c');
    INSERT INTO team_spelers (persoon_id, team_guid, seizoen)
         VALUES ('p1', 'BVBL1125J16  2', '2026-27');
  `);
  return db;
}

async function bewaar(db, body) {
  const res = await persoonBewaren({
    db,
    persoon: beheerder,
    request: new Request('https://x/api/admin/persoon', { method: 'POST', body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}

const lees = (db, id = 'p1') => db._sqlite.prepare(`SELECT * FROM personen WHERE id = ?`).get(id);

test('de drie routes vragen het recht om personen te beheren', () => {
  for (const pad of ['/api/admin/persoon', '/api/admin/persoon/actief']) {
    for (const route of ROUTES.filter((r) => r.pad === pad)) {
      assert.equal(route.recht, 'personen.beheren', `${route.methode} ${pad}`);
      assert.notEqual(route.publiek, true);
    }
  }
});

test('de details komen met ploegen en rollen', async () => {
  const res = await persoonTonen({
    db: zetKlaar(),
    seizoen,
    request: new Request('https://x/api/admin/persoon?id=p1'),
  });
  const body = await res.json();
  assert.equal(body.persoon.voornaam, 'Anna');
  assert.equal(body.ploegen.length, 1);
  assert.ok(body.aanpasbaar.includes('geboortedatum'));
});

test('een naamcorrectie zet de bron op club', async () => {
  // Het geval waarvoor dit scherm bestaat: een dubbele voornaam met een spatie.
  const db = zetKlaar();
  const uit = await bewaar(db, { id: 'p1', voornaam: 'Anna Maria', achternaam: 'Peeters' });
  assert.equal(uit.status, 200);

  const rij = lees(db);
  assert.equal(rij.voornaam, 'Anna Maria');
  assert.equal(rij.naam_bron, 'club');
  assert.equal(rij.naam_vbl, 'Anna Maria Peeters', 'de naam van de bond blijft bewaard');
});

test('een geboortedatum aanpassen zet enkel die bron op club', async () => {
  const db = zetKlaar();
  await bewaar(db, { id: 'p1', geboortedatum: '2011-02-03' });
  const rij = lees(db);
  assert.equal(rij.geboortedatum_bron, 'club');
  assert.equal(rij.naam_bron, 'afgeleid', 'de naam hoort niet mee te veranderen');
});

test('opslaan zonder iets te wijzigen laat de bron-vlaggen ongemoeid', async () => {
  // Anders zou een scherm dat alle velden terugstuurt de synchronisatie in één
  // klik volledig uitschakelen.
  const db = zetKlaar();
  const uit = await bewaar(db, {
    id: 'p1',
    voornaam: 'Anna',
    achternaam: 'Maria Peeters',
    geboortedatum: '2011-01-01',
  });
  assert.deepEqual(uit.body.gewijzigd, []);
  const rij = lees(db);
  assert.equal(rij.naam_bron, 'afgeleid');
  assert.equal(rij.geboortedatum_bron, 'vbl');
});

test('een adres invullen raakt geen enkele bron-vlag', async () => {
  const db = zetKlaar();
  await bewaar(db, { id: 'p1', straat: 'Bondgenotenlaan', nummer: '1', postcode: '3000', gemeente: 'Leuven' });
  const rij = lees(db);
  assert.equal(rij.gemeente, 'Leuven');
  assert.equal(rij.naam_bron, 'afgeleid');
  assert.equal(rij.geboortedatum_bron, 'vbl');
});

test('velden van de bond zijn niet aanpasbaar', async () => {
  const db = zetKlaar();
  const uit = await bewaar(db, { id: 'p1', rel_guid: 'REL-999', lid_nr: '000', naam_vbl: 'gehackt' });
  assert.equal(uit.status, 400, 'er valt niets aanpasbaars te wijzigen');
  const rij = lees(db);
  assert.equal(rij.rel_guid, 'REL-1');
  assert.equal(rij.lid_nr, '717331');
});

test('een leeg veld wordt null en geen lege tekst', async () => {
  const db = zetKlaar();
  await bewaar(db, { id: 'p1', tel_gsm: '   ' });
  assert.equal(lees(db).tel_gsm, null);
});

test('een onbestaande geboortedatum wordt geweigerd', async () => {
  const uit = await bewaar(zetKlaar(), { id: 'p1', geboortedatum: '2011-02-31' });
  assert.equal(uit.status, 400);
  assert.match(uit.body.fout, /bestaat niet/);
});

test('een verkeerd datumformaat wordt geweigerd', async () => {
  const uit = await bewaar(zetKlaar(), { id: 'p1', geboortedatum: '01-01-2011' });
  assert.equal(uit.status, 400);
});

test('een adres zonder apenstaartje wordt geweigerd', async () => {
  const uit = await bewaar(zetKlaar(), { id: 'p1', email: 'geen adres' });
  assert.equal(uit.status, 400);
});

test('een e-mailadres dat al bij iemand anders staat, geeft 409', async () => {
  // Het adres is de sleutel naar een account; twee personen ermee kan niet.
  const db = zetKlaar();
  const uit = await bewaar(db, { id: 'p1', email: 'a@b.c' });
  assert.equal(uit.status, 409);
  assert.match(uit.body.fout, /iemand anders/);
});

test('een achternaam mag niet leeg worden', async () => {
  const uit = await bewaar(zetKlaar(), { id: 'p1', achternaam: '' });
  assert.equal(uit.status, 400);
});

test('gsm_delen aanvaardt enkel de twee bekende standen', () => {
  assert.equal(controleer({ gsm_delen: 'team' }).length, 0);
  assert.equal(controleer({ gsm_delen: 'iedereen' }).length, 1);
});

test('een onbestaande persoon geeft 404', async () => {
  const uit = await bewaar(zetKlaar(), { id: 'bestaat-niet', voornaam: 'X' });
  assert.equal(uit.status, 404);
});

test('elke wijziging komt in het logboek', async () => {
  const db = zetKlaar();
  await bewaar(db, { id: 'p1', voornaam: 'Anna Maria' });
  const regel = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.match(regel.wat, /aangepast/);
  assert.equal(regel.wie, 'p-admin');
});

async function zetActief(db, id, actief) {
  const res = await persoonActief({
    db,
    persoon: beheerder,
    request: new Request('https://x/api/admin/persoon/actief', {
      method: 'POST',
      body: JSON.stringify({ id, actief }),
    }),
  });
  return { status: res.status, body: await res.json() };
}

test('op te verwijderen zetten maakt inactief en noteert wanneer', async () => {
  const db = zetKlaar();
  await zetActief(db, 'p1', false);
  const rij = lees(db);
  assert.equal(rij.actief, 0);
  assert.ok(rij.inactief_sinds, 'de datum bepaalt wanneer het echt gewist wordt');
});

test('terugdraaien wist de datum weer', async () => {
  const db = zetKlaar();
  await zetActief(db, 'p1', false);
  await zetActief(db, 'p1', true);
  const rij = lees(db);
  assert.equal(rij.actief, 1);
  assert.equal(rij.inactief_sinds, null);
});

test('een beheerder kan zichzelf niet op te verwijderen zetten', async () => {
  // Dat zou hem buitensluiten, met de D1-console als enige weg terug.
  const db = zetKlaar();
  const uit = await zetActief(db, 'p-admin', false);
  assert.equal(uit.status, 400);
  assert.equal(lees(db, 'p-admin').actief, 1);
});
