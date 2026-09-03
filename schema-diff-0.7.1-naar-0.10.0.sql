-- TeamAssist — schemadiff van v0.7.1 naar v0.10.0
--
-- Wat dit is: het volledige verschil in databankstructuur tussen die twee
-- versies. Er zijn tussen 0.7.1 en 0.10.0 geen ALTER's op bestaande tabellen
-- geweest — alles wat wijzigde, kwam erbij als nieuwe tabel of als een
-- optionele instellingsrij.
--
--   0.8.0  zes nieuwe tabellen: zalen, zaal_blokken, zaal_sluitingen,
--          periodes, trainingsreeksen, trainingen, wedstrijden
--   0.9.0  één instellingsrij (stille_periodes) — optioneel, de code valt
--          terug op dezelfde waarden als de rij ontbreekt
--   0.10.0 geen schemawijziging; de nieuwe instellingen (clubkleur_accent,
--          clublogo_url, clublogo_bron) gebruiken de bestaande tabel
--          instellingen zonder standaardrij
--
-- Veilig op een bestaande 0.7.1-installatie: enkel CREATE TABLE / CREATE
-- INDEX (niets bestaands wordt aangeraakt) en één INSERT die niets overschrijft
-- als de rij er al staat. Ook veilig om per ongeluk twee keer te draaien —
-- IF NOT EXISTS overal, en de INSERT test zelf of de rij al bestaat.

-- ---------------------------------------------------------------------------
-- Zalen
-- ---------------------------------------------------------------------------
-- Een zaal is niet altijd beschikbaar. Ze heeft blokken (maandag 18-20u in
-- zaal A) die de club over haar ploegen verdeelt. Door die blokken apart te
-- bewaren, weet de app welke blokken nog vrij zijn — nuttig zodra een zaal
-- wegvalt en er een alternatief gezocht moet worden.
CREATE TABLE IF NOT EXISTS zalen (
  id           TEXT PRIMARY KEY,
  naam         TEXT NOT NULL,
  adres        TEXT,
  vbl_acc_guid TEXT,                              -- koppeling met accGUID bij VBL
  actief       INTEGER NOT NULL DEFAULT 1 CHECK (actief IN (0, 1)),
  aangemaakt   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- weekdag: 1 = maandag ... 7 = zondag, dezelfde telling als de rest van de app.
CREATE TABLE IF NOT EXISTS zaal_blokken (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  zaal_id  TEXT NOT NULL,
  seizoen  TEXT NOT NULL,
  weekdag  INTEGER NOT NULL CHECK (weekdag BETWEEN 1 AND 7),
  begin    TEXT NOT NULL,                         -- 'uu:mm'
  einde    TEXT NOT NULL,
  FOREIGN KEY (zaal_id) REFERENCES zalen (id),
  FOREIGN KEY (seizoen) REFERENCES seizoenen (code),
  CHECK (einde > begin)
);

CREATE INDEX IF NOT EXISTS idx_zaal_blokken_zaal ON zaal_blokken (zaal_id, seizoen);

-- Een dag of een periode dat een zaal niet bruikbaar is. Raakt elke training
-- die in dat venster op die zaal gepland staat.
CREATE TABLE IF NOT EXISTS zaal_sluitingen (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  zaal_id TEXT NOT NULL,
  van     TEXT NOT NULL,                          -- 'jjjj-mm-dd'
  tot     TEXT NOT NULL,
  reden   TEXT,
  FOREIGN KEY (zaal_id) REFERENCES zalen (id),
  CHECK (tot >= van)
);

CREATE INDEX IF NOT EXISTS idx_zaal_sluitingen_zaal ON zaal_sluitingen (zaal_id, van, tot);

-- ---------------------------------------------------------------------------
-- Periodes: vakanties en examens
-- ---------------------------------------------------------------------------
-- Vakanties en examens zijn hetzelfde soort ding: een periode waarin een ploeg
-- mogelijk niet traint. Ze in twee tabellen zetten zou de regels errond
-- verdubbelen. Het onderscheid zit in doelgroep: examens van het secundair
-- raken andere ploegen dan die van het hoger onderwijs, en vallen op andere
-- data.
--
-- bron 'openholidays' komt van de automatische ophaling en wordt bij de
-- volgende ophaling overschreven; 'club' is door een beheerder gezet of
-- gecorrigeerd en blijft dan staan.
CREATE TABLE IF NOT EXISTS periodes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  seizoen   TEXT NOT NULL,
  naam      TEXT NOT NULL,
  van       TEXT NOT NULL,                        -- 'jjjj-mm-dd'
  tot       TEXT NOT NULL,
  soort     TEXT NOT NULL CHECK (soort IN ('vakantie', 'examens')),
  doelgroep TEXT NOT NULL DEFAULT 'iedereen'
            CHECK (doelgroep IN ('iedereen', 'secundair', 'hoger')),
  bron      TEXT NOT NULL DEFAULT 'club' CHECK (bron IN ('openholidays', 'club')),
  FOREIGN KEY (seizoen) REFERENCES seizoenen (code),
  CHECK (tot >= van)
);

CREATE INDEX IF NOT EXISTS idx_periodes_seizoen ON periodes (seizoen, van, tot);

-- ---------------------------------------------------------------------------
-- Trainingsreeksen
-- ---------------------------------------------------------------------------
-- Eén reeks per vast trainingsmoment van een ploeg (een ploeg met twee vaste
-- momenten per week heeft dus twee reeksen). Ze genereert concrete trainingen;
-- ze vervangt ze niet, zodat één training verplaatst of afgelast kan worden
-- zonder de reeks te breken.
--
-- van/tot: de eigen trainingsperiode van de ploeg, binnen de grenzen van het
-- seizoen (ten vroegste 1 augustus, ten laatste 30 juni). Een U8 begint vaak
-- later dan de senioren.
--
-- zaal_id is optioneel: een ploeg die in een schoolzaal traint waar de club
-- geen blokken van beheert, gebruikt locatie_tekst in de plaats.
CREATE TABLE IF NOT EXISTS trainingsreeksen (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_guid     TEXT NOT NULL,
  seizoen       TEXT NOT NULL,
  weekdag       INTEGER NOT NULL CHECK (weekdag BETWEEN 1 AND 7),
  begin         TEXT NOT NULL,                    -- 'uu:mm'
  einde         TEXT NOT NULL,
  zaal_id       TEXT,
  locatie_tekst TEXT,
  van           TEXT NOT NULL,                    -- 'jjjj-mm-dd', binnen het seizoen
  tot           TEXT NOT NULL,
  -- Loopt de reeks door tijdens een vakantieperiode die op de ploeg van
  -- toepassing is? Standaard niet: een training die niet doorgaat maar wel in
  -- de agenda staat, kost iemand een verplaatsing.
  vakantie_doorlopen INTEGER NOT NULL DEFAULT 0 CHECK (vakantie_doorlopen IN (0, 1)),
  actief        INTEGER NOT NULL DEFAULT 1 CHECK (actief IN (0, 1)),
  aangemaakt    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen),
  FOREIGN KEY (zaal_id) REFERENCES zalen (id),
  CHECK (einde > begin),
  CHECK (tot >= van),
  CHECK (zaal_id IS NOT NULL OR locatie_tekst IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_trainingsreeksen_team ON trainingsreeksen (team_guid, seizoen);

-- ---------------------------------------------------------------------------
-- Trainingen
-- ---------------------------------------------------------------------------
-- Losse rijen, uitgeschreven uit een reeks of handmatig toegevoegd. Apart van
-- wedstrijden gehouden: andere bron (de club versus de bond), andere
-- synchronisatie, en een training die per ongeluk als wedstrijd behandeld
-- wordt is een fout die niemand wil debuggen.
CREATE TABLE IF NOT EXISTS trainingen (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_guid     TEXT NOT NULL,
  seizoen       TEXT NOT NULL,
  reeks_id      INTEGER,                          -- NULL bij een losse training
  datum         TEXT NOT NULL,                    -- 'jjjj-mm-dd'
  begin         TEXT NOT NULL,
  einde         TEXT NOT NULL,
  zaal_id       TEXT,
  locatie_tekst TEXT,
  status        TEXT NOT NULL DEFAULT 'gepland'
                CHECK (status IN ('gepland', 'afgelast', 'verplaatst', 'zaal_niet_beschikbaar')),
  bron          TEXT NOT NULL DEFAULT 'reeks' CHECK (bron IN ('reeks', 'handmatig')),
  -- Een handmatige aanpassing (uur, zaal) op een rij die uit een reeks komt,
  -- overleeft het herschrijven van die reeks. Zonder deze vlag zou het
  -- verplaatsen van één training verdwijnen zodra de reeks wijzigt.
  handmatig_gewijzigd INTEGER NOT NULL DEFAULT 0 CHECK (handmatig_gewijzigd IN (0, 1)),
  opmerking     TEXT,
  aangemaakt    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen),
  FOREIGN KEY (reeks_id) REFERENCES trainingsreeksen (id),
  FOREIGN KEY (zaal_id) REFERENCES zalen (id),
  CHECK (einde > begin)
);

CREATE INDEX IF NOT EXISTS idx_trainingen_team ON trainingen (team_guid, seizoen, datum);
CREATE INDEX IF NOT EXISTS idx_trainingen_reeks ON trainingen (reeks_id);

-- ---------------------------------------------------------------------------
-- Wedstrijden
-- ---------------------------------------------------------------------------
-- Komt van Basketbal Vlaanderen. wijzigingshash dekt datum, uur, locatie en
-- tegenstander; wijzigt die hash buiten de stille periodes (1/6-15/8 en
-- 28/12-3/1), dan krijgen COORD, COACH en PLOEGV bericht. De uitslag zit
-- bewust niet in de hash: die komt vanzelf binnen en is geen wijziging.
CREATE TABLE IF NOT EXISTS wedstrijden (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  wedstrijd_guid  TEXT NOT NULL UNIQUE,
  team_guid       TEXT NOT NULL,
  seizoen         TEXT NOT NULL,
  datum           TEXT NOT NULL,                  -- 'jjjj-mm-dd'
  begin           TEXT NOT NULL,
  thuis           INTEGER NOT NULL CHECK (thuis IN (0, 1)),
  tegenstander    TEXT,
  locatie_tekst   TEXT,                           -- accNaam bij VBL
  vbl_acc_guid    TEXT,                            -- accGUID bij VBL
  uitslag         TEXT,
  status          TEXT NOT NULL DEFAULT 'gepland'
                  CHECK (status IN ('gepland', 'afgelast', 'verplaatst')),
  wijzigingshash  TEXT,
  bij_bond        INTEGER NOT NULL DEFAULT 1 CHECK (bij_bond IN (0, 1)),
  laatst_gezien   TEXT,
  aangemaakt      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen)
);

CREATE INDEX IF NOT EXISTS idx_wedstrijden_team ON wedstrijden (team_guid, seizoen, datum);

-- Optioneel: de stille periodes waarin een wijziging bij een wedstrijd niet
-- gemeld wordt (0.9.0). Ontbreekt deze rij, dan gebruikt de code dezelfde
-- waarden als standaard — dit is dus geen harde vereiste.
INSERT INTO instellingen (sleutel, waarde)
SELECT 'stille_periodes', '[{"van_dag":"06-01","tot_dag":"08-15"},{"van_dag":"12-28","tot_dag":"01-03"}]'
 WHERE NOT EXISTS (SELECT 1 FROM instellingen WHERE sleutel = 'stille_periodes');
