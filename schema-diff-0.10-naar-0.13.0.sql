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

ALTER TABLE teams ADD COLUMN opgave_toegelaten_training INTEGER NOT NULL DEFAULT 1 CHECK (opgave_toegelaten_training IN (0, 1));
ALTER TABLE teams ADD COLUMN opgave_toegelaten_wedstrijd INTEGER NOT NULL DEFAULT 1 CHECK (opgave_toegelaten_wedstrijd IN (0, 1));
ALTER TABLE teams ADD COLUMN opgave_termijn_training_uren INTEGER NOT NULL DEFAULT 1;
ALTER TABLE teams ADD COLUMN opgave_termijn_wedstrijd_uren INTEGER NOT NULL DEFAULT 1;
ALTER TABLE wedstrijden ADD COLUMN selectie_gepubliceerd INTEGER NOT NULL DEFAULT 0 CHECK (selectie_gepubliceerd IN (0, 1));
