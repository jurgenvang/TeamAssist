-- TeamAssist 0.30.0 — het schema van de module Officials (I1, fase 2a).
--
-- Eén keer uitvoeren in de D1-console, in één keer. Daarna schema-controle.sql:
-- bovenaan hoort 'ALLES OK' te staan.
--
-- Wat dit doet, en waarom het geen gewone ALTER is:
--  1. `rollen` wordt heropgebouwd: de CHECK krijgt drie rollen erbij (YOADM, YO,
--     YOPLUS). Een CHECK wijzigen kan SQLite niet met een ALTER. De bestaande
--     rollen gaan mee, met hun id. Niets verwijst naar `rollen`, dus de
--     heropbouw raakt geen andere tabel.
--  2. Drie kolommen met een gewone ALTER: personen.agenda_sleutel,
--     teams.officials (standaard 1, zoals 'volgen' in YOAssist) en
--     wedstrijden.bron (standaard 'vbl').
--  3. De tabellen van de module Officials, nieuw en leeg — op de categorieën
--     en tarieven na. De gegevens uit YOAssist komen pas met de migratie in
--     0.31.0.
--  4. Drie instellingen: facturatie_ontvangers, forfait_aanduiding,
--     extern_namen.
--
-- Een tweede keer uitvoeren faalt op de eerste ALTER ('duplicate column
-- name'): dat betekent dat het al gebeurd is.

-- 1. rollen
CREATE TABLE rollen_nieuw (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  persoon_id TEXT NOT NULL,
  rol        TEXT NOT NULL
             CHECK (rol IN ('ADMIN', 'FINADM', 'YOADM', 'YO', 'YOPLUS', 'COORD', 'COACH', 'PLOEGV')),
  team_guid  TEXT,
  seizoen    TEXT,
  bron       TEXT NOT NULL DEFAULT 'club' CHECK (bron IN ('club', 'vbl')),
  aangemaakt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persoon_id) REFERENCES personen (id),
  CHECK (
    (rol IN ('ADMIN', 'FINADM', 'YOADM', 'YO', 'YOPLUS') AND team_guid IS NULL AND seizoen IS NULL)
    OR
    (rol IN ('COORD', 'COACH', 'PLOEGV') AND team_guid IS NOT NULL AND seizoen IS NOT NULL)
  )
);

INSERT INTO rollen_nieuw (id, persoon_id, rol, team_guid, seizoen, bron, aangemaakt)
SELECT id, persoon_id, rol, team_guid, seizoen, bron, aangemaakt FROM rollen;

DROP TABLE rollen;
ALTER TABLE rollen_nieuw RENAME TO rollen;

CREATE UNIQUE INDEX idx_rollen_uniek
  ON rollen (persoon_id, rol, ifnull(team_guid, ''), ifnull(seizoen, ''));
CREATE INDEX idx_rollen_persoon ON rollen (persoon_id);

-- 2. drie kolommen
ALTER TABLE personen ADD COLUMN agenda_sleutel TEXT;
CREATE UNIQUE INDEX idx_personen_agenda ON personen (agenda_sleutel);
ALTER TABLE teams ADD COLUMN officials INTEGER NOT NULL DEFAULT 1 CHECK (officials IN (0, 1));
ALTER TABLE wedstrijden ADD COLUMN bron TEXT NOT NULL DEFAULT 'vbl' CHECK (bron IN ('vbl', 'handmatig'));

-- 3. de module Officials
CREATE TABLE IF NOT EXISTS officials_categorieen (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  groep       TEXT NOT NULL,
  tarief_cent INTEGER NOT NULL,
  auto_scope  INTEGER NOT NULL DEFAULT 0 CHECK (auto_scope IN (0, 1)),
  volgorde    INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO officials_categorieen (code, label, groep, tarief_cent, auto_scope, volgorde) VALUES
  ('G10', 'U10',            'U10U12', 1500, 1, 10),
  ('G12', 'U12',            'U10U12', 1500, 1, 20),
  ('M12', 'U12 meisjes',    'U10U12', 1500, 1, 30),
  ('G14', 'U14',            'U14',    2000, 0, 40),
  ('M14', 'U14 meisjes',    'U14',    2000, 0, 50),
  ('J16', 'U16',            'U16',    2000, 0, 60),
  ('M16', 'U16 meisjes',    'U16',    2000, 0, 70),
  ('J18', 'U18',            'U18',    2000, 0, 80),
  ('M19', 'U19 meisjes',    'U19',    2000, 0, 90),
  ('J21', 'U21',            'U21',    2000, 0, 100),
  ('HSE', 'Heren senioren', 'SEN',    2500, 0, 110),
  ('DSE', 'Dames senioren', 'SEN',    2500, 0, 120);

CREATE TABLE IF NOT EXISTS officials_wedstrijd (
  wedstrijd_id        INTEGER PRIMARY KEY,
  cat_code            TEXT,
  poule_naam          TEXT,
  off_namen           TEXT,
  off_aantal          INTEGER NOT NULL DEFAULT 0,
  off_gewist          INTEGER NOT NULL DEFAULT 0 CHECK (off_gewist IN (0, 1)),
  scope               INTEGER NOT NULL DEFAULT 0 CHECK (scope IN (0, 1)),
  scope_reden         TEXT CHECK (scope_reden IN ('auto', 'admin', 'woensdag')),
  scope_op            TEXT,
  scope_uit           INTEGER NOT NULL DEFAULT 0 CHECK (scope_uit IN (0, 1)),
  refs_bevestigd      INTEGER NOT NULL DEFAULT 0 CHECK (refs_bevestigd IN (0, 1)),
  refs_bevestigd_door TEXT,
  refs_bevestigd_op   TEXT,
  forfait             TEXT CHECK (forfait IN ('thuis', 'uit', 'beide')),
  bond_officials      INTEGER,
  hash                TEXT,
  aangemaakt          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (wedstrijd_id) REFERENCES wedstrijden (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_officials_wedstrijd_scope ON officials_wedstrijd (scope);

CREATE TABLE IF NOT EXISTS officials_beschikbaarheid (
  persoon_id   TEXT NOT NULL,
  wedstrijd_id INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('ja', 'nee')),
  gewijzigd    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (persoon_id, wedstrijd_id),
  FOREIGN KEY (persoon_id) REFERENCES personen (id),
  FOREIGN KEY (wedstrijd_id) REFERENCES wedstrijden (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_officials_beschikbaarheid_wedstrijd ON officials_beschikbaarheid (wedstrijd_id, status);

CREATE TABLE IF NOT EXISTS officials_aanduidingen (
  wedstrijd_id    INTEGER NOT NULL,
  persoon_id      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'toegewezen' CHECK (status IN ('toegewezen', 'vrijgegeven')),
  toegewezen_door TEXT,
  toegewezen_op   TEXT NOT NULL DEFAULT (datetime('now')),
  gewijzigd_op    TEXT,
  PRIMARY KEY (wedstrijd_id, persoon_id),
  FOREIGN KEY (wedstrijd_id) REFERENCES wedstrijden (id) ON DELETE CASCADE,
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE INDEX IF NOT EXISTS idx_officials_aanduidingen_persoon ON officials_aanduidingen (persoon_id, status);

CREATE TABLE IF NOT EXISTS officials_problemen (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  wedstrijd_id INTEGER NOT NULL,
  persoon_id   TEXT NOT NULL,
  bericht      TEXT NOT NULL,
  gemeld_op    TEXT NOT NULL DEFAULT (datetime('now')),
  afgehandeld  INTEGER NOT NULL DEFAULT 0 CHECK (afgehandeld IN (0, 1)),
  FOREIGN KEY (wedstrijd_id) REFERENCES wedstrijden (id) ON DELETE CASCADE,
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE INDEX IF NOT EXISTS idx_officials_problemen_open ON officials_problemen (afgehandeld, gemeld_op);

CREATE TABLE IF NOT EXISTS officials_maanden (
  maand            TEXT PRIMARY KEY,
  seizoen          TEXT NOT NULL,
  afgesloten_op    TEXT NOT NULL DEFAULT (datetime('now')),
  afgesloten_door  TEXT NOT NULL,
  totaal_cent      INTEGER NOT NULL DEFAULT 0,
  aantal_officials INTEGER NOT NULL DEFAULT 0,
  verstuurd_op     TEXT,
  verstuurd_naar   TEXT
);

CREATE TABLE IF NOT EXISTS officials_vergoeding_regels (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  maand         TEXT NOT NULL,
  persoon_id    TEXT NOT NULL,
  naam          TEXT NOT NULL,
  soort         TEXT NOT NULL DEFAULT 'wedstrijd' CHECK (soort IN ('wedstrijd', 'correctie')),
  betreft_maand TEXT,
  cat_code      TEXT NOT NULL,
  cat_label     TEXT,
  aantal        INTEGER NOT NULL,
  tarief_cent   INTEGER NOT NULL,
  bedrag_cent   INTEGER NOT NULL,
  FOREIGN KEY (maand) REFERENCES officials_maanden (maand) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_officials_vergoeding_maand ON officials_vergoeding_regels (maand, persoon_id);
CREATE INDEX IF NOT EXISTS idx_officials_vergoeding_persoon ON officials_vergoeding_regels (persoon_id, maand);

CREATE TABLE IF NOT EXISTS officials_vergoeding_verwerkt (
  wedstrijd_guid TEXT NOT NULL,
  persoon_id     TEXT NOT NULL,
  maand          TEXT NOT NULL,
  cat_code       TEXT NOT NULL,
  tarief_cent    INTEGER NOT NULL,
  aantal         INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (wedstrijd_guid, persoon_id, maand)
);

CREATE INDEX IF NOT EXISTS idx_officials_verwerkt_persoon ON officials_vergoeding_verwerkt (persoon_id);

CREATE TABLE IF NOT EXISTS officials_voorkeuren (
  persoon_id       TEXT PRIMARY KEY,
  herinner_avond   INTEGER NOT NULL DEFAULT 1 CHECK (herinner_avond IN (0, 1)),
  herinner_ochtend INTEGER NOT NULL DEFAULT 1 CHECK (herinner_ochtend IN (0, 1)),
  gsm_delen        INTEGER NOT NULL DEFAULT 1 CHECK (gsm_delen IN (0, 1)),
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE TABLE IF NOT EXISTS officials_volg_clubs (
  guid            TEXT PRIMARY KEY,
  naam            TEXT,
  toegevoegd_door TEXT NOT NULL,
  toegevoegd      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS officials_volg_wedstrijden (
  guid           TEXT PRIMARY KEY,
  club_guid      TEXT NOT NULL,
  club_naam      TEXT,
  thuis_naam     TEXT NOT NULL,
  uit_naam       TEXT NOT NULL,
  datum          TEXT NOT NULL,
  uur            TEXT NOT NULL,
  cat_code       TEXT,
  vbl_aantal     INTEGER NOT NULL DEFAULT 0,
  vbl_naam       TEXT,
  laatst_gezien  TEXT NOT NULL DEFAULT (datetime('now')),
  bond_officials INTEGER,
  FOREIGN KEY (club_guid) REFERENCES officials_volg_clubs (guid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_officials_volg_datum ON officials_volg_wedstrijden (datum, uur);
CREATE INDEX IF NOT EXISTS idx_officials_volg_club ON officials_volg_wedstrijden (club_guid);

CREATE TABLE IF NOT EXISTS officials_vbl_lijsten (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ontvangen    TEXT NOT NULL DEFAULT (datetime('now')),
  onderwerp    TEXT,
  bestand      TEXT,
  weekend_van  TEXT,
  weekend_tot  TEXT,
  aantal_rijen INTEGER,
  eigen        TEXT,
  meldingen    TEXT,
  status       TEXT NOT NULL CHECK (status IN ('ontvangen', 'verwerkt', 'dubbel', 'fout')),
  fout         TEXT,
  verwerkt_op  TEXT,
  volg         TEXT
);

CREATE INDEX IF NOT EXISTS idx_officials_vbl_lijsten_weekend ON officials_vbl_lijsten (weekend_van, status);

-- 4. instellingen
INSERT OR IGNORE INTO instellingen (sleutel, waarde) VALUES
  ('facturatie_ontvangers', ''),
  ('forfait_aanduiding', 'vrijgeven'),
  ('extern_namen', 'initialen');
