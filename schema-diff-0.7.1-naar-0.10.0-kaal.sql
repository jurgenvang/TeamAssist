CREATE TABLE IF NOT EXISTS zalen (
  id           TEXT PRIMARY KEY,
  naam         TEXT NOT NULL,
  adres        TEXT,
  vbl_acc_guid TEXT,
  actief       INTEGER NOT NULL DEFAULT 1 CHECK (actief IN (0, 1)),
  aangemaakt   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS zaal_blokken (
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

CREATE INDEX IF NOT EXISTS idx_zaal_blokken_zaal ON zaal_blokken (zaal_id, seizoen);

CREATE TABLE IF NOT EXISTS zaal_sluitingen (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  zaal_id TEXT NOT NULL,
  van     TEXT NOT NULL,
  tot     TEXT NOT NULL,
  reden   TEXT,
  FOREIGN KEY (zaal_id) REFERENCES zalen (id),
  CHECK (tot >= van)
);

CREATE INDEX IF NOT EXISTS idx_zaal_sluitingen_zaal ON zaal_sluitingen (zaal_id, van, tot);

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

CREATE INDEX IF NOT EXISTS idx_periodes_seizoen ON periodes (seizoen, van, tot);

CREATE TABLE IF NOT EXISTS trainingsreeksen (
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

CREATE INDEX IF NOT EXISTS idx_trainingsreeksen_team ON trainingsreeksen (team_guid, seizoen);

CREATE TABLE IF NOT EXISTS trainingen (
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

CREATE INDEX IF NOT EXISTS idx_trainingen_team ON trainingen (team_guid, seizoen, datum);
CREATE INDEX IF NOT EXISTS idx_trainingen_reeks ON trainingen (reeks_id);

CREATE TABLE IF NOT EXISTS wedstrijden (
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
  aangemaakt      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (team_guid, seizoen) REFERENCES teams (guid, seizoen)
);

CREATE INDEX IF NOT EXISTS idx_wedstrijden_team ON wedstrijden (team_guid, seizoen, datum);

INSERT INTO instellingen (sleutel, waarde)
SELECT 'stille_periodes', '[{"van_dag":"06-01","tot_dag":"08-15"},{"van_dag":"12-28","tot_dag":"01-03"}]'
 WHERE NOT EXISTS (SELECT 1 FROM instellingen WHERE sleutel = 'stille_periodes');
