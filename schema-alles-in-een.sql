-- TeamAssist — schema opnieuw opbouwen, in één keer uitvoerbaar.
--
-- Dit wist alle gegevens. Gebruik het bij een schemawijziging die niet met een
-- ALTER TABLE kan: een gewijzigde CHECK, een hernoemde tabel of een nieuwe
-- foreign key. Een gewone kolom erbij hoort met ALTER te gebeuren.
--
-- De volgorde van de DROP's is omgekeerd aan die van de foreign keys.

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

-- TeamAssist — schema
-- Bron van waarheid voor de databank. Elke wijziging hier hoort in de
-- release-uitleg te staan met een ALTER of een DROP erbij.
--
-- Let op: CREATE TABLE IF NOT EXISTS voegt geen kolommen toe aan een bestaande
-- tabel en meldt dat ook niet. Vandaar geen IF NOT EXISTS in dit bestand.

-- ---------------------------------------------------------------------------
-- Seizoenen
-- ---------------------------------------------------------------------------
-- Alles wat een koppeling is, draagt een seizoen. Er is er precies één actief;
-- die vlag bepaalt waarmee de app standaard werkt.
CREATE TABLE seizoenen (
  code        TEXT PRIMARY KEY,                     -- '2026-27'
  naam        TEXT NOT NULL,
  actief      INTEGER NOT NULL DEFAULT 0 CHECK (actief IN (0, 1)),
  aangemaakt  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Personen
-- ---------------------------------------------------------------------------
-- Iedereen die de club kent: spelers, ouders, coaches, coördinatoren. Een
-- persoon is niet hetzelfde als iemand die zich aanmeldt — een speler van tien
-- staat hier wel en logt nooit in.
--
-- rel_guid en lid_nr zijn optioneel: niet iedereen is aangesloten bij
-- Basketbal Vlaanderen. De sleutel is daarom een eigen id.
--
-- De _bron-kolommen zeggen wie een gegeven mag overschrijven. Staat er 'club',
-- dan heeft iemand het handmatig gezet en laat de synchronisatie het met rust.
CREATE TABLE personen (
  id                 TEXT PRIMARY KEY,
  voornaam           TEXT NOT NULL DEFAULT '',
  achternaam         TEXT NOT NULL DEFAULT '',
  naam_vbl           TEXT,                          -- zoals de bond ze geeft
  naam_bron          TEXT NOT NULL DEFAULT 'club'
                     CHECK (naam_bron IN ('club', 'afgeleid')),
  rel_guid           TEXT UNIQUE,                   -- sleutel bij de bond
  lid_nr             TEXT,
  geboortedatum      TEXT,                          -- 'jjjj-mm-dd'
  geboortedatum_bron TEXT NOT NULL DEFAULT 'club'
                     CHECK (geboortedatum_bron IN ('club', 'vbl')),
  email              TEXT UNIQUE,                   -- mag leeg zijn
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
  inactief_sinds     TEXT,                          -- gezet bij 'te verwijderen'
  -- Wanneer er voor het laatst een aanmeldlink gevraagd werd. Houdt tegen dat
  -- iemand herhaaldelijk mails naar een bekend adres laat sturen.
  laatste_aanmeldlink TEXT,
  aangemaakt         TEXT NOT NULL DEFAULT (datetime('now')),
  gewijzigd          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_personen_email ON personen (email);
CREATE INDEX idx_personen_relguid ON personen (rel_guid);

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
-- De koppeling tussen een Supabase-identiteit en een persoon. Wie zich aanmeldt
-- zonder dat zijn adres bij een persoon staat, komt in de wachtrij hieronder en
-- ziet niets tot een beheerder hem koppelt.
CREATE TABLE accounts (
  sub                TEXT PRIMARY KEY,              -- 'sub' uit het Supabase-token
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

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------
-- Eén rij per ploeg per seizoen: een ploeg-GUID keert elk jaar terug maar hoort
-- bij andere spelers.
CREATE TABLE teams (
  guid           TEXT NOT NULL,                     -- 'BVBL1125J16  2'
  seizoen        TEXT NOT NULL,
  naam           TEXT NOT NULL,
  categorie      TEXT,                              -- 'J16', 'G12', 'HSE'
  -- Bepaalt welke examenperiodes op deze ploeg slaan. Afgeleid uit de
  -- categorie, maar te overschrijven: in een U19 zitten vaak al studenten.
  onderwijsgroep TEXT NOT NULL DEFAULT 'geen'
                 CHECK (onderwijsgroep IN ('geen', 'secundair', 'hoger')),
  gevolgd        INTEGER NOT NULL DEFAULT 0 CHECK (gevolgd IN (0, 1)),
  selectie_aan   INTEGER NOT NULL DEFAULT 0 CHECK (selectie_aan IN (0, 1)),
  -- Staat de ploeg nog bij de bond? Verdwijnt ze daar, dan gaat deze vlag op 0
  -- en blijft de rij bestaan: er hangen spelers en aanwezigheden aan.
  bij_bond       INTEGER NOT NULL DEFAULT 1 CHECK (bij_bond IN (0, 1)),
  laatst_gezien  TEXT,
  aangemaakt     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guid, seizoen),
  FOREIGN KEY (seizoen) REFERENCES seizoenen (code)
);

-- ---------------------------------------------------------------------------
-- Rollen
-- ---------------------------------------------------------------------------
-- Enkel de toegekende rollen staan hier. SPELER volgt uit team_spelers en OUVO
-- uit ouder_kind — die twee afleiden in plaats van bewaren voorkomt dat er twee
-- bronnen van waarheid ontstaan die uit elkaar lopen.
--
-- ADMIN en FINADM gelden clubbreed en over seizoenen heen; de andere rollen
-- gelden voor één ploeg in één seizoen. De CHECK legt dat verschil vast.
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

-- Dezelfde rol twee keer toekennen heeft geen betekenis en zou de
-- rechtenberekening dubbel werk geven.
CREATE UNIQUE INDEX idx_rollen_uniek
  ON rollen (persoon_id, rol, ifnull(team_guid, ''), ifnull(seizoen, ''));
CREATE INDEX idx_rollen_persoon ON rollen (persoon_id);

-- ---------------------------------------------------------------------------
-- Spelers in een ploeg
-- ---------------------------------------------------------------------------
-- bij_bond onthoudt of de speler nog in de spelerslijst van Basketbal
-- Vlaanderen staat. Verdwijnt hij daar, dan gaat die vlag op 0 — de rij blijft,
-- want er hangen aanwezigheden aan.
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

-- ---------------------------------------------------------------------------
-- Ouder en kind
-- ---------------------------------------------------------------------------
-- Meerdere ouders per kind kan; ketens niet. Een ouder erft de ploegen van zijn
-- kinderen, dus deze tabel bepaalt mee wat hij ziet.
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

-- ---------------------------------------------------------------------------
-- Logboek
-- ---------------------------------------------------------------------------
-- Loggen mag de actie zelf nooit laten mislukken: elke schrijfpoging hierin
-- staat in een try/catch.
CREATE TABLE logboek (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tijdstip    TEXT NOT NULL DEFAULT (datetime('now')),
  soort       TEXT NOT NULL,                        -- 'beheer', 'sync', 'taak', 'fout'
  wie         TEXT,                                 -- persoon_id, of NULL bij het systeem
  wat         TEXT NOT NULL,
  details     TEXT,
  afgehandeld INTEGER NOT NULL DEFAULT 1 CHECK (afgehandeld IN (0, 1))
);

CREATE INDEX idx_logboek_tijdstip ON logboek (tijdstip);

-- ---------------------------------------------------------------------------
-- Instellingen
-- ---------------------------------------------------------------------------
-- Clubbrede instellingen als sleutel/waarde. 'bericht_modus' bepaalt wat er met
-- uitgaande berichten gebeurt en staat bewust op 'omleiden' tot de club
-- werkelijk van start gaat — er is geen aparte testomgeving.
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

-- ---------------------------------------------------------------------------
-- Taken
-- ---------------------------------------------------------------------------
-- Eén rij per uitvoering van een geplande taak. De supabase-ping hangt hiervan
-- af: mislukt hij twee keer na elkaar, dan moeten de beheerders bericht krijgen
-- vóór het project na een week gepauzeerd wordt.
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
