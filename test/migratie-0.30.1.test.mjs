// De migratie van 0.30.1: wedstrijden heropbouwen zonder dat er iets
// verloren gaat.
//
// Zes tabellen verwijzen naar wedstrijden(id), en D1 laat de foreign keys niet
// uitzetten. Deze test draait met foreign_keys aan, zoals D1, op het schema
// van vóór 0.30.1 — afgeleid uit het huidige door de twee wijzigingen terug te
// draaien — en kijkt na of elke rij er nadien nog is, met dezelfde id.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { maakDb } from './d1.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const lees = (naam) => readFileSync(join(hier, '..', naam), 'utf8');

function vervangEenmaal(tekst, oud, nieuw) {
  assert.equal(tekst.split(oud).length - 1, 1, `verwacht precies één keer: ${oud.slice(0, 60)}`);
  return tekst.replace(oud, nieuw);
}

/** Het schema zoals het in 0.30.0 was. */
function oudSchema() {
  let s = lees('schema.sql');
  s = vervangEenmaal(s, /  -- Niet uniek op zich[^\n]*\n[^\n]*\n  wedstrijd_guid  TEXT NOT NULL,/.exec(s)[0],
    '  wedstrijd_guid  TEXT NOT NULL UNIQUE,');
  s = vervangEenmaal(s, `  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen),
  UNIQUE (wedstrijd_guid, team_guid)
);`, `  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen)
);`);
  return s;
}

const KINDEREN = [
  'wedstrijdselecties', 'wedstrijdtaken', 'officials_wedstrijd',
  'officials_beschikbaarheid', 'officials_aanduidingen', 'officials_problemen',
];

function gevuldeOudeDb() {
  const db = maakDb({ metSchema: false });
  const q = db._sqlite;
  q.exec(oudSchema());
  q.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd) VALUES ('T1', '2026-27', 'A', 'G12', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd) VALUES ('T2', '2026-27', 'B', 'G12', 1);
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p1', 'Een', 'Persoon');
    INSERT INTO wedstrijden (id, wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander)
      VALUES (7, 'W7', 'T1', '2026-27', '2026-11-14', '10:00', 1, 'Gast');
    INSERT INTO wedstrijden (id, wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, bron)
      VALUES (9, 'W9', 'T2', '2026-27', '2026-11-15', '11:00', 0, 'handmatig');
    INSERT INTO wedstrijdselecties (wedstrijd_id, persoon_id) VALUES (7, 'p1');
    INSERT INTO wedstrijdtaken (id, wedstrijd_id, taak, persoon_id) VALUES (3, 7, 'klok', 'p1');
    INSERT INTO officials_wedstrijd (wedstrijd_id, cat_code, scope, scope_reden) VALUES (7, 'G12', 1, 'auto');
    INSERT INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status) VALUES ('p1', 7, 'ja');
    INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id) VALUES (7, 'p1');
    INSERT INTO officials_problemen (id, wedstrijd_id, persoon_id, bericht) VALUES (5, 7, 'p1', 'ziek');
  `);
  return q;
}

const tel = (q, tabel) => q.prepare(`SELECT count(*) AS n FROM ${tabel}`).get().n;

test('het oude schema weigert een onderlinge wedstrijd — dat is de fout', () => {
  const q = gevuldeOudeDb();
  assert.throws(
    () => q.exec(`INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis)
                  VALUES ('W7', 'T2', '2026-27', '2026-11-14', '10:00', 0)`),
    /UNIQUE/
  );
});

test('na de migratie staat alles er nog, met dezelfde id', () => {
  const q = gevuldeOudeDb();
  const voor = Object.fromEntries(KINDEREN.map((t) => [t, q.prepare(`SELECT * FROM ${t}`).all()]));
  q.exec(lees('migratie-0.30.1.sql'));

  assert.deepEqual(q.prepare(`SELECT id, wedstrijd_guid, bron FROM wedstrijden ORDER BY id`).all().map((r) => ({ ...r })), [
    { id: 7, wedstrijd_guid: 'W7', bron: 'vbl' },
    { id: 9, wedstrijd_guid: 'W9', bron: 'handmatig' },
  ]);
  for (const t of KINDEREN) {
    assert.deepEqual(q.prepare(`SELECT * FROM ${t}`).all(), voor[t], `${t} is niet ongewijzigd`);
  }
  assert.deepEqual(q.prepare(`PRAGMA foreign_key_check`).all(), []);
  assert.equal(
    tel(q, `sqlite_master WHERE name LIKE '\\_bewaar%' ESCAPE '\\' OR name = 'wedstrijden_nieuw'`),
    0,
    'de hulptabellen zijn opgeruimd'
  );
});

test('na de migratie kan een onderlinge wedstrijd bij beide ploegen, maar niet twee keer bij dezelfde', () => {
  const q = gevuldeOudeDb();
  q.exec(lees('migratie-0.30.1.sql'));
  q.exec(`INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis)
          VALUES ('W7', 'T2', '2026-27', '2026-11-14', '10:00', 0)`);
  assert.throws(
    () => q.exec(`INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis)
                  VALUES ('W7', 'T2', '2026-27', '2026-11-14', '10:00', 0)`),
    /UNIQUE/
  );
  // Een nieuwe id komt na de hoogste bestaande, niet op een oude plaats.
  assert.equal(q.prepare(`SELECT max(id) AS m FROM wedstrijden`).get().m, 10);
});

test('de heropgebouwde tabel is dezelfde als die in schema.sql', () => {
  const q = gevuldeOudeDb();
  q.exec(lees('migratie-0.30.1.sql'));
  const vers = maakDb()._sqlite;
  const vorm = (db) => ({
    kolommen: db.prepare(`PRAGMA table_info(wedstrijden)`).all().map((k) => ({ ...k })),
    indexen: db
      .prepare(`PRAGMA index_list(wedstrijden)`)
      .all()
      .map((i) => ({
        uniek: i.unique,
        kolommen: db.prepare(`PRAGMA index_info("${i.name}")`).all().map((k) => k.name).join(','),
      }))
      .sort((a, b) => a.kolommen.localeCompare(b.kolommen)),
    fks: db.prepare(`PRAGMA foreign_key_list(wedstrijden)`).all().map((k) => ({ ...k })),
  });
  assert.deepEqual(vorm(q), vorm(vers));
});

test('nogmaals uitvoeren kan geen kwaad', () => {
  const q = gevuldeOudeDb();
  q.exec(lees('migratie-0.30.1.sql'));
  q.exec(lees('migratie-0.30.1.sql'));
  assert.equal(tel(q, 'wedstrijden'), 2);
  for (const t of KINDEREN) assert.equal(tel(q, t), 1, t);
});
