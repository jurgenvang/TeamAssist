// De leesroutes.
//
// Hier wordt bewezen dat het rechtenmodel niet enkel bepaalt wie binnen mag,
// maar ook hoeveel iemand te zien krijgt. Een coach ziet zijn spelerslijst; hun
// geboortedata en adressen blijven voor ADMIN.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { teamLeden, personenZoeken } from '../src/routes/admin/bekijken.js';
import { bouwRechten } from '../src/lib/rechten.js';

const J16 = 'BVBL1125J16  2';
const G12 = 'BVBL1125G12  1';
const seizoen = { code: '2026-27', naam: '2026-2027' };

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd) VALUES
      ('${J16}', '2026-27', 'J16 B', 'J16', 1),
      ('${G12}', '2026-27', 'G12 A', 'G12', 1);

    INSERT INTO personen (id, voornaam, achternaam, naam_vbl, naam_bron, lid_nr, geboortedatum, email) VALUES
      ('p1', 'Dries', 'van Geijstelen Forier', 'Dries van Geijstelen Forier', 'afgeleid', '717331', '2010-03-17', NULL),
      ('p2', 'Otto', 'Muñiz Espinoza', 'Otto Muñiz Espinoza', 'afgeleid', '730885', '2010-11-02', NULL),
      ('p3', 'Max', 'Cuyvers', 'Max Cuyvers', 'afgeleid', '725314', '2010-06-25', NULL),
      ('pc', 'Dieter', 'Devroey', 'Dieter Devroey', 'afgeleid', '48713', NULL, 'coach@example.org'),
      ('pw', 'Weg', 'Gegaan', NULL, 'club', NULL, NULL, NULL);
    UPDATE personen SET actief = 0 WHERE id = 'pw';

    INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES
      ('p1', '${J16}', '2026-27'), ('p2', '${J16}', '2026-27'), ('p3', '${G12}', '2026-27');
    INSERT INTO rollen (persoon_id, rol, team_guid, seizoen, bron)
         VALUES ('pc', 'COACH', '${J16}', '2026-27', 'vbl');
  `);
  return db;
}

const adminRechten = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] });
const coachRechten = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: J16 }] });

async function leden(db, rechten, guid = J16) {
  const res = await teamLeden({
    db,
    rechten,
    seizoen,
    request: new Request(`https://x/api/admin/team-leden?team=${encodeURIComponent(guid)}`),
  });
  return { status: res.status, body: await res.json() };
}

test('de routes vragen het juiste recht', () => {
  const leden = ROUTES.find((r) => r.pad === '/api/admin/team-leden');
  assert.equal(leden.recht, 'team.spelers.bekijken');
  assert.equal(typeof leden.team, 'function', 'het recht hoort op de gevraagde ploeg te slaan');

  const zoeken = ROUTES.find((r) => r.pad === '/api/admin/personen');
  assert.equal(zoeken.recht, 'personen.beheren');
});

test('de ploeg uit de vraag bepaalt op welke ploeg het recht slaat', () => {
  // Zonder deze afleiding zou een coach van J16 ook G12 kunnen opvragen.
  const route = ROUTES.find((r) => r.pad === '/api/admin/team-leden');
  const verzoek = new Request(`https://x/api/admin/team-leden?team=${encodeURIComponent(G12)}`);
  assert.equal(route.team(verzoek), G12);
});

test('een beheerder ziet de geboortedata', async () => {
  const uit = await leden(zetKlaar(), adminRechten);
  assert.equal(uit.body.toont_persoonsgegevens, true);
  assert.equal(uit.body.spelers.length, 2);
  const dries = uit.body.spelers.find((s) => s.voornaam === 'Dries');
  assert.equal(dries.geboortedatum, '2010-03-17');
});

test('de lijst sorteert hoofdletterongevoelig op achternaam', async () => {
  // Zonder lower() komt 'van Geijstelen' na 'Muñiz', en een Nederlandstalige
  // ledenlijst staat vol tussenvoegsels.
  const uit = await leden(zetKlaar(), adminRechten);
  assert.deepEqual(
    uit.body.spelers.map((s) => s.voornaam),
    ['Otto', 'Dries']
  );
});

test('een coach ziet zijn spelers maar niet hun geboortedata', async () => {
  const uit = await leden(zetKlaar(), coachRechten);
  assert.equal(uit.body.toont_persoonsgegevens, false);
  assert.equal(uit.body.spelers.length, 2);
  for (const speler of uit.body.spelers) {
    assert.equal(speler.geboortedatum, undefined, 'geen geboortedatum voor een coach');
    assert.equal(speler.email, undefined);
    assert.ok(speler.achternaam, 'de naam hoort hij wel te zien');
  }
});

test('de staf komt mee met haar rol en herkomst', async () => {
  const uit = await leden(zetKlaar(), adminRechten);
  assert.equal(uit.body.staf.length, 1);
  assert.equal(uit.body.staf[0].rol, 'COACH');
  assert.equal(uit.body.staf[0].bron, 'vbl');
});

test('een inactieve persoon staat niet in de lijst', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES ('pw', '${J16}', '2026-27')`);
  const uit = await leden(db, adminRechten);
  assert.equal(uit.body.spelers.length, 2);
});

test('een onbestaande ploeg geeft 404', async () => {
  const uit = await leden(zetKlaar(), adminRechten, 'BVBL9999ZZZ  1');
  assert.equal(uit.status, 404);
});

test('zonder ploeg volgt een 400', async () => {
  const res = await teamLeden({
    db: zetKlaar(),
    rechten: adminRechten,
    seizoen,
    request: new Request('https://x/api/admin/team-leden'),
  });
  assert.equal(res.status, 400);
});

test('de naamherkomst komt mee, zodat een foute splitsing opvalt', async () => {
  const uit = await leden(zetKlaar(), adminRechten);
  const dries = uit.body.spelers.find((s) => s.voornaam === 'Dries');
  assert.equal(dries.naam_bron, 'afgeleid');
  assert.equal(dries.naam_vbl, 'Dries van Geijstelen Forier');
});

async function zoek(db, term) {
  const res = await personenZoeken({
    db,
    seizoen,
    request: new Request(`https://x/api/admin/personen?zoek=${encodeURIComponent(term)}`),
  });
  return { status: res.status, body: await res.json() };
}

test('zoeken op een deel van de achternaam werkt', async () => {
  const uit = await zoek(zetKlaar(), 'cuyv');
  assert.equal(uit.body.aantal, 1);
  assert.equal(uit.body.personen[0].voornaam, 'Max');
});

test('zoeken werkt over de volledige naam heen', async () => {
  const uit = await zoek(zetKlaar(), 'dries van geij');
  assert.equal(uit.body.aantal, 1);
});

test('zoeken op lidnummer werkt', async () => {
  const uit = await zoek(zetKlaar(), '48713');
  assert.equal(uit.body.personen[0].achternaam, 'Devroey');
});

test('de ploegen van een persoon komen mee', async () => {
  const uit = await zoek(zetKlaar(), 'muñiz');
  assert.deepEqual(uit.body.personen[0].ploegen, ['J16 B']);
});

test('een te korte zoekterm wordt geweigerd', async () => {
  // Anders is dit een knop die de volledige ledenlijst teruggeeft.
  for (const term of ['', 'a', ' ']) {
    const uit = await zoek(zetKlaar(), term);
    assert.equal(uit.status, 400, `'${term}' hoort geweigerd te worden`);
  }
});

test('een inactieve persoon is wel te vinden, maar staat onderaan', async () => {
  // Een beheerder moet iemand die op verwijderen staat nog kunnen terugvinden.
  const uit = await zoek(zetKlaar(), 'ega');
  assert.equal(uit.body.personen[0].actief, 0);
});
