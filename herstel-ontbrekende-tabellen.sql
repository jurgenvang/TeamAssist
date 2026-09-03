CREATE TABLE IF NOT EXISTS accounts (
  sub                TEXT PRIMARY KEY,
  persoon_id         TEXT NOT NULL UNIQUE,
  email              TEXT NOT NULL,
  eerste_aanmelding  TEXT NOT NULL DEFAULT (datetime('now')),
  laatste_aanmelding TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE TABLE IF NOT EXISTS aanmeldingen_wachtrij (
  sub            TEXT PRIMARY KEY,
  email          TEXT NOT NULL,
  eerste_poging  TEXT NOT NULL DEFAULT (datetime('now')),
  laatste_poging TEXT NOT NULL DEFAULT (datetime('now')),
  pogingen       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ouder_kind (
  ouder_id   TEXT NOT NULL,
  kind_id    TEXT NOT NULL,
  aangemaakt TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ouder_id, kind_id),
  FOREIGN KEY (ouder_id) REFERENCES personen (id),
  FOREIGN KEY (kind_id) REFERENCES personen (id),
  CHECK (ouder_id <> kind_id)
);

CREATE TABLE IF NOT EXISTS logboek (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tijdstip    TEXT NOT NULL DEFAULT (datetime('now')),
  soort       TEXT NOT NULL,
  wie         TEXT,
  wat         TEXT NOT NULL,
  details     TEXT,
  afgehandeld INTEGER NOT NULL DEFAULT 1 CHECK (afgehandeld IN (0, 1))
);

CREATE TABLE IF NOT EXISTS instellingen (
  sleutel   TEXT PRIMARY KEY,
  waarde    TEXT,
  gewijzigd TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS periodes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  seizoen   TEXT NOT NULL,
  naam      TEXT NOT NULL,
  van       TEXT NOT NULL,
  tot       TEXT NOT NULL,
  soort     TEXT NOT NULL CHECK (soort IN ('vakantie', 'examens')),
  doelgroep TEXT NOT NULL DEFAULT 'iedereen'
            CHECK (doelgroep IN ('iedereen', 'secundair', 'hoger')),
  bron      TEXT NOT NULL DEFAULT 'club' CHECK (bron IN ('openholidays', 'club')),
  FOREIGN KEY (seizoen) REFERENCES seizoenen (code),
  CHECK (tot >= van)
);

CREATE INDEX IF NOT EXISTS idx_ouder_kind_kind ON ouder_kind (kind_id);
CREATE INDEX IF NOT EXISTS idx_logboek_tijdstip ON logboek (tijdstip);
CREATE INDEX IF NOT EXISTS idx_periodes_seizoen ON periodes (seizoen, van, tot);

INSERT OR IGNORE INTO instellingen (sleutel, waarde) VALUES
  ('bericht_modus', 'omleiden'),
  ('bericht_omleidadres', ''),
  ('clubnaam', 'AB InBev Leuven Bears'),
  ('club_guid', 'BVBL1125'),

  ('testrol_toegelaten', '0'),

  ('stille_periodes', '[{"van_dag":"06-01","tot_dag":"08-15"},{"van_dag":"12-28","tot_dag":"01-03"}]');
