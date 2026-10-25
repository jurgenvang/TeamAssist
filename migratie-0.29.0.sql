-- TeamAssist 0.29.0 — push.
--
-- Geen ALTER en geen DROP: enkel een nieuwe tabel en haar index. Bestaande
-- gegevens blijven staan. Veilig herhaalbaar (IF NOT EXISTS).
-- Daarna schema-controle.sql: bovenaan hoort 'ALLES OK' te staan.

CREATE TABLE IF NOT EXISTS push_abonnementen (
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

CREATE INDEX IF NOT EXISTS idx_push_persoon ON push_abonnementen (persoon_id);
