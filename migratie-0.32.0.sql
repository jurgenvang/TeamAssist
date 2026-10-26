-- TeamAssist 0.32.0 — ouder en kind (I1, fase 3a).
--
-- Eén keer uitvoeren in de D1-console, daarna schema-controle.sql: bovenaan
-- hoort 'ALLES OK' te staan. Geen heropbouw: een kolom erbij en een nieuwe
-- tabel. Een tweede keer uitvoeren faalt op de ALTER ('duplicate column
-- name'): dan is het al gebeurd.

ALTER TABLE personen ADD COLUMN ouders_meelezen INTEGER CHECK (ouders_meelezen IN (0, 1));

CREATE TABLE IF NOT EXISTS ouder_toestemming (
  kind_id       TEXT NOT NULL,
  ouder_id      TEXT NOT NULL,
  gevraagd_op   TEXT NOT NULL DEFAULT (datetime('now')),
  antwoord      TEXT CHECK (antwoord IN ('ja', 'nee')),
  beantwoord_op TEXT,
  PRIMARY KEY (kind_id, ouder_id),
  FOREIGN KEY (kind_id) REFERENCES personen (id),
  FOREIGN KEY (ouder_id) REFERENCES personen (id)
);
