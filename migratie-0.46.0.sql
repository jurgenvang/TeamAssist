-- TeamAssist 0.46.0 — Mijn club (T7).
--
-- Eén keer uitvoeren in de D1-console, daarna schema-controle.sql: bovenaan
-- hoort 'ALLES OK' te staan. Geen heropbouw: één nieuwe tabel met een index,
-- aan bestaande tabellen verandert niets. Een tweede keer uitvoeren kan geen
-- kwaad (IF NOT EXISTS). Er hoeft niets ingevuld te worden: zonder rij geldt
-- de standaard (mijn ploegen tonen, niet op de hoogte houden).

CREATE TABLE IF NOT EXISTS mijnclub_ploegen (
  persoon_id   TEXT NOT NULL,
  team_guid    TEXT NOT NULL,
  tonen        INTEGER CHECK (tonen IN (0, 1)),
  op_de_hoogte INTEGER NOT NULL DEFAULT 0 CHECK (op_de_hoogte IN (0, 1)),
  gewijzigd    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (persoon_id, team_guid),
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

CREATE INDEX IF NOT EXISTS idx_mijnclub_op_de_hoogte ON mijnclub_ploegen (team_guid, op_de_hoogte);
