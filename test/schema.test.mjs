// Het schema zelf.
//
// De CHECK-regels in schema.sql zijn geen versiering: ze houden combinaties
// tegen die de rechtenlaag niet zinnig kan uitrekenen. Als ze ooit sneuvelen
// bij een herbouw, hoort dat hier op te vallen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie)
         VALUES ('BVBL1125J16  2', '2026-27', 'J16 B', 'J16');
    INSERT INTO personen (id, voornaam, achternaam, email)
         VALUES ('p1', 'Dries', 'van Geijstelen Forier', 'dries@example.org');
  `);
  return db;
}

test('een clubbrede rol mag geen ploeg dragen', () => {
  const db = zetKlaar();
  assert.throws(() =>
    db._sqlite.exec(
      `INSERT INTO rollen (persoon_id, rol, team_guid, seizoen)
            VALUES ('p1', 'ADMIN', 'BVBL1125J16  2', '2026-27')`
    )
  );
});

test('een ploegrol moet een ploeg en een seizoen dragen', () => {
  const db = zetKlaar();
  assert.throws(() =>
    db._sqlite.exec(`INSERT INTO rollen (persoon_id, rol) VALUES ('p1', 'COACH')`)
  );
  assert.throws(() =>
    db._sqlite.exec(
      `INSERT INTO rollen (persoon_id, rol, team_guid) VALUES ('p1', 'COACH', 'BVBL1125J16  2')`
    )
  );
});

test('SPELER en OUVO staan niet in de rollen-tabel', () => {
  // Ze worden afgeleid uit team_spelers en ouder_kind. Ze hier toch kunnen
  // invoegen zou een tweede bron van waarheid opleveren.
  const db = zetKlaar();
  assert.throws(() =>
    db._sqlite.exec(
      `INSERT INTO rollen (persoon_id, rol, team_guid, seizoen)
            VALUES ('p1', 'SPELER', 'BVBL1125J16  2', '2026-27')`
    )
  );
  assert.throws(() =>
    db._sqlite.exec(
      `INSERT INTO rollen (persoon_id, rol, team_guid, seizoen)
            VALUES ('p1', 'OUVO', 'BVBL1125J16  2', '2026-27')`
    )
  );
});

test('dezelfde rol twee keer toekennen kan niet', () => {
  const db = zetKlaar();
  db._sqlite.exec(
    `INSERT INTO rollen (persoon_id, rol, team_guid, seizoen)
          VALUES ('p1', 'COACH', 'BVBL1125J16  2', '2026-27')`
  );
  assert.throws(() =>
    db._sqlite.exec(
      `INSERT INTO rollen (persoon_id, rol, team_guid, seizoen)
            VALUES ('p1', 'COACH', 'BVBL1125J16  2', '2026-27')`
    )
  );
});

test('dezelfde clubbrede rol twee keer toekennen kan ook niet', () => {
  // De unieke index gebruikt ifnull(), anders zou SQLite twee NULL-ploegen als
  // verschillend beschouwen en zou ADMIN dubbel kunnen staan.
  const db = zetKlaar();
  db._sqlite.exec(`INSERT INTO rollen (persoon_id, rol) VALUES ('p1', 'ADMIN')`);
  assert.throws(() =>
    db._sqlite.exec(`INSERT INTO rollen (persoon_id, rol) VALUES ('p1', 'ADMIN')`)
  );
});

test('twee personen met hetzelfde e-mailadres kan niet', () => {
  const db = zetKlaar();
  assert.throws(() =>
    db._sqlite.exec(
      `INSERT INTO personen (id, voornaam, achternaam, email)
            VALUES ('p2', 'Ander', 'Persoon', 'dries@example.org')`
    )
  );
});

test('meerdere personen zonder e-mailadres kan wel', () => {
  // Een speler van tien heeft er vaak geen. De unieke index op email mag daar
  // niet over vallen.
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p2', 'Max', 'Cuyvers');
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p3', 'Arno', 'Daniels');
  `);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM personen`).get();
  assert.equal(aantal.n, 3);
});

test('een relatie-GUID kan maar bij één persoon horen', () => {
  const db = zetKlaar();
  db._sqlite.exec(
    `UPDATE personen SET rel_guid = 'REL-717331' WHERE id = 'p1'`
  );
  assert.throws(() =>
    db._sqlite.exec(
      `INSERT INTO personen (id, voornaam, achternaam, rel_guid)
            VALUES ('p2', 'Dubbel', 'Ingelezen', 'REL-717331')`
    )
  );
});

test('iemand kan niet zijn eigen ouder zijn', () => {
  const db = zetKlaar();
  assert.throws(() =>
    db._sqlite.exec(`INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('p1', 'p1')`)
  );
});

test('een account verwijst naar een bestaande persoon', () => {
  const db = zetKlaar();
  assert.throws(() =>
    db._sqlite.exec(
      `INSERT INTO accounts (sub, persoon_id, email)
            VALUES ('sub-1', 'bestaat-niet', 'x@example.org')`
    )
  );
});

test('één persoon kan niet aan twee aanmeldidentiteiten hangen', () => {
  const db = zetKlaar();
  db._sqlite.exec(
    `INSERT INTO accounts (sub, persoon_id, email) VALUES ('sub-1', 'p1', 'dries@example.org')`
  );
  assert.throws(() =>
    db._sqlite.exec(
      `INSERT INTO accounts (sub, persoon_id, email) VALUES ('sub-2', 'p1', 'dries@example.org')`
    )
  );
});

test('de berichtmodus staat bij een verse installatie op omleiden', () => {
  // Er is geen aparte testomgeving, dus de rem zit hier. Zou deze waarde ooit
  // op 'normaal' komen te staan in schema.sql, dan vertrekken bij de eerste
  // installatie meteen echte mails.
  const db = zetKlaar();
  const rij = db._sqlite
    .prepare(`SELECT waarde FROM instellingen WHERE sleutel = 'bericht_modus'`)
    .get();
  assert.equal(rij.waarde, 'omleiden');
});
