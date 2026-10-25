-- TeamAssist 0.28.0 — Mijn berichten en belangrijk nieuws.
--
-- Een gewone ALTER volstaat, geen DROP: drie kolommen erbij in `berichten`,
-- twee nieuwe tabellen. Bestaande gegevens blijven staan.
--
-- Eén keer uitvoeren in de D1-console. Een tweede keer geeft een fout op de
-- ALTER's ('duplicate column name') — dat betekent dat ze er al staan.
-- Daarna schema-controle.sql: bovenaan hoort 'ALLES OK' te staan.

ALTER TABLE berichten ADD COLUMN soort TEXT;
ALTER TABLE berichten ADD COLUMN kort TEXT;
ALTER TABLE berichten ADD COLUMN gelezen_op TEXT;

CREATE TABLE IF NOT EXISTS mededelingen (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tekst       TEXT NOT NULL,
  link        TEXT,
  link_tekst  TEXT,
  doelgroep   TEXT NOT NULL DEFAULT 'iedereen'
              CHECK (doelgroep IN ('iedereen', 'begeleiding', 'ploeg')),
  team_guid   TEXT,
  seizoen     TEXT,
  geldig_tot  TEXT NOT NULL,
  gezet_door  TEXT NOT NULL,
  gezet_op    TEXT NOT NULL DEFAULT (datetime('now')),
  actief      INTEGER NOT NULL DEFAULT 1 CHECK (actief IN (0, 1)),
  CHECK ((doelgroep = 'ploeg') = (team_guid IS NOT NULL AND seizoen IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS mededeling_gezien (
  mededeling_id INTEGER NOT NULL,
  persoon_id    TEXT NOT NULL,
  weggeklikt_op TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (mededeling_id, persoon_id),
  FOREIGN KEY (mededeling_id) REFERENCES mededelingen (id) ON DELETE CASCADE,
  FOREIGN KEY (persoon_id) REFERENCES personen (id)
);

-- Het standaardafzenderadres wees naar teamassist.org, een domein dat de club
-- niet heeft. Enkel aangepast als het nog op die standaard stond; een zelf
-- ingesteld adres blijft. Werkt pas als clubassist.org bij Resend geverifieerd is.
UPDATE instellingen SET waarde = 'TeamAssist <noreply@clubassist.org>'
 WHERE sleutel = 'mail_afzender' AND waarde = 'TeamAssist <noreply@teamassist.org>';
