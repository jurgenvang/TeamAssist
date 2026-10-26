# TeamAssist — lessen en valkuilen

Wat al eens misliep, en hoe het nu zit. Aanvullen bij elke release waarin
iets nieuws boven kwam; nooit inkorten zonder reden.

## Databank (D1)

- **`CREATE TABLE IF NOT EXISTS` voegt geen kolommen toe** en meldt niets.
- **Een gewijzigde CHECK, een UNIQUE in een kolomdefinitie of NOT NULL weg is
  een heropbouw**, geen ALTER.
- **D1 laat de foreign keys niet uitzetten**, en `defer_foreign_keys` helpt
  niet bij een `DROP TABLE` van een tabel waar rijen naar verwijzen. Een
  tabel met kinderen heropbouwen: de rijen van de kinderen apart zetten
  (`CREATE TABLE _bewaar_x AS SELECT * FROM x`), leegmaken, heropbouwen met
  dezelfde id's, terugzetten. Zie `migratie-0.30.1.sql` en zijn test.
- **De D1-console voert een script niet als één transactie uit.** Een script
  dat halverwege stopt, laat een tussenstand achter. Schrijf migraties zo dat
  een tweede keer veilig is, of zeg wat er moet gebeuren als het halverwege
  stopt.
- **De D1-console slikt geen script van honderden kB.** Opdelen, op een grens
  tussen opdrachten — nooit per regel: een tekst kan regeleinden bevatten
  (`tools/migreer-yoassist.mjs`, `deelOp`).
- **D1 zet een eigen tabel `_cf_KV` in `sqlite_master` en weigert elke lezing
  ervan.** Een backup die alle tabellen leest, sloeg daarop stuk (0.30.1).
- **`schema-controle.sql` kijkt naar tabellen, kolommen en indexen, niet naar
  een UNIQUE of CHECK.** Bij zo'n wijziging een eigen controlequery meegeven.
- **Honderd gebonden parameters per query.** De testomgeving dwingt dat niet
  af; let er zelf op bij `IN (?, ?, …)`.

## Basketbal Vlaanderen (VBL)

- **De uitploeg heet `tUGUID`/`tUNaam`**, niet `uTGUID`/`uTNaam` — tot 0.30.1
  stond de tegenstander bij elke thuiswedstrijd leeg. Bij twijfel: de skill
  `vbl-api` en wat YOAssist uit echte antwoorden leest.
- **Een wedstrijd tussen twee eigen ploegen** staat in beide ploegen: één rij
  per wedstrijd én ploeg.
- **De bond haalt soms het uur weg** bij een gekende wedstrijd (verplaatst):
  het oude moment laten staan, niet overschrijven met leeg.
- **`gespeeld` is `'G'`**, niet `'J'`. **`TeamMatchesByGuid` mengt
  competities.**
- **De API is niet bereikbaar vanuit de sandbox**; de diagnoseroute in de
  Worker toont een echt antwoord.
- **Een Worker mag per aanroep maar een beperkt aantal uitgaande oproepen
  doen** (50 op het gratis plan). Eén oproep per ploeg loopt snel op; de
  officials gebruiken daarom één `OrgMatchesByGuid` voor de hele club.

## Supabase

- **Een gratis project wordt na een week zonder activiteit gepauzeerd**, en
  dan geeft alles status 530: aanmelden, de token-controle (jwks), de ping.
  In september–oktober 2026 lag het een maand stil zonder dat iemand het zag.
  Sinds 0.30.1 krijgen de ADMINs een mail bij twee mislukkingen na elkaar.
  Herstellen: Supabase-dashboard → *Restore project*.

## Werkwijze

- **Een versie op een werkbranch draait niet.** De Worker liep op 0.25.0
  terwijl 0.26.0–0.30.1 al klaarstonden. Cloudflare deployt vanaf `main`.
- **Een tekstvervanging die niets vindt, doet stil niets.** Altijd
  `assert t.count(oud) == 1`.
- **Een vaste datum in een test is een tijdbom.** Datums relatief tegenover
  vandaag rekenen.
- **Een bericht dat bij de eerste sync na een fix voor iedereen vertrekt.**
  Een fix die een veld in de wijzigingshash aanvult, ziet elke rij als
  gewijzigd: kijk of dat een melding geeft (0.30.1: de tegenstander).
- **`schema-controle.sql` draagt het versienummer.** Ook zonder
  schemawijziging opnieuw genereren na het ophogen van `src/versie.js`; de
  test merkt het, maar in 0.34.0 pas na de commit.
- **De testschil van D1 (`test/d1.mjs`) kende geen `batch()`** tot 0.34.0.
  Gebruikt nieuwe code iets van D1 dat de schil niet heeft, vul dan de schil
  aan zoals D1 het doet (batch: alles of niets), in plaats van de code rond
  de schil te schrijven.
- **De automatische taken van de officials staan uit tot de overstap**
  (`officials_automatisch`, 0.34.0). Een nieuwe geplande taak van de module
  hoort in `OFFICIALS_AUTOMATISCH` (`geplandetaken.js`): zolang YOAssist live
  is, doet dat het werk, en zou TeamAssist dubbel versturen of vals alarm
  geven.
- **`bericht_modus` op *omleiden* met een leeg omleidadres** verstuurt niets,
  ook geen alarm. Bij het testen eerst een omleidadres invullen.
