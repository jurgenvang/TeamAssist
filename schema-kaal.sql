DROP TABLE IF EXISTS taak_runs;
DROP TABLE IF EXISTS wedstrijdselecties;
DROP TABLE IF EXISTS aanwezigheden;
DROP TABLE IF EXISTS wedstrijden;
DROP TABLE IF EXISTS trainingen;
DROP TABLE IF EXISTS trainingsreeksen;
DROP TABLE IF EXISTS periodes;
DROP TABLE IF EXISTS zaal_sluitingen;
DROP TABLE IF EXISTS zaal_blokken;
DROP TABLE IF EXISTS zalen;
DROP TABLE IF EXISTS berichten;
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

  donkere_modus      TEXT NOT NULL DEFAULT 'systeem'
                     CHECK (donkere_modus IN ('systeem', 'licht', 'donker')),

  kanaal_voorkeur    TEXT NOT NULL DEFAULT 'mail'
                     CHECK (kanaal_voorkeur IN ('mail', 'push', 'beide')),
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

  naam_kort      TEXT,
  categorie      TEXT,

  onderwijsgroep TEXT NOT NULL DEFAULT 'geen'
                 CHECK (onderwijsgroep IN ('geen', 'secundair', 'hoger')),
  gevolgd        INTEGER NOT NULL DEFAULT 0 CHECK (gevolgd IN (0, 1)),
  selectie_aan   INTEGER NOT NULL DEFAULT 0 CHECK (selectie_aan IN (0, 1)),

  opgave_toegelaten_training  INTEGER NOT NULL DEFAULT 1 CHECK (opgave_toegelaten_training IN (0, 1)),
  opgave_toegelaten_wedstrijd INTEGER NOT NULL DEFAULT 1 CHECK (opgave_toegelaten_wedstrijd IN (0, 1)),
  opgave_termijn_training_uren  INTEGER NOT NULL DEFAULT 1,
  opgave_termijn_wedstrijd_uren INTEGER NOT NULL DEFAULT 1,

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

CREATE TABLE berichten (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  persoon_id TEXT NOT NULL,
  kanaal     TEXT NOT NULL CHECK (kanaal IN ('mail', 'push')),
  onderwerp  TEXT NOT NULL,
  inhoud     TEXT,
  verzonden  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE INDEX idx_berichten_persoon ON berichten (persoon_id, verzonden);

CREATE TABLE instellingen (
  sleutel   TEXT PRIMARY KEY,
  waarde    TEXT,
  gewijzigd TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO instellingen (sleutel, waarde) VALUES
  ('bericht_modus', 'omleiden'),
  ('bericht_omleidadres', ''),
  ('mail_afzender', 'TeamAssist <noreply@teamassist.org>'),
  ('clubnaam', 'AB InBev Leuven Bears'),
  ('club_guid', 'BVBL1125'),

  ('testrol_toegelaten', '0'),

  ('stille_periodes', '[{"van_dag":"06-01","tot_dag":"08-15"},{"van_dag":"12-28","tot_dag":"01-03"}]');

CREATE TABLE zalen (
  id           TEXT PRIMARY KEY,
  naam         TEXT NOT NULL,
  adres        TEXT,
  vbl_acc_guid TEXT,
  actief       INTEGER NOT NULL DEFAULT 1 CHECK (actief IN (0, 1)),

  open_op_feestdagen INTEGER NOT NULL DEFAULT 0 CHECK (open_op_feestdagen IN (0, 1)),
  aangemaakt   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE zaal_blokken (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  zaal_id  TEXT NOT NULL,
  seizoen  TEXT NOT NULL,
  weekdag  INTEGER NOT NULL CHECK (weekdag BETWEEN 1 AND 7),
  begin    TEXT NOT NULL,
  einde    TEXT NOT NULL,
  FOREIGN KEY (zaal_id) REFERENCES zalen (id),
  FOREIGN KEY (seizoen) REFERENCES seizoenen (code),
  CHECK (einde > begin)
);

CREATE INDEX idx_zaal_blokken_zaal ON zaal_blokken (zaal_id, seizoen);

CREATE TABLE zaal_sluitingen (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  zaal_id TEXT NOT NULL,
  van     TEXT NOT NULL,
  tot     TEXT NOT NULL,
  reden   TEXT,
  FOREIGN KEY (zaal_id) REFERENCES zalen (id),
  CHECK (tot >= van)
);

CREATE INDEX idx_zaal_sluitingen_zaal ON zaal_sluitingen (zaal_id, van, tot);

CREATE TABLE periodes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  seizoen   TEXT NOT NULL,
  naam      TEXT NOT NULL,
  van       TEXT NOT NULL,
  tot       TEXT NOT NULL,
  soort     TEXT NOT NULL CHECK (soort IN ('vakantie', 'examens', 'feestdag')),
  doelgroep TEXT NOT NULL DEFAULT 'iedereen'
            CHECK (doelgroep IN ('iedereen', 'secundair', 'hoger')),
  bron      TEXT NOT NULL DEFAULT 'club' CHECK (bron IN ('openholidays', 'club')),
  FOREIGN KEY (seizoen) REFERENCES seizoenen (code),
  CHECK (tot >= van)
);

CREATE INDEX idx_periodes_seizoen ON periodes (seizoen, van, tot);

CREATE TABLE trainingsreeksen (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_guid     TEXT NOT NULL,
  seizoen       TEXT NOT NULL,
  weekdag       INTEGER NOT NULL CHECK (weekdag BETWEEN 1 AND 7),
  begin         TEXT NOT NULL,
  einde         TEXT NOT NULL,
  zaal_id       TEXT,
  locatie_tekst TEXT,
  van           TEXT NOT NULL,
  tot           TEXT NOT NULL,

  vakantie_doorlopen INTEGER NOT NULL DEFAULT 0 CHECK (vakantie_doorlopen IN (0, 1)),
  actief        INTEGER NOT NULL DEFAULT 1 CHECK (actief IN (0, 1)),
  aangemaakt    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen),
  FOREIGN KEY (zaal_id) REFERENCES zalen (id),
  CHECK (einde > begin),
  CHECK (tot >= van),
  CHECK (zaal_id IS NOT NULL OR locatie_tekst IS NOT NULL)
);

CREATE INDEX idx_trainingsreeksen_team ON trainingsreeksen (team_guid, seizoen);

CREATE TABLE trainingen (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_guid     TEXT NOT NULL,
  seizoen       TEXT NOT NULL,
  reeks_id      INTEGER,
  datum         TEXT NOT NULL,
  begin         TEXT NOT NULL,
  einde         TEXT NOT NULL,
  zaal_id       TEXT,
  locatie_tekst TEXT,
  status        TEXT NOT NULL DEFAULT 'gepland'
                CHECK (status IN ('gepland', 'afgelast', 'verplaatst', 'zaal_niet_beschikbaar')),
  bron          TEXT NOT NULL DEFAULT 'reeks' CHECK (bron IN ('reeks', 'handmatig')),

  handmatig_gewijzigd INTEGER NOT NULL DEFAULT 0 CHECK (handmatig_gewijzigd IN (0, 1)),
  opmerking     TEXT,
  aangemaakt    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen),
  FOREIGN KEY (reeks_id) REFERENCES trainingsreeksen (id),
  FOREIGN KEY (zaal_id) REFERENCES zalen (id),
  CHECK (einde > begin)
);

CREATE INDEX idx_trainingen_team ON trainingen (team_guid, seizoen, datum);
CREATE INDEX idx_trainingen_reeks ON trainingen (reeks_id);

CREATE TABLE wedstrijden (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  wedstrijd_guid  TEXT NOT NULL UNIQUE,
  team_guid       TEXT NOT NULL,
  seizoen         TEXT NOT NULL,
  datum           TEXT NOT NULL,
  begin           TEXT NOT NULL,
  thuis           INTEGER NOT NULL CHECK (thuis IN (0, 1)),
  tegenstander    TEXT,
  locatie_tekst   TEXT,
  vbl_acc_guid    TEXT,
  uitslag         TEXT,
  status          TEXT NOT NULL DEFAULT 'gepland'
                  CHECK (status IN ('gepland', 'afgelast', 'verplaatst')),
  wijzigingshash  TEXT,
  bij_bond        INTEGER NOT NULL DEFAULT 1 CHECK (bij_bond IN (0, 1)),
  laatst_gezien   TEXT,

  selectie_gepubliceerd INTEGER NOT NULL DEFAULT 0 CHECK (selectie_gepubliceerd IN (0, 1)),
  aangemaakt      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen)
);

CREATE INDEX idx_wedstrijden_team ON wedstrijden (team_guid, seizoen, datum);

CREATE TABLE aanwezigheden (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  soort               TEXT NOT NULL CHECK (soort IN ('training', 'wedstrijd')),
  activiteit_id       INTEGER NOT NULL,
  team_guid           TEXT NOT NULL,
  seizoen             TEXT NOT NULL,
  persoon_id          TEXT NOT NULL,
  hoedanigheid        TEXT NOT NULL CHECK (hoedanigheid IN ('SPELER', 'OUVO')),

  opgave_status       TEXT CHECK (opgave_status IN ('aanwezig', 'afwezig')),
  opgave_reden        TEXT CHECK (opgave_reden IN ('ziek', 'gekwetst', 'ander')),
  opgave_toelichting  TEXT,
  opgave_door         TEXT,
  opgave_tijdstip     TEXT,

  uitgesloten         INTEGER NOT NULL DEFAULT 0 CHECK (uitgesloten IN (0, 1)),
  uitgesloten_reden   TEXT,
  uitgesloten_door    TEXT,
  uitgesloten_tijdstip TEXT,

  vaststelling_status TEXT CHECK (vaststelling_status IN ('aanwezig', 'afwezig', 'te_laat')),
  vaststelling_door   TEXT,
  vaststelling_tijdstip TEXT,

  aangemaakt          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persoon_id) REFERENCES personen (id),
  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen),
  CHECK (uitgesloten = 0 OR uitgesloten_reden IS NOT NULL)
);

CREATE UNIQUE INDEX idx_aanwezigheden_uniek ON aanwezigheden (soort, activiteit_id, persoon_id);
CREATE INDEX idx_aanwezigheden_activiteit ON aanwezigheden (soort, activiteit_id);
CREATE INDEX idx_aanwezigheden_persoon ON aanwezigheden (persoon_id, seizoen);

CREATE TABLE wedstrijdselecties (
  wedstrijd_id INTEGER NOT NULL,
  persoon_id   TEXT NOT NULL,
  aangemaakt   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (wedstrijd_id, persoon_id),
  FOREIGN KEY (wedstrijd_id) REFERENCES wedstrijden (id),
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

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
