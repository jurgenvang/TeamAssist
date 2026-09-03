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
  -- De interne, verkorte naam ('U12 A'), afgeleid uit naam + categorie + de
  -- clubnaam-instelling (src/lib/categorie.js, verkorteTeamnaam). Bewaard in
  -- plaats van telkens herberekend, zodat een matching (bijvoorbeeld het
  -- trainingsuren-sjabloon) er rechtstreeks op kan filteren. Kan null zijn
  -- als de afleiding niet lukte — dan geldt enkel de volledige naam.
  naam_kort      TEXT,
  categorie      TEXT,                              -- 'J16', 'G12', 'HSE'
  -- Bepaalt welke examenperiodes op deze ploeg slaan. Afgeleid uit de
  -- categorie, maar te overschrijven: in een U19 zitten vaak al studenten.
  onderwijsgroep TEXT NOT NULL DEFAULT 'geen'
                 CHECK (onderwijsgroep IN ('geen', 'secundair', 'hoger')),
  gevolgd        INTEGER NOT NULL DEFAULT 0 CHECK (gevolgd IN (0, 1)),
  selectie_aan   INTEGER NOT NULL DEFAULT 0 CHECK (selectie_aan IN (0, 1)),
  -- Of vooraf opgeven toegelaten is, en hoeveel uur op voorhand het sluit —
  -- apart voor trainingen en wedstrijden, want een ploeg met selectie heeft
  -- voor wedstrijden een langere termijn nodig (de coach moet zijn lijst
  -- kunnen maken vóór de dag zelf; 48 uur is de aanbevolen waarde in het
  -- scherm zodra selectie_aan staat, maar wordt hier niet afgedwongen).
  opgave_toegelaten_training  INTEGER NOT NULL DEFAULT 1 CHECK (opgave_toegelaten_training IN (0, 1)),
  opgave_toegelaten_wedstrijd INTEGER NOT NULL DEFAULT 1 CHECK (opgave_toegelaten_wedstrijd IN (0, 1)),
  opgave_termijn_training_uren  INTEGER NOT NULL DEFAULT 1,
  opgave_termijn_wedstrijd_uren INTEGER NOT NULL DEFAULT 1,
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
  ('club_guid', 'BVBL1125'),
  -- Laat een beheerder kiezen met welke rol hij wil werken, om te zien wat een
  -- coach of een ouder ziet. Staat uit, en hoort uit te staan zodra de club er
  -- echt mee werkt.
  ('testrol_toegelaten', '0'),
  -- Vensters waarin de bond de kalender toch herschikt (nieuw seizoen, tweede
  -- ronde). Een wijziging binnen zo'n venster wordt niet gemeld. Formaat:
  -- JSON-lijst van {van_dag, tot_dag} in 'mm-dd'.
  ('stille_periodes', '[{"van_dag":"06-01","tot_dag":"08-15"},{"van_dag":"12-28","tot_dag":"01-03"}]');

-- ---------------------------------------------------------------------------
-- Zalen
-- ---------------------------------------------------------------------------
-- Een zaal is niet altijd beschikbaar. Ze heeft blokken (maandag 18-20u in
-- zaal A) die de club over haar ploegen verdeelt. Door die blokken apart te
-- bewaren, weet de app welke blokken nog vrij zijn — nuttig zodra een zaal
-- wegvalt en er een alternatief gezocht moet worden.
CREATE TABLE zalen (
  id           TEXT PRIMARY KEY,
  naam         TEXT NOT NULL,
  adres        TEXT,
  vbl_acc_guid TEXT,                              -- koppeling met accGUID bij VBL
  actief       INTEGER NOT NULL DEFAULT 1 CHECK (actief IN (0, 1)),
  aangemaakt   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- weekdag: 1 = maandag ... 7 = zondag, dezelfde telling als de rest van de app.
CREATE TABLE zaal_blokken (
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

CREATE INDEX idx_zaal_blokken_zaal ON zaal_blokken (zaal_id, seizoen);

-- Een dag of een periode dat een zaal niet bruikbaar is. Raakt elke training
-- die in dat venster op die zaal gepland staat.
CREATE TABLE zaal_sluitingen (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  zaal_id TEXT NOT NULL,
  van     TEXT NOT NULL,                          -- 'jjjj-mm-dd'
  tot     TEXT NOT NULL,
  reden   TEXT,
  FOREIGN KEY (zaal_id) REFERENCES zalen (id),
  CHECK (tot >= van)
);

CREATE INDEX idx_zaal_sluitingen_zaal ON zaal_sluitingen (zaal_id, van, tot);

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
CREATE TABLE periodes (
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

CREATE INDEX idx_periodes_seizoen ON periodes (seizoen, van, tot);

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
CREATE TABLE trainingsreeksen (
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

CREATE INDEX idx_trainingsreeksen_team ON trainingsreeksen (team_guid, seizoen);

-- ---------------------------------------------------------------------------
-- Trainingen
-- ---------------------------------------------------------------------------
-- Losse rijen, uitgeschreven uit een reeks of handmatig toegevoegd. Apart van
-- wedstrijden gehouden: andere bron (de club versus de bond), andere
-- synchronisatie, en een training die per ongeluk als wedstrijd behandeld
-- wordt is een fout die niemand wil debuggen.
CREATE TABLE trainingen (
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

CREATE INDEX idx_trainingen_team ON trainingen (team_guid, seizoen, datum);
CREATE INDEX idx_trainingen_reeks ON trainingen (reeks_id);

-- ---------------------------------------------------------------------------
-- Wedstrijden
-- ---------------------------------------------------------------------------
-- Komt van Basketbal Vlaanderen. wijzigingshash dekt datum, uur, locatie en
-- tegenstander; wijzigt die hash buiten de stille periodes (1/6-15/8 en
-- 28/12-3/1), dan krijgen COORD, COACH en PLOEGV bericht. De uitslag zit
-- bewust niet in de hash: die komt vanzelf binnen en is geen wijziging.
CREATE TABLE wedstrijden (
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
  -- Een selectie is een klad tot ze gepubliceerd wordt. Zolang deze vlag op 0
  -- staat, ziet enkel de begeleiding wie erop staat in wedstrijdselecties.
  selectie_gepubliceerd INTEGER NOT NULL DEFAULT 0 CHECK (selectie_gepubliceerd IN (0, 1)),
  aangemaakt      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen)
);

CREATE INDEX idx_wedstrijden_team ON wedstrijden (team_guid, seizoen, datum);

-- ---------------------------------------------------------------------------
-- Aanwezigheden
-- ---------------------------------------------------------------------------
-- Drie velden, geen twee: de opgave (wat de speler of ouder vooraf invulde),
-- de selectie (enkel bij wedstrijden, in een eigen tabel hieronder — wie de
-- coach meeneemt is geen aanwezigheid), en de vaststelling (wat de coach
-- achteraf noteerde). De coach overschrijft de opgave nooit: wie zich afmeldde
-- en toch kwam, blijft zichtbaar als precies dat.
--
-- soort + activiteit_id verwijst naar trainingen.id of wedstrijden.id,
-- afhankelijk van soort. Geen foreign key over twee tabellen — SQLite kan dat
-- niet — vandaar de test die controleert dat elke rij bij een bestaande
-- training of wedstrijd hoort.
--
-- persoon_id met hoedanigheid, niet team_spelers.id: bij een wedstrijd moet
-- ook een ouder kunnen opgeven of hij aanwezig is, voor de tafeltaken die
-- later komen (klok, 24 seconden, tablet, ploegafgevaardigde — backlog T1).
--
-- Uitsluiting is een eigen soort afwezigheid, los van opgave en vaststelling:
-- een coach kan een speler vooraf op afwezig zetten (disciplinair, of een
-- blessure die de coach kent), waarna de speler zichzelf niet meer op
-- aanwezig kan zetten. De reden is verplicht — een maatregel zonder motief is
-- door niemand anders te beoordelen.
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
  opgave_door         TEXT,                          -- persoon_id: de speler zelf, of een ouder namens
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

-- Eén rij per persoon per activiteit: de opgave en de vaststelling van
-- dezelfde speler op dezelfde training horen samen te vallen, niet in twee
-- rijen te kunnen staan.
CREATE UNIQUE INDEX idx_aanwezigheden_uniek ON aanwezigheden (soort, activiteit_id, persoon_id);
CREATE INDEX idx_aanwezigheden_activiteit ON aanwezigheden (soort, activiteit_id);
CREATE INDEX idx_aanwezigheden_persoon ON aanwezigheden (persoon_id, seizoen);

-- ---------------------------------------------------------------------------
-- Wedstrijdselecties
-- ---------------------------------------------------------------------------
-- Wie de coach meeneemt. Een aparte tabel, geen kolom op aanwezigheden: een
-- selectie is een klad tot ze gepubliceerd wordt (wedstrijden.selectie_gepubliceerd),
-- en 'niet geselecteerd' is geen afwezigheid — dat zou een speler bestraffen
-- voor een beslissing van zijn coach.
CREATE TABLE wedstrijdselecties (
  wedstrijd_id INTEGER NOT NULL,
  persoon_id   TEXT NOT NULL,
  aangemaakt   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (wedstrijd_id, persoon_id),
  FOREIGN KEY (wedstrijd_id) REFERENCES wedstrijden (id),
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

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
