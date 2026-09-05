CREATE TABLE IF NOT EXISTS berichten (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  persoon_id TEXT NOT NULL,
  kanaal     TEXT NOT NULL CHECK (kanaal IN ('mail', 'push')),
  onderwerp  TEXT NOT NULL,
  inhoud     TEXT,
  verzonden  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE INDEX IF NOT EXISTS idx_berichten_persoon ON berichten (persoon_id, verzonden);

INSERT OR IGNORE INTO instellingen (sleutel, waarde) VALUES ('mail_afzender', 'TeamAssist <noreply@teamassist.org>');
