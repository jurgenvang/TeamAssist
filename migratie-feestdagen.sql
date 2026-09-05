ALTER TABLE zalen ADD COLUMN open_op_feestdagen INTEGER NOT NULL DEFAULT 0 CHECK (open_op_feestdagen IN (0, 1));

CREATE TABLE periodes_nieuw (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  seizoen   TEXT NOT NULL,
  naam      TEXT NOT NULL,
  van       TEXT NOT NULL,
  tot       TEXT NOT NULL,
  soort     TEXT NOT NULL CHECK (soort IN ('vakantie', 'examens', 'feestdag')),
  doelgroep TEXT NOT NULL DEFAULT 'iedereen'
            CHECK (doelgroep IN ('iedereen', 'secundair', 'hoger')),
  bron      TEXT NOT NULL DEFAULT 'club' CHECK (bron IN ('openholidays', 'club')),
  FOREIGN KEY (seizoen) REFERENCES seizoenen (code),
  CHECK (tot >= van)
);

INSERT INTO periodes_nieuw (id, seizoen, naam, van, tot, soort, doelgroep, bron)
SELECT id, seizoen, naam, van, tot, soort, doelgroep, bron FROM periodes;

DROP TABLE periodes;
ALTER TABLE periodes_nieuw RENAME TO periodes;

CREATE INDEX idx_periodes_seizoen ON periodes (seizoen, van, tot);
