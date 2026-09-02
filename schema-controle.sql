-- TeamAssist — controle op de databankstructuur (versie 0.7.0)
--
-- Plak dit in de D1-console na het uitvoeren van een schemawijziging. Het wijzigt
-- niets; het vergelijkt wat er staat met wat er hoort te staan.
--
-- Lees de bovenste regel: staat er ALLES OK, dan is de databank in orde. Staat er
-- een aantal, dan volgen daaronder de tabellen, indexen of kolommen die
-- ontbreken. Kolommen die er te veel zijn worden niet gemeld: die doen geen
-- kwaad en komen voor wanneer een oudere versie iets achterliet.
--
-- Dit bestand wordt gegenereerd uit schema.sql. Niet met de hand aanpassen —
-- draai 'node tools/genereer-controle.mjs' en er staat een test op.

WITH verwacht_object(soort, naam) AS (VALUES
  ('index', 'idx_logboek_tijdstip'),
  ('index', 'idx_ouder_kind_kind'),
  ('index', 'idx_personen_email'),
  ('index', 'idx_personen_relguid'),
  ('index', 'idx_rollen_persoon'),
  ('index', 'idx_rollen_uniek'),
  ('index', 'idx_taak_runs_taak'),
  ('index', 'idx_team_spelers_team'),
  ('table', 'aanmeldingen_wachtrij'),
  ('table', 'accounts'),
  ('table', 'instellingen'),
  ('table', 'logboek'),
  ('table', 'ouder_kind'),
  ('table', 'personen'),
  ('table', 'rollen'),
  ('table', 'seizoenen'),
  ('table', 'taak_runs'),
  ('table', 'team_spelers'),
  ('table', 'teams')
),
verwacht_kolom(tabel, kolom) AS (VALUES
  ('aanmeldingen_wachtrij', 'sub'),
  ('aanmeldingen_wachtrij', 'email'),
  ('aanmeldingen_wachtrij', 'eerste_poging'),
  ('aanmeldingen_wachtrij', 'laatste_poging'),
  ('aanmeldingen_wachtrij', 'pogingen'),
  ('accounts', 'sub'),
  ('accounts', 'persoon_id'),
  ('accounts', 'email'),
  ('accounts', 'eerste_aanmelding'),
  ('accounts', 'laatste_aanmelding'),
  ('instellingen', 'sleutel'),
  ('instellingen', 'waarde'),
  ('instellingen', 'gewijzigd'),
  ('logboek', 'id'),
  ('logboek', 'tijdstip'),
  ('logboek', 'soort'),
  ('logboek', 'wie'),
  ('logboek', 'wat'),
  ('logboek', 'details'),
  ('logboek', 'afgehandeld'),
  ('ouder_kind', 'ouder_id'),
  ('ouder_kind', 'kind_id'),
  ('ouder_kind', 'aangemaakt'),
  ('personen', 'id'),
  ('personen', 'voornaam'),
  ('personen', 'achternaam'),
  ('personen', 'naam_vbl'),
  ('personen', 'naam_bron'),
  ('personen', 'rel_guid'),
  ('personen', 'lid_nr'),
  ('personen', 'geboortedatum'),
  ('personen', 'geboortedatum_bron'),
  ('personen', 'email'),
  ('personen', 'tel_vast'),
  ('personen', 'tel_gsm'),
  ('personen', 'gsm_delen'),
  ('personen', 'straat'),
  ('personen', 'nummer'),
  ('personen', 'bus'),
  ('personen', 'postcode'),
  ('personen', 'gemeente'),
  ('personen', 'actief'),
  ('personen', 'inactief_sinds'),
  ('personen', 'laatste_aanmeldlink'),
  ('personen', 'aangemaakt'),
  ('personen', 'gewijzigd'),
  ('rollen', 'id'),
  ('rollen', 'persoon_id'),
  ('rollen', 'rol'),
  ('rollen', 'team_guid'),
  ('rollen', 'seizoen'),
  ('rollen', 'bron'),
  ('rollen', 'aangemaakt'),
  ('seizoenen', 'code'),
  ('seizoenen', 'naam'),
  ('seizoenen', 'actief'),
  ('seizoenen', 'aangemaakt'),
  ('taak_runs', 'id'),
  ('taak_runs', 'taak'),
  ('taak_runs', 'gestart'),
  ('taak_runs', 'geeindigd'),
  ('taak_runs', 'status'),
  ('taak_runs', 'melding'),
  ('team_spelers', 'persoon_id'),
  ('team_spelers', 'team_guid'),
  ('team_spelers', 'seizoen'),
  ('team_spelers', 'bron'),
  ('team_spelers', 'bij_bond'),
  ('team_spelers', 'aangemaakt'),
  ('teams', 'guid'),
  ('teams', 'seizoen'),
  ('teams', 'naam'),
  ('teams', 'categorie'),
  ('teams', 'onderwijsgroep'),
  ('teams', 'gevolgd'),
  ('teams', 'selectie_aan'),
  ('teams', 'bij_bond'),
  ('teams', 'laatst_gezien'),
  ('teams', 'aangemaakt')
),
ontbrekend_object AS (
  SELECT v.soort AS soort, v.naam AS naam
    FROM verwacht_object v
    LEFT JOIN sqlite_master m ON m.name = v.naam AND m.type = v.soort
   WHERE m.name IS NULL
),
ontbrekende_kolom AS (
  SELECT 'kolom' AS soort, v.tabel || '.' || v.kolom AS naam
    FROM verwacht_kolom v
    LEFT JOIN pragma_table_info(v.tabel) p ON p.name = v.kolom
   WHERE p.name IS NULL
),
problemen AS (
  SELECT * FROM ontbrekend_object
  UNION ALL
  SELECT * FROM ontbrekende_kolom
)
SELECT 0 AS volgorde,
       CASE WHEN (SELECT count(*) FROM problemen) = 0
            THEN 'ALLES OK'
            ELSE (SELECT count(*) FROM problemen) || ' PROBLEEM/PROBLEMEN'
       END AS soort,
       'structuur versie 0.7.0' AS naam
UNION ALL
SELECT 1, soort, naam FROM problemen
ORDER BY volgorde, soort, naam;
