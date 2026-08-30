// De brug tussen de databank en de rechtenfunctie.
//
// De zuivere functie is elders getest; hier gaat het om de vraag of de juiste
// rijen opgehaald worden — met als lastigste geval de ouder, wiens ploegen niet
// bij hemzelf staan maar bij zijn kind.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { rechtenVoor } from '../src/lib/rechten-db.js';

const J16 = 'BVBL1125J16  2';
const G12 = 'BVBL1125G12  1';

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2025-26', '2025-2026', 0);
    INSERT INTO teams (guid, seizoen, naam, categorie) VALUES ('${J16}', '2026-27', 'J16 B', 'J16');
    INSERT INTO teams (guid, seizoen, naam, categorie) VALUES ('${G12}', '2026-27', 'G12 A', 'G12');
    INSERT INTO teams (guid, seizoen, naam, categorie) VALUES ('${J16}', '2025-26', 'J16 B', 'J16');

    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('coach',  'Dieter', 'Devroey',   'dieter@example.org'),
      ('ouder',  'Ann',    'Peeters',   'ann@example.org'),
      ('kind1',  'Simon',  'Roels',     NULL),
      ('kind2',  'Otto',   'Muniz',     NULL),
      ('vreemde','Jos',    'Vreemd',    'jos@example.org');

    INSERT INTO rollen (persoon_id, rol, team_guid, seizoen)
         VALUES ('coach', 'COACH', '${J16}', '2026-27');

    INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES
      ('kind1', '${J16}', '2026-27'),
      ('kind2', '${G12}', '2026-27');

    INSERT INTO ouder_kind (ouder_id, kind_id) VALUES
      ('ouder', 'kind1'),
      ('ouder', 'kind2');
  `);
  return db;
}

test('een coach krijgt zijn ploeg en niet die van een ander', async () => {
  const db = zetKlaar();
  const r = await rechtenVoor(db, 'coach', '2026-27');
  assert.equal(r.mag('team.aanwezigheid.vaststellen', J16), true);
  assert.equal(r.mag('team.aanwezigheid.vaststellen', G12), false);
  assert.deepEqual(r.rollen, ['COACH']);
});

test('een ouder erft de ploegen van zijn twee kinderen', async () => {
  const db = zetKlaar();
  const r = await rechtenVoor(db, 'ouder', '2026-27');
  assert.deepEqual(r.rollen, ['OUVO']);
  assert.equal(r.mag('aanwezigheid.opgeven.kind', J16), true);
  assert.equal(r.mag('aanwezigheid.opgeven.kind', G12), true);
  assert.equal(r.mag('team.aanwezigheid.bekijken', J16), false);
});

test('een speler krijgt zijn eigen ploeg', async () => {
  const db = zetKlaar();
  const r = await rechtenVoor(db, 'kind1', '2026-27');
  assert.deepEqual(r.rollen, ['SPELER']);
  assert.equal(r.mag('aanwezigheid.opgeven.eigen', J16), true);
  assert.equal(r.mag('aanwezigheid.opgeven.eigen', G12), false);
});

test('wie nergens aan hangt, krijgt niets', async () => {
  const db = zetKlaar();
  const r = await rechtenVoor(db, 'vreemde', '2026-27');
  assert.deepEqual(r.rollen, []);
  assert.equal(r.mag('team.bekijken', J16), false);
});

test('een rol uit een ander seizoen telt niet mee', async () => {
  const db = zetKlaar();
  db._sqlite.exec(
    `INSERT INTO rollen (persoon_id, rol, team_guid, seizoen)
          VALUES ('vreemde', 'COACH', '${J16}', '2025-26')`
  );
  const nu = await rechtenVoor(db, 'vreemde', '2026-27');
  assert.equal(nu.mag('team.configureren', J16), false);

  const toen = await rechtenVoor(db, 'vreemde', '2025-26');
  assert.equal(toen.mag('team.configureren', J16), true);
});

test('een speler uit een ander seizoen telt niet mee', async () => {
  const db = zetKlaar();
  const r = await rechtenVoor(db, 'kind1', '2025-26');
  assert.deepEqual(r.rollen, []);
});

test('ADMIN geldt over seizoenen heen', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`INSERT INTO rollen (persoon_id, rol) VALUES ('vreemde', 'ADMIN')`);
  for (const seizoen of ['2026-27', '2025-26']) {
    const r = await rechtenVoor(db, 'vreemde', seizoen);
    assert.equal(r.mag('systeem.beheren'), true, `ADMIN hoort ook in ${seizoen} te gelden`);
  }
});

test('een ouder die ook coach is, houdt beide sets rechten', async () => {
  const db = zetKlaar();
  db._sqlite.exec(
    `INSERT INTO rollen (persoon_id, rol, team_guid, seizoen)
          VALUES ('ouder', 'COACH', '${G12}', '2026-27')`
  );
  const r = await rechtenVoor(db, 'ouder', '2026-27');
  assert.deepEqual(r.rollen, ['COACH', 'OUVO']);
  assert.equal(r.mag('aanwezigheid.opgeven.kind', J16), true);
  assert.equal(r.mag('team.aanwezigheid.vaststellen', G12), true);
  // Ouder van een kind in J16, maar geen coach daar: vaststellen mag niet.
  assert.equal(r.mag('team.aanwezigheid.vaststellen', J16), false);
});
