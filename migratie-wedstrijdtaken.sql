CREATE TABLE IF NOT EXISTS wedstrijdtaken (
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_wedstrijdtaken_uniek ON wedstrijdtaken (wedstrijd_id, taak);
CREATE INDEX IF NOT EXISTS idx_wedstrijdtaken_persoon ON wedstrijdtaken (persoon_id);
