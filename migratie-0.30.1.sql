-- TeamAssist 0.30.1 — een wedstrijd tussen twee eigen ploegen.
--
-- Eén keer uitvoeren in de D1-console, in één keer. Daarna schema-controle.sql:
-- bovenaan hoort 'ALLES OK' te staan.
--
-- Waarom een heropbouw en geen ALTER: `wedstrijden.wedstrijd_guid` was UNIQUE
-- op zich. Een wedstrijd tussen twee eigen ploegen (ROL 1 tegen ROL 2) heeft
-- één rij per ploeg nodig, dus wordt de combinatie (wedstrijd_guid,
-- team_guid) uniek. Een UNIQUE in een kolomdefinitie kan SQLite niet
-- weghalen; de tabel moet opnieuw opgebouwd worden.
--
-- Waarom zo omslachtig: zes tabellen verwijzen naar wedstrijden(id), en D1
-- laat de foreign keys niet uitzetten. Een DROP TABLE van wedstrijden faalt
-- zolang er rijen naar verwijzen, ook met defer_foreign_keys. Dus: de rijen
-- van die zes tabellen even apart zetten, wedstrijden heropbouwen met
-- dezelfde id's, en de rijen terugzetten. Er gaat niets verloren.
--
-- Een tweede keer uitvoeren kan geen kwaad: het doet dan hetzelfde nog eens.
--
-- Stopt het halverwege met een fout, voer het dan NIET opnieuw uit: de rijen
-- staan dan in de tabellen _bewaar_*. Zet ze terug met stap 3 hieronder
-- (vanaf de eerste INSERT), of vraag het na.

-- 1. de verwijzende rijen apart zetten
CREATE TABLE _bewaar_wedstrijdselecties AS SELECT * FROM wedstrijdselecties;
CREATE TABLE _bewaar_wedstrijdtaken AS SELECT * FROM wedstrijdtaken;
CREATE TABLE _bewaar_officials_wedstrijd AS SELECT * FROM officials_wedstrijd;
CREATE TABLE _bewaar_officials_beschikbaarheid AS SELECT * FROM officials_beschikbaarheid;
CREATE TABLE _bewaar_officials_aanduidingen AS SELECT * FROM officials_aanduidingen;
CREATE TABLE _bewaar_officials_problemen AS SELECT * FROM officials_problemen;

DELETE FROM wedstrijdselecties;
DELETE FROM wedstrijdtaken;
DELETE FROM officials_wedstrijd;
DELETE FROM officials_beschikbaarheid;
DELETE FROM officials_aanduidingen;
DELETE FROM officials_problemen;

-- 2. wedstrijden heropbouwen, met dezelfde id's
CREATE TABLE wedstrijden_nieuw (
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

INSERT INTO wedstrijden_nieuw
       (id, wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander,
        locatie_tekst, vbl_acc_guid, uitslag, status, wijzigingshash, bij_bond,
        laatst_gezien, selectie_gepubliceerd, aangemaakt, bron)
SELECT id, wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander,
       locatie_tekst, vbl_acc_guid, uitslag, status, wijzigingshash, bij_bond,
       laatst_gezien, selectie_gepubliceerd, aangemaakt, bron
  FROM wedstrijden;

DROP TABLE wedstrijden;
ALTER TABLE wedstrijden_nieuw RENAME TO wedstrijden;
CREATE INDEX idx_wedstrijden_team ON wedstrijden (team_guid, seizoen, datum);

-- 3. de verwijzende rijen terugzetten
INSERT INTO wedstrijdselecties SELECT * FROM _bewaar_wedstrijdselecties;
INSERT INTO wedstrijdtaken SELECT * FROM _bewaar_wedstrijdtaken;
INSERT INTO officials_wedstrijd SELECT * FROM _bewaar_officials_wedstrijd;
INSERT INTO officials_beschikbaarheid SELECT * FROM _bewaar_officials_beschikbaarheid;
INSERT INTO officials_aanduidingen SELECT * FROM _bewaar_officials_aanduidingen;
INSERT INTO officials_problemen SELECT * FROM _bewaar_officials_problemen;

DROP TABLE _bewaar_wedstrijdselecties;
DROP TABLE _bewaar_wedstrijdtaken;
DROP TABLE _bewaar_officials_wedstrijd;
DROP TABLE _bewaar_officials_beschikbaarheid;
DROP TABLE _bewaar_officials_aanduidingen;
DROP TABLE _bewaar_officials_problemen;
