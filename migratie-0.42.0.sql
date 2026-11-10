-- TeamAssist 0.42.0 — tabbladen per stuk uitzetten (I1, fase 4e).
--
-- Eén keer uitvoeren in de D1-console, daarna schema-controle.sql: bovenaan
-- hoort 'ALLES OK' te staan. Geen heropbouw: één kolom erbij. Een tweede keer
-- uitvoeren faalt op de ALTER ('duplicate column name'): dan is het al
-- gebeurd. NULL betekent de standaard (Regio uit), dus er hoeft niets
-- ingevuld te worden.

ALTER TABLE personen ADD COLUMN verborgen_tabs TEXT;
