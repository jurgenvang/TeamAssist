DROP TABLE IF EXISTS officials_vbl_lijsten;
DROP TABLE IF EXISTS officials_volg_wedstrijden;
DROP TABLE IF EXISTS officials_volg_clubs;
DROP TABLE IF EXISTS officials_voorkeuren;
DROP TABLE IF EXISTS officials_vergoeding_verwerkt;
DROP TABLE IF EXISTS officials_vergoeding_regels;
DROP TABLE IF EXISTS officials_maanden;
DROP TABLE IF EXISTS officials_problemen;
DROP TABLE IF EXISTS officials_aanduidingen;
DROP TABLE IF EXISTS officials_beschikbaarheid;
DROP TABLE IF EXISTS officials_wedstrijd;
DROP TABLE IF EXISTS officials_categorieen;
DROP TABLE IF EXISTS taak_runs;
DROP TABLE IF EXISTS wedstrijdtaken;
DROP TABLE IF EXISTS wedstrijdselecties;
DROP TABLE IF EXISTS aanwezigheden;
DROP TABLE IF EXISTS wedstrijden;
DROP TABLE IF EXISTS trainingen;
DROP TABLE IF EXISTS trainingsreeksen;
DROP TABLE IF EXISTS periodes;
DROP TABLE IF EXISTS zaal_sluitingen;
DROP TABLE IF EXISTS zaal_blokken;
DROP TABLE IF EXISTS zalen;
DROP TABLE IF EXISTS instellingen;
DROP TABLE IF EXISTS mededeling_gezien;
DROP TABLE IF EXISTS mededelingen;
DROP TABLE IF EXISTS push_abonnementen;
DROP TABLE IF EXISTS berichten;
DROP TABLE IF EXISTS logboek;
DROP TABLE IF EXISTS ouder_toestemming;
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
  gewijzigd          TEXT NOT NULL DEFAULT (datetime('now')),
  agenda_sleutel     TEXT,
  ouders_meelezen    INTEGER CHECK (ouders_meelezen IN (0, 1))
);

CREATE INDEX idx_personen_email ON personen (email);
CREATE INDEX idx_personen_relguid ON personen (rel_guid);
CREATE UNIQUE INDEX idx_personen_agenda ON personen (agenda_sleutel);

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
  officials      INTEGER NOT NULL DEFAULT 1 CHECK (officials IN (0, 1)),
  PRIMARY KEY (guid, seizoen),
  FOREIGN KEY (seizoen) REFERENCES seizoenen (code)
);

CREATE TABLE rollen (
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

CREATE TABLE ouder_toestemming (
  kind_id       TEXT NOT NULL,
  ouder_id      TEXT NOT NULL,
  gevraagd_op   TEXT NOT NULL DEFAULT (datetime('now')),
  antwoord      TEXT CHECK (antwoord IN ('ja', 'nee')),
  beantwoord_op TEXT,
  PRIMARY KEY (kind_id, ouder_id),
  FOREIGN KEY (kind_id) REFERENCES personen (id),
  FOREIGN KEY (ouder_id) REFERENCES personen (id)
);

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
  soort      TEXT,
  kort       TEXT,
  gelezen_op TEXT,
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE INDEX idx_berichten_persoon ON berichten (persoon_id, verzonden);

CREATE TABLE push_abonnementen (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  persoon_id  TEXT NOT NULL,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  toestel     TEXT,
  aangemaakt  TEXT NOT NULL DEFAULT (datetime('now')),
  laatst_ok   TEXT,
  mislukt     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE INDEX idx_push_persoon ON push_abonnementen (persoon_id);

CREATE TABLE mededelingen (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tekst       TEXT NOT NULL,
  link        TEXT,
  link_tekst  TEXT,
  doelgroep   TEXT NOT NULL DEFAULT 'iedereen'
              CHECK (doelgroep IN ('iedereen', 'begeleiding', 'ploeg')),
  team_guid   TEXT,
  seizoen     TEXT,
  geldig_tot  TEXT NOT NULL,
  gezet_door  TEXT NOT NULL,
  gezet_op    TEXT NOT NULL DEFAULT (datetime('now')),
  actief      INTEGER NOT NULL DEFAULT 1 CHECK (actief IN (0, 1)),
  CHECK ((doelgroep = 'ploeg') = (team_guid IS NOT NULL AND seizoen IS NOT NULL))
);

CREATE TABLE mededeling_gezien (
  mededeling_id INTEGER NOT NULL,
  persoon_id    TEXT NOT NULL,
  weggeklikt_op TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (mededeling_id, persoon_id),
  FOREIGN KEY (mededeling_id) REFERENCES mededelingen (id) ON DELETE CASCADE,
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE TABLE instellingen (
  sleutel   TEXT PRIMARY KEY,
  waarde    TEXT,
  gewijzigd TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO instellingen (sleutel, waarde) VALUES
  ('bericht_modus', 'omleiden'),
  ('bericht_omleidadres', ''),
  ('mail_afzender', 'TeamAssist <noreply@clubassist.org>'),
  ('clubnaam', 'AB InBev Leuven Bears'),
  ('club_guid', 'BVBL1125'),
  ('testrol_toegelaten', '0'),
  ('stille_periodes', '[{"van_dag":"06-01","tot_dag":"08-15"},{"van_dag":"12-28","tot_dag":"01-03"}]'),
  ('facturatie_ontvangers', ''),
  ('forfait_aanduiding', 'vrijgeven'),
  ('extern_namen', 'initialen');

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
  wedstrijd_guid  TEXT NOT NULL,
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
  bron            TEXT NOT NULL DEFAULT 'vbl' CHECK (bron IN ('vbl', 'handmatig')),
  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen),
  UNIQUE (wedstrijd_guid, team_guid)
);

CREATE INDEX idx_wedstrijden_team ON wedstrijden (team_guid, seizoen, datum);

CREATE TABLE aanwezigheden (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  soort               TEXT NOT NULL CHECK (soort IN ('training', 'wedstrijd')),
  activiteit_id       INTEGER NOT NULL,
  team_guid           TEXT NOT NULL,
  seizoen             TEXT NOT NULL,
  persoon_id          TEXT,
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

CREATE TABLE wedstrijdtaken (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  wedstrijd_id         INTEGER NOT NULL,
  taak                 TEXT NOT NULL CHECK (taak IN ('klok', '24seconden', 'tablet', 'ploegafgevaardigde')),
  persoon_id           TEXT,
  toegewezen_door      TEXT,
  toegewezen_tijdstip  TEXT,
  probleem_gemeld      INTEGER NOT NULL DEFAULT 0 CHECK (probleem_gemeld IN (0, 1)),
  probleem_reden       TEXT,
  probleem_tijdstip    TEXT,
  aangemaakt           TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (wedstrijd_id) REFERENCES wedstrijden (id),
  FOREIGN KEY (persoon_id) REFERENCES personen (id),
  CHECK (probleem_gemeld = 0 OR probleem_reden IS NOT NULL)
);

CREATE UNIQUE INDEX idx_wedstrijdtaken_uniek ON wedstrijdtaken (wedstrijd_id, taak);
CREATE INDEX idx_wedstrijdtaken_persoon ON wedstrijdtaken (persoon_id);

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

CREATE TABLE officials_categorieen (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  groep       TEXT NOT NULL,
  tarief_cent INTEGER NOT NULL,
  auto_scope  INTEGER NOT NULL DEFAULT 0 CHECK (auto_scope IN (0, 1)),
  volgorde    INTEGER NOT NULL DEFAULT 0
);

INSERT INTO officials_categorieen (code, label, groep, tarief_cent, auto_scope, volgorde) VALUES
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

CREATE TABLE officials_wedstrijd (
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

CREATE INDEX idx_officials_wedstrijd_scope ON officials_wedstrijd (scope);

CREATE TABLE officials_beschikbaarheid (
  persoon_id   TEXT NOT NULL,
  wedstrijd_id INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('ja', 'nee')),
  gewijzigd    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (persoon_id, wedstrijd_id),
  FOREIGN KEY (persoon_id) REFERENCES personen (id),
  FOREIGN KEY (wedstrijd_id) REFERENCES wedstrijden (id) ON DELETE CASCADE
);

CREATE INDEX idx_officials_beschikbaarheid_wedstrijd ON officials_beschikbaarheid (wedstrijd_id, status);

CREATE TABLE officials_aanduidingen (
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

CREATE INDEX idx_officials_aanduidingen_persoon ON officials_aanduidingen (persoon_id, status);

CREATE TABLE officials_problemen (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  wedstrijd_id INTEGER NOT NULL,
  persoon_id   TEXT NOT NULL,
  bericht      TEXT NOT NULL,
  gemeld_op    TEXT NOT NULL DEFAULT (datetime('now')),
  afgehandeld  INTEGER NOT NULL DEFAULT 0 CHECK (afgehandeld IN (0, 1)),
  FOREIGN KEY (wedstrijd_id) REFERENCES wedstrijden (id) ON DELETE CASCADE,
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE INDEX idx_officials_problemen_open ON officials_problemen (afgehandeld, gemeld_op);

CREATE TABLE officials_maanden (
  maand            TEXT PRIMARY KEY,
  seizoen          TEXT NOT NULL,
  afgesloten_op    TEXT NOT NULL DEFAULT (datetime('now')),
  afgesloten_door  TEXT NOT NULL,
  totaal_cent      INTEGER NOT NULL DEFAULT 0,
  aantal_officials INTEGER NOT NULL DEFAULT 0,
  verstuurd_op     TEXT,
  verstuurd_naar   TEXT
);

CREATE TABLE officials_vergoeding_regels (
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

CREATE INDEX idx_officials_vergoeding_maand ON officials_vergoeding_regels (maand, persoon_id);
CREATE INDEX idx_officials_vergoeding_persoon ON officials_vergoeding_regels (persoon_id, maand);

CREATE TABLE officials_vergoeding_verwerkt (
  wedstrijd_guid TEXT NOT NULL,
  persoon_id     TEXT NOT NULL,
  maand          TEXT NOT NULL,
  cat_code       TEXT NOT NULL,
  tarief_cent    INTEGER NOT NULL,
  aantal         INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (wedstrijd_guid, persoon_id, maand)
);

CREATE INDEX idx_officials_verwerkt_persoon ON officials_vergoeding_verwerkt (persoon_id);

CREATE TABLE officials_voorkeuren (
  persoon_id       TEXT PRIMARY KEY,
  herinner_avond   INTEGER NOT NULL DEFAULT 1 CHECK (herinner_avond IN (0, 1)),
  herinner_ochtend INTEGER NOT NULL DEFAULT 1 CHECK (herinner_ochtend IN (0, 1)),
  gsm_delen        INTEGER NOT NULL DEFAULT 1 CHECK (gsm_delen IN (0, 1)),
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE TABLE officials_volg_clubs (
  guid            TEXT PRIMARY KEY,
  naam            TEXT,
  toegevoegd_door TEXT NOT NULL,
  toegevoegd      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE officials_volg_wedstrijden (
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

CREATE INDEX idx_officials_volg_datum ON officials_volg_wedstrijden (datum, uur);
CREATE INDEX idx_officials_volg_club ON officials_volg_wedstrijden (club_guid);

CREATE TABLE officials_vbl_lijsten (
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

CREATE INDEX idx_officials_vbl_lijsten_weekend ON officials_vbl_lijsten (weekend_van, status);
