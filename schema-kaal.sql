DROP TABLE IF EXISTS taak_runs;
DROP TABLE IF EXISTS instellingen;
DROP TABLE IF EXISTS logboek;
DROP TABLE IF EXISTS ouder_kind;
DROP TABLE IF EXISTS team_spelers;
DROP TABLE IF EXISTS rollen;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS aanmeldingen_wachtrij;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS personen;
DROP TABLE IF EXISTS seizoenen;

CREATE TABLE seizoenen (
  code        TEXT PRIMARY KEY,
  naam        TEXT NOT NULL,
  actief      INTEGER NOT NULL DEFAULT 0 CHECK (actief IN (0, 1)),
  aangemaakt  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE personen (
  id                 TEXT PRIMARY KEY,
  voornaam           TEXT NOT NULL DEFAULT '',
  achternaam         TEXT NOT NULL DEFAULT '',
  naam_vbl           TEXT,
  naam_bron          TEXT NOT NULL DEFAULT 'club'
                     CHECK (naam_bron IN ('club', 'afgeleid')),
  rel_guid           TEXT UNIQUE,
  lid_nr             TEXT,
  geboortedatum      TEXT,
  geboortedatum_bron TEXT NOT NULL DEFAULT 'club'
                     CHECK (geboortedatum_bron IN ('club', 'vbl')),
  email              TEXT UNIQUE,
  tel_vast           TEXT,
  tel_gsm            TEXT,
  gsm_delen          TEXT NOT NULL DEFAULT 'begeleiding'
                     CHECK (gsm_delen IN ('begeleiding', 'team')),
  straat             TEXT,
  nummer             TEXT,
  bus                TEXT,
  postcode           TEXT,
  gemeente           TEXT,
  actief             INTEGER NOT NULL DEFAULT 1 CHECK (actief IN (0, 1)),
  inactief_sinds     TEXT,

  laatste_aanmeldlink TEXT,
  aangemaakt         TEXT NOT NULL DEFAULT (datetime('now')),
  gewijzigd          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_personen_email ON personen (email);
CREATE INDEX idx_personen_relguid ON personen (rel_guid);

CREATE TABLE accounts (
  sub                TEXT PRIMARY KEY,
  persoon_id         TEXT NOT NULL UNIQUE,
  email              TEXT NOT NULL,
  eerste_aanmelding  TEXT NOT NULL DEFAULT (datetime('now')),
  laatste_aanmelding TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE TABLE aanmeldingen_wachtrij (
  sub            TEXT PRIMARY KEY,
  email          TEXT NOT NULL,
  eerste_poging  TEXT NOT NULL DEFAULT (datetime('now')),
  laatste_poging TEXT NOT NULL DEFAULT (datetime('now')),
  pogingen       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE teams (
  guid           TEXT NOT NULL,
  seizoen        TEXT NOT NULL,
  naam           TEXT NOT NULL,
  categorie      TEXT,

  onderwijsgroep TEXT NOT NULL DEFAULT 'geen'
                 CHECK (onderwijsgroep IN ('geen', 'secundair', 'hoger')),
  gevolgd        INTEGER NOT NULL DEFAULT 0 CHECK (gevolgd IN (0, 1)),
  selectie_aan   INTEGER NOT NULL DEFAULT 0 CHECK (selectie_aan IN (0, 1)),

  bij_bond       INTEGER NOT NULL DEFAULT 1 CHECK (bij_bond IN (0, 1)),
  laatst_gezien  TEXT,
  aangemaakt     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guid, seizoen),
  FOREIGN KEY (seizoen) REFERENCES seizoenen (code)
);

CREATE TABLE rollen (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  persoon_id TEXT NOT NULL,
  rol        TEXT NOT NULL
             CHECK (rol IN ('ADMIN', 'FINADM', 'COORD', 'COACH', 'PLOEGV')),
  team_guid  TEXT,
  seizoen    TEXT,
  bron       TEXT NOT NULL DEFAULT 'club' CHECK (bron IN ('club', 'vbl')),
  aangemaakt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persoon_id) REFERENCES personen (id),
  CHECK (
    (rol IN ('ADMIN', 'FINADM') AND team_guid IS NULL AND seizoen IS NULL)
    OR
    (rol NOT IN ('ADMIN', 'FINADM') AND team_guid IS NOT NULL AND seizoen IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_rollen_uniek
  ON rollen (persoon_id, rol, ifnull(team_guid, ''), ifnull(seizoen, ''));
CREATE INDEX idx_rollen_persoon ON rollen (persoon_id);

CREATE TABLE team_spelers (
  persoon_id TEXT NOT NULL,
  team_guid  TEXT NOT NULL,
  seizoen    TEXT NOT NULL,
  bron       TEXT NOT NULL DEFAULT 'vbl' CHECK (bron IN ('club', 'vbl')),
  bij_bond   INTEGER NOT NULL DEFAULT 1 CHECK (bij_bond IN (0, 1)),
  aangemaakt TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (persoon_id, team_guid, seizoen),
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE INDEX idx_team_spelers_team ON team_spelers (team_guid, seizoen);

CREATE TABLE ouder_kind (
  ouder_id   TEXT NOT NULL,
  kind_id    TEXT NOT NULL,
  aangemaakt TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ouder_id, kind_id),
  FOREIGN KEY (ouder_id) REFERENCES personen (id),
  FOREIGN KEY (kind_id) REFERENCES personen (id),
  CHECK (ouder_id <> kind_id)
);

CREATE INDEX idx_ouder_kind_kind ON ouder_kind (kind_id);

CREATE TABLE logboek (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tijdstip    TEXT NOT NULL DEFAULT (datetime('now')),
  soort       TEXT NOT NULL,
  wie         TEXT,
  wat         TEXT NOT NULL,
  details     TEXT,
  afgehandeld INTEGER NOT NULL DEFAULT 1 CHECK (afgehandeld IN (0, 1))
);

CREATE INDEX idx_logboek_tijdstip ON logboek (tijdstip);

CREATE TABLE instellingen (
  sleutel   TEXT PRIMARY KEY,
  waarde    TEXT,
  gewijzigd TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO instellingen (sleutel, waarde) VALUES
  ('bericht_modus', 'omleiden'),
  ('bericht_omleidadres', ''),
  ('clubnaam', 'AB InBev Leuven Bears'),
  ('club_guid', 'BVBL1125');

CREATE TABLE taak_runs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  taak      TEXT NOT NULL,
  gestart   TEXT NOT NULL DEFAULT (datetime('now')),
  geeindigd TEXT,
  status    TEXT NOT NULL DEFAULT 'bezig'
            CHECK (status IN ('bezig', 'ok', 'deels', 'fout')),
  melding   TEXT
);

CREATE INDEX idx_taak_runs_taak ON taak_runs (taak, gestart);
