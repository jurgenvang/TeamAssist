CREATE TABLE aanwezigheden_nieuw (
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

INSERT INTO aanwezigheden_nieuw
SELECT id, soort, activiteit_id, team_guid, seizoen, persoon_id, hoedanigheid,
       opgave_status, opgave_reden, opgave_toelichting, opgave_door, opgave_tijdstip,
       uitgesloten, uitgesloten_reden, uitgesloten_door, uitgesloten_tijdstip,
       vaststelling_status, vaststelling_door, vaststelling_tijdstip,
       aangemaakt
  FROM aanwezigheden;

DROP TABLE aanwezigheden;
ALTER TABLE aanwezigheden_nieuw RENAME TO aanwezigheden;

CREATE UNIQUE INDEX idx_aanwezigheden_uniek ON aanwezigheden (soort, activiteit_id, persoon_id);
CREATE INDEX idx_aanwezigheden_activiteit ON aanwezigheden (soort, activiteit_id);
CREATE INDEX idx_aanwezigheden_persoon ON aanwezigheden (persoon_id, seizoen);
