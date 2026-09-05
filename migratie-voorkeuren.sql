ALTER TABLE personen ADD COLUMN donkere_modus TEXT NOT NULL DEFAULT 'systeem' CHECK (donkere_modus IN ('systeem', 'licht', 'donker'));
ALTER TABLE personen ADD COLUMN kanaal_voorkeur TEXT NOT NULL DEFAULT 'mail' CHECK (kanaal_voorkeur IN ('mail', 'push', 'beide'));
