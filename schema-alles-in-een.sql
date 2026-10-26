-- TeamAssist — schema opnieuw opbouwen, in één keer uitvoerbaar.
--
-- Dit wist alle gegevens. Gebruik het bij een schemawijziging die niet met een
-- ALTER TABLE kan: een gewijzigde CHECK, een hernoemde tabel of een nieuwe
-- foreign key. Een gewone kolom erbij hoort met ALTER te gebeuren.
--
-- De volgorde van de DROP's is omgekeerd aan die van de foreign keys.

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
  -- Mijn voorkeuren (T6). Een voorkeur van de persoon zelf, geen instelling
  -- van de club — vandaar hier, niet in `instellingen`. 'systeem' volgt de
  -- OS-voorkeur van het toestel; enkel bij een expliciete keuze wijkt iemand
  -- daarvan af.
  donkere_modus      TEXT NOT NULL DEFAULT 'systeem'
                     CHECK (donkere_modus IN ('systeem', 'licht', 'donker')),
  -- Kanaal_voorkeur ligt hier al klaar sinds fase 5 werd uitgeklaard, ook al
  -- bestaat er nog geen push-kanaal: verwittigen.js gebruikt vandaag hoe dan
  -- ook enkel mail. Vroeg opslaan voorkomt een latere migratie enkel voor dit
  -- veld zodra push er wel is.
  kanaal_voorkeur    TEXT NOT NULL DEFAULT 'mail'
                     CHECK (kanaal_voorkeur IN ('mail', 'push', 'beide')),
  aangemaakt         TEXT NOT NULL DEFAULT (datetime('now')),
  gewijzigd          TEXT NOT NULL DEFAULT (datetime('now')),
  -- De persoonlijke agendalink (0.30.0, uit YOAssist): een lange, willekeurige
  -- sleutel in de URL zelf, want een agenda-app kan geen header meesturen.
  -- Bij de migratie overgenomen zoals hij was, zodat de agenda-abonnementen
  -- van de officials blijven werken. Uniek via een aparte index: een ALTER
  -- kan geen UNIQUE toevoegen.
  agenda_sleutel     TEXT,
  -- Krijgen de ouders de berichten van dit kind mee (0.32.0)? NULL: de
  -- standaard volgens de leeftijd (minderjarig aan, meerderjarig uit); 1/0:
  -- een gemaakte keuze. Een kind zonder e-mailadres krijgt ze altijd mee.
  -- Zie src/lib/namens.js.
  ouders_meelezen    INTEGER CHECK (ouders_meelezen IN (0, 1))
);

CREATE INDEX idx_personen_email ON personen (email);
CREATE INDEX idx_personen_relguid ON personen (rel_guid);
CREATE UNIQUE INDEX idx_personen_agenda ON personen (agenda_sleutel);

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
  -- Zorgt de club voor officials bij de thuiswedstrijden van deze ploeg?
  -- (0.30.0, de module Officials.) Bewust los van `gevolgd`: dat zegt of de
  -- club de ploeg in TeamAssist beheert (spelers, trainingen, aanwezigheden).
  -- Een ploeg kan officials krijgen zonder dat ze in TeamAssist beheerd
  -- wordt — zoals vandaag in YOAssist, waar dit `volgen` heette.
  officials      INTEGER NOT NULL DEFAULT 1 CHECK (officials IN (0, 1)),
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
--
-- Sinds 0.30.0 (I1, de module Officials) drie clubbrede rollen erbij:
--   YO      Youth Official: geeft beschikbaarheid op voor U10/U12
--   YOPLUS  YO+: ook vanaf U14, voor de wedstrijden die de club zelf invult
--   YOADM   beheert de officials — aanduiden, woensdagregel, Regio,
--           vergoedingen — zonder beheerder van de hele club te zijn
-- Een CHECK-wijziging, dus een heropbouw van de tabel (migratie-0.30.0.sql).
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

-- Een minderjarige die de berichten aan zijn ouders wil uitzetten, heeft de
-- toestemming van elke ouder nodig (0.32.0). Eén rij per ouder zolang de
-- vraag openstaat; is ze beslist (iedereen ja, of één nee), dan gaan de rijen
-- weg en staat de uitkomst in het logboek.
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
-- Berichten
-- ---------------------------------------------------------------------------
-- Wat een persoon zelf ontving — enkel bij succes. Een mislukte poging hoort
-- in het logboek, niet hier: deze tabel is de bron voor 'Mijn berichten', en
-- iemand daar iets tonen dat nooit aankwam zou verwarrend zijn.
--
-- Bewaard als samenvatting (onderwerp + inhoud), geen kopie of verwijzing
-- naar de wedstrijd/training zelf: die kan intussen verplaatst of gewijzigd
-- zijn, en dit bericht moet correct blijven staan voor wat er destijds echt
-- verstuurd is.
--
-- Sinds 0.28.0 (Mijn berichten, I1) drie kolommen erbij, alle drie met een
-- gewone ALTER toe te voegen:
--   soort      waar het over gaat ('wedstrijd', 'selectie', 'taak', 'nieuws');
--              bewust zonder CHECK — een nieuwe soort mag geen DROP vragen
--   kort       één regel voor de lijst; leeg = de eerste regel van inhoud
--   gelezen_op pas gezet bij het aantikken van één bericht, niet bij het
--              openen van de lijst: zo kan iemand eerst scannen zonder dat de
--              stipjes al verdwijnen (zoals in YOAssist)
-- `inhoud` blijft de volledige tekst zoals verstuurd; dat is wat 'lees meer'
-- toont.
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

-- ---------------------------------------------------------------------------
-- Pushabonnementen: de toestellen die meldingen krijgen (0.29.0, uit YOAssist)
-- ---------------------------------------------------------------------------
-- Eén rij per toestel (per browser), niet per persoon: iemand met een gsm en
-- een laptop heeft er twee. De browser levert endpoint, p256dh en auth bij het
-- inschrijven; zonder alle drie kan er niets versleuteld verstuurd worden.
--
-- laatst_ok en mislukt zeggen of het toestel nog werkt. Een abonnement dat de
-- pushdienst als verlopen meldt (404/410) wordt meteen gewist; een gewone
-- mislukking telt op, want die kan voorbijgaan.
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

-- ---------------------------------------------------------------------------
-- Mededelingen: belangrijk nieuws (0.28.0, uit YOAssist)
-- ---------------------------------------------------------------------------
-- Eén actieve tegelijk; een nieuwe zet de vorige op inactief. Ze staat als
-- banner bovenaan bij wie tot de doelgroep hoort, tot geldig_tot of tot hij
-- ze wegklikt. Wie een account heeft en tot de doelgroep hoort, krijgt ze ook
-- als bericht (mail, en in Mijn berichten) — dat staat dan in `berichten`,
-- en blijft daar ook nadat de banner verdwenen is.
--
-- De doelgroep wordt bij het plaatsen gekozen: iedereen, de begeleiding
-- (COORD, COACH, PLOEGV van een ploeg in het seizoen), of één ploeg (spelers,
-- hun ouders en de begeleiding). Een coach plaatst zelf geen mededeling;
-- enkel wie systeem.beheren heeft.
--
-- team_guid zonder foreign key naar teams: een reset van de ploegen mag een
-- mededeling niet laten mislukken of meenemen. gezet_door zonder foreign key
-- naar personen, om dezelfde reden als logboek.wie: een verantwoordingsspoor
-- blijft staan nadat iemand vertrokken is.
CREATE TABLE mededelingen (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tekst       TEXT NOT NULL,
  link        TEXT,
  link_tekst  TEXT,
  doelgroep   TEXT NOT NULL DEFAULT 'iedereen'
              CHECK (doelgroep IN ('iedereen', 'begeleiding', 'ploeg')),
  team_guid   TEXT,
  seizoen     TEXT,
  geldig_tot  TEXT NOT NULL,                     -- UTC, ISO 8601 met Z: vergelijkbaar als tekst
  gezet_door  TEXT NOT NULL,                     -- persoon_id
  gezet_op    TEXT NOT NULL DEFAULT (datetime('now')),
  actief      INTEGER NOT NULL DEFAULT 1 CHECK (actief IN (0, 1)),
  CHECK ((doelgroep = 'ploeg') = (team_guid IS NOT NULL AND seizoen IS NOT NULL))
);

-- Wie welke mededeling wegklikte. Per persoon: wegklikken is een persoonlijke
-- handeling, verlopen geldt voor iedereen.
CREATE TABLE mededeling_gezien (
  mededeling_id INTEGER NOT NULL,
  persoon_id    TEXT NOT NULL,
  weggeklikt_op TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (mededeling_id, persoon_id),
  FOREIGN KEY (mededeling_id) REFERENCES mededelingen (id) ON DELETE CASCADE,
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

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
  ('mail_afzender', 'TeamAssist <noreply@clubassist.org>'),
  ('clubnaam', 'AB InBev Leuven Bears'),
  ('club_guid', 'BVBL1125'),
  -- Laat een beheerder kiezen met welke rol hij wil werken, om te zien wat een
  -- coach of een ouder ziet. Staat uit, en hoort uit te staan zodra de club er
  -- echt mee werkt.
  ('testrol_toegelaten', '0'),
  -- Vensters waarin de bond de kalender toch herschikt (nieuw seizoen, tweede
  -- ronde). Een wijziging binnen zo'n venster wordt niet gemeld. Formaat:
  -- JSON-lijst van {van_dag, tot_dag} in 'mm-dd'.
  ('stille_periodes', '[{"van_dag":"06-01","tot_dag":"08-15"},{"van_dag":"12-28","tot_dag":"01-03"}]'),
  -- De module Officials (0.30.0, uit YOAssist). Wie de verzamelstaat van de
  -- vergoedingen krijgt (adressen, door komma's gescheiden; de penningmeester
  -- hoeft geen gebruiker te zijn), wat er met een eigen aanduiding gebeurt bij
  -- een forfait ('vrijgeven' of 'melden'), en of de externe API en de
  -- agendafeed volledige namen tonen of enkel initialen.
  ('facturatie_ontvangers', ''),
  ('forfait_aanduiding', 'vrijgeven'),
  ('extern_namen', 'initialen');

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
  -- Standaard uit: een feestdag sluit een training van deze zaal uit, tenzij
  -- de zaal zelf op feestdagen open is. Een keuze van de zaal, los van
  -- trainingsreeksen.vakantie_doorlopen — dat laatste is een keuze van het
  -- team voor een echte vakantieweek, dit is een fysieke beperking van de
  -- locatie zelf.
  open_op_feestdagen INTEGER NOT NULL DEFAULT 0 CHECK (open_op_feestdagen IN (0, 1)),
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
  soort     TEXT NOT NULL CHECK (soort IN ('vakantie', 'examens', 'feestdag')),
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
  -- Niet uniek op zich: een wedstrijd tussen twee eigen ploegen staat er
  -- twee keer, één rij per ploeg (0.30.1). Uniek is de combinatie, hieronder.
  wedstrijd_guid  TEXT NOT NULL,
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
  -- 'handmatig': een wedstrijd die een beheerder zelf invoerde (0.30.0, uit
  -- YOAssist). De synchronisatie laat ze met rust; anders zou ze elke nacht
  -- als verdwenen gemarkeerd worden, want de bond kent ze niet.
  bron            TEXT NOT NULL DEFAULT 'vbl' CHECK (bron IN ('vbl', 'handmatig')),
  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen),
  UNIQUE (wedstrijd_guid, team_guid)
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
  -- Nullable sinds T15 (opruiming): een persoon die 180 dagen inactief is,
  -- wordt definitief verwijderd — team_spelers/rollen/wedstrijdselecties gaan
  -- dan volledig mee weg, maar een aanwezigheidsrij blijft bestaan met enkel
  -- persoon_id (en de drie _door-kolommen hieronder) losgekoppeld. Nuttig voor
  -- clubstatistieken (aanwezigheidsgraad per team/seizoen) zonder de
  -- identiteit te bewaren. Kon niet met een gewone ALTER TABLE: SQLite laat
  -- een NOT NULL-beperking niet los zonder tabel-heropbouw.
  persoon_id          TEXT,
  hoedanigheid        TEXT NOT NULL CHECK (hoedanigheid IN ('SPELER', 'OUVO')),

  opgave_status       TEXT CHECK (opgave_status IN ('aanwezig', 'afwezig')),
  opgave_reden        TEXT CHECK (opgave_reden IN ('ziek', 'gekwetst', 'ander')),
  opgave_toelichting  TEXT,
  -- opgave_door, uitgesloten_door en vaststelling_door bevatten ook een
  -- persoon_id (de speler zelf, een ouder namens, of een beheerder) zonder
  -- eigen FK-afdwinging. Bij het verwijderen van een inactieve persoon worden
  -- ook deze drie losgekoppeld waar ze naar hem verwijzen — anders zou zijn
  -- identiteit hier alsnog blijven staan, ook op ándermans aanwezigheidsrij.
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
-- Wedstrijdtaken (T1)
-- ---------------------------------------------------------------------------
-- Tafeltaken bij een wedstrijd: klok, 24 seconden, tablet, ploegafgevaardigde.
-- Welke taken een wedstrijd nodig heeft, hangt af van categorie en thuis/uit
-- (zie src/lib/wedstrijdtaken.js) — de rijen ontstaan automatisch bij de
-- synchronisatie, als open slots (persoon_id NULL) die een beheerder vult.
-- Eerst de behoefte, dan de invulling, hetzelfde patroon als aanduidingen bij
-- YOAssist.
--
-- Kandidaten: om het even welk actief clublid, geen beperking tot ouders van
-- spelers in dat team (bevestigd bij het uitklaren van dit punt). Toewijzen
-- mag wie de selectie mag beheren (team.selectie.beheren) — geen apart recht.
--
-- Eerlijke verdeling/rotatie over het seizoen is bewust buiten scope: enkel
-- handmatige toewijzing, zoals bij YOAssist vóór de latere automatische
-- aanvulling er kwam.
CREATE TABLE wedstrijdtaken (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  wedstrijd_id         INTEGER NOT NULL,
  taak                 TEXT NOT NULL CHECK (taak IN ('klok', '24seconden', 'tablet', 'ploegafgevaardigde')),
  persoon_id           TEXT,
  toegewezen_door      TEXT,
  toegewezen_tijdstip  TEXT,
  -- Een toegewezen persoon kan zijn taak niet zelf wijzigen, wel een probleem
  -- melden — hetzelfde patroon als aanwezigheid uitsluiten/opgeven.
  probleem_gemeld      INTEGER NOT NULL DEFAULT 0 CHECK (probleem_gemeld IN (0, 1)),
  probleem_reden       TEXT,
  probleem_tijdstip    TEXT,
  aangemaakt           TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (wedstrijd_id) REFERENCES wedstrijden (id),
  FOREIGN KEY (persoon_id) REFERENCES personen (id),
  CHECK (probleem_gemeld = 0 OR probleem_reden IS NOT NULL)
);

-- Eén rij per taaksoort per wedstrijd — nooit twee keer 'klok' op dezelfde
-- wedstrijd.
CREATE UNIQUE INDEX idx_wedstrijdtaken_uniek ON wedstrijdtaken (wedstrijd_id, taak);
CREATE INDEX idx_wedstrijdtaken_persoon ON wedstrijdtaken (persoon_id);

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

-- ===========================================================================
-- De module Officials (0.30.0, I1 — het vroegere YOAssist)
-- ===========================================================================
-- Alles wat enkel de officials aanbelangt, in eigen tabellen met het
-- voorvoegsel `officials_`. Wat gedeeld is — personen, ploegen, wedstrijden,
-- berichten, logboek — staat hierboven. Zo raakt een wijziging aan de
-- aanwezigheden de woensdagregel niet, en omgekeerd.
--
-- Een persoon is hier altijd een `persoon_id`, nooit een e-mailadres zoals in
-- YOAssist: in TeamAssist kan iemand zonder e-mailadres bestaan (een kind dat
-- een ouder laat invullen), en een adres kan wijzigen.

-- Categorieën en tarieven. Enkel voor de officials: TeamAssist zelf leidt de
-- categorie af uit de ploeg-GUID en heeft geen tarieven nodig. auto_scope:
-- wedstrijden van deze categorie komen vanzelf in de aanduidingslijst (U10/U12,
-- waar de bond nooit scheidsrechters aanduidt).
CREATE TABLE officials_categorieen (
  code        TEXT PRIMARY KEY,                -- 'G12', 'J16', 'HSE'
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

-- Wat een wedstrijd voor de officials betekent: of ze in de aanduidingslijst
-- staat (scope) en waarom, hoeveel scheidsrechters de bond aanduidde, en een
-- forfait. Eén rij per thuiswedstrijd waarvoor de club officials regelt; de
-- wedstrijd zelf (datum, uur, zaal, tegenstander) staat in `wedstrijden`.
--
-- off_namen: de namen van de scheidsrechters volgens de bond (JSON), na de
-- wedstrijd gewist (off_gewist) — persoonsgegevens van mensen die geen lid
-- zijn. bond_officials: het aantal volgens de woensdaglijst, dat wint van de
-- API als het hoger is. scope_reden heeft een CHECK: een vierde reden vraagt
-- een heropbouw, maar enkel van deze tabel, niet van `wedstrijden`.
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
  refs_bevestigd_door TEXT,                    -- persoon_id, spoor zonder foreign key
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

-- Een vrijgave blijft als rij staan (status 'vrijgegeven'): de facturatie en
-- het logboek moeten kunnen zien dat iemand er stond.
CREATE TABLE officials_aanduidingen (
  wedstrijd_id    INTEGER NOT NULL,
  persoon_id      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'toegewezen' CHECK (status IN ('toegewezen', 'vrijgegeven')),
  toegewezen_door TEXT,                         -- persoon_id of 'systeem'; leeg na opruiming
  toegewezen_op   TEXT NOT NULL DEFAULT (datetime('now')),
  gewijzigd_op    TEXT,
  PRIMARY KEY (wedstrijd_id, persoon_id),
  FOREIGN KEY (wedstrijd_id) REFERENCES wedstrijden (id) ON DELETE CASCADE,
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE INDEX idx_officials_aanduidingen_persoon ON officials_aanduidingen (persoon_id, status);

-- Een aangeduide official kan zijn beschikbaarheid niet meer wijzigen, wel
-- een probleem melden.
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

-- Facturatie met momentopnames. Een afgesloten maand ligt vast; wat nadien
-- verandert, komt als correctieregel in de volgende maand.
--
-- In de twee vergoedingstabellen is persoon_id bewust geen foreign key: een
-- uitbetaald bedrag hoort te blijven staan, ook nadat iemand vertrokken is
-- en na 180 dagen inactiviteit uit `personen` verdwijnt. De naam staat daarom
-- in de regel zelf. vergoeding_verwerkt verwijst naar de wedstrijd via haar
-- GUID, niet via het id, om dezelfde reden.
CREATE TABLE officials_maanden (
  maand            TEXT PRIMARY KEY,           -- 'jjjj-mm'
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
  maand          TEXT NOT NULL,                -- de maand waarin het meetelde
  cat_code       TEXT NOT NULL,
  tarief_cent    INTEGER NOT NULL,
  aantal         INTEGER NOT NULL DEFAULT 1,   -- 1, of -1 na een correctie
  PRIMARY KEY (wedstrijd_guid, persoon_id, maand)
);

CREATE INDEX idx_officials_verwerkt_persoon ON officials_vergoeding_verwerkt (persoon_id);

-- Voorkeuren die enkel over de officials gaan. Wie geen rij heeft, krijgt de
-- standaard: herinneringen aan, gsm-nummer gedeeld met wie samen fluit.
CREATE TABLE officials_voorkeuren (
  persoon_id       TEXT PRIMARY KEY,
  herinner_avond   INTEGER NOT NULL DEFAULT 1 CHECK (herinner_avond IN (0, 1)),
  herinner_ochtend INTEGER NOT NULL DEFAULT 1 CHECK (herinner_ochtend IN (0, 1)),
  gsm_delen        INTEGER NOT NULL DEFAULT 1 CHECK (gsm_delen IN (0, 1)),
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

-- Regio: wedstrijden bij gevolgde, externe clubs met nul of één
-- scheidsrechter van de bond. Een eigen, lichte synchronisatie.
CREATE TABLE officials_volg_clubs (
  guid            TEXT PRIMARY KEY,
  naam            TEXT,
  toegevoegd_door TEXT NOT NULL,               -- persoon_id, spoor zonder foreign key
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

-- De woensdaglijst van de bond, zoals ontvangen per mail. Bewaard, ook als ze
-- niet te verwerken was: dan staat de reden in `fout`.
CREATE TABLE officials_vbl_lijsten (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ontvangen    TEXT NOT NULL DEFAULT (datetime('now')),
  onderwerp    TEXT,
  bestand      TEXT,
  weekend_van  TEXT,
  weekend_tot  TEXT,
  aantal_rijen INTEGER,
  eigen        TEXT,                           -- JSON: eigen thuiswedstrijden
  meldingen    TEXT,                           -- JSON: niet te koppelen rijen
  status       TEXT NOT NULL CHECK (status IN ('ontvangen', 'verwerkt', 'dubbel', 'fout')),
  fout         TEXT,
  verwerkt_op  TEXT,
  volg         TEXT                            -- JSON: Regio
);

CREATE INDEX idx_officials_vbl_lijsten_weekend ON officials_vbl_lijsten (weekend_van, status);
