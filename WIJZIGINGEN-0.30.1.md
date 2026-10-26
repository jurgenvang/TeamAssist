# TeamAssist 0.30.1 — bugfixes uit het logboek van de echte Worker

Vorige versie: 0.30.0

Vier fouten, alle vier gevonden op de echte Worker (oktober 2026), en elk
eerst in een test nagebootst voor ze opgelost werden.

## Databank — een heropbouw van `wedstrijden`

Voer `migratie-0.30.1.sql` uit in de D1-console, in één keer, daarna
`schema-controle.sql` (bovenaan: `ALLES OK`). Die controle kijkt naar
tabellen en kolommen, niet naar een UNIQUE; dat de migratie gelukt is, zie je
met:

```sql
SELECT sql LIKE '%UNIQUE (wedstrijd_guid, team_guid)%' AS gelukt
  FROM sqlite_master WHERE name = 'wedstrijden';
```

Dat hoort `1` te geven.

`wedstrijden.wedstrijd_guid` was uniek op zich; nu is de combinatie
(`wedstrijd_guid`, `team_guid`) uniek. Een UNIQUE in een kolomdefinitie kan
SQLite niet weghalen, dus geen ALTER maar een heropbouw. Zes tabellen
verwijzen naar `wedstrijden(id)` en D1 laat de foreign keys niet uitzetten
(ook `defer_foreign_keys` helpt niet bij een DROP TABLE). Het script zet de
rijen van die zes tabellen even apart, bouwt `wedstrijden` opnieuw op met
dezelfde id's, en zet ze terug. Er gaat niets verloren.

Getoetst met de foreign keys aan, op het schema van 0.30.0 met rijen in alle
zes verwijzende tabellen: elke rij is er nadien nog, met dezelfde id,
`foreign_key_check` is leeg, de structuur is gelijk aan een verse
`schema.sql`, en twee keer uitvoeren kan geen kwaad. Stopt het script
halverwege met een fout, voer het dan niet opnieuw uit: de rijen staan dan in
de tabellen `_bewaar_*` (zie bovenaan het script).

## 1. Backup downloaden gaf een 500

D1 zet zelf een tabel `_cf_KV` in `sqlite_master` en weigert elke lezing
ervan. De backup las elke tabel uit die lijst, en die ene tabel liet het
geheel mislukken. Tabellen die met `_cf_` beginnen, slaat de backup nu over.
Een tabel die toch niet te lezen is, laat de rest niet meer tegenhouden: ze
staat in een nieuw veld `problemen` in het bestand, zoals bij YOAssist.

## 2. De Supabase-ping faalde een maand zonder dat iemand het zag

Het project was sinds eind september gepauzeerd; de ping faalde elke nacht
met status 530, en dat stond enkel in het logboek.
- **Bij de tweede mislukking na elkaar krijgt elke actieve ADMIN een
  bericht**, met wat hij kan doen (bij de ping: *Restore project* in het
  Supabase-dashboard). Zolang het blijft mislukken één keer per week
  opnieuw, niet bij elke run. Via `verwittigen.js`; de mail gaat via Resend
  en komt dus ook aan als Supabase stilligt. Geldt voor elke geplande taak,
  niet enkel de ping: ook de wedstrijdsync faalde wekenlang ongemerkt.
- **De laatste geslaagde run van elke taak blijft altijd bewaard** bij de
  opruiming van `taak_runs`, hoe oud ook. Nu was niet meer na te gaan wanneer
  de ping voor het laatst lukte, en dus niet of hij ooit gewerkt had.

Let op: het bericht volgt `bericht_modus`. Staat die op *omleiden*, dan gaat
het naar het omleidadres.

## 3. De wedstrijdsync faalde elke keer op twee ploegen

- **ROL 2 — `UNIQUE constraint failed: wedstrijden.wedstrijd_guid`.** Een
  wedstrijd tussen twee eigen ploegen hoort bij beide: één rij thuis, één
  uit, elk met eigen selectie en taken. Dat kon niet zolang de GUID alleen
  uniek was (zie *Databank*). Elke UPDATE in de sync filtert nu ook op de
  ploeg, anders zou de ene ploeg de rij van de andere overschrijven.
  Daarnaast valt een wedstrijd waarin de ploeg thuis noch uit speelt, eruit:
  TeamMatchesByGuid mengt competities.
- **DSE 1 — `NOT NULL constraint failed: wedstrijden.begin`.** De bond haalde
  het uur weg bij een wedstrijd die we al kenden (meestal: wordt verplaatst).
  Het gekende moment blijft nu staan tot de bond een nieuw doorgeeft; de
  wedstrijd telt als gezien, niet als verdwenen, en staat in het antwoord van
  de sync onder `onvolledig`.

Omdat de fout de hele ploeg liet mislukken, werden ook de andere wedstrijden
van ROL 2 en DSE 1 niet meer bijgewerkt. Dat herstelt zich bij de eerste sync
na deze versie.

## 4. De tegenstander bleef leeg bij elke thuiswedstrijd

De naam van de uitploeg werd gelezen uit `uTNaam`; het veld heet `tUNaam`
(zo leest YOAssist het al jaren uit echte antwoorden). Bij elke
thuiswedstrijd stond de tegenstander daardoor leeg. De volgende sync vult
het aan. De tegenstander zit in de wijzigingshash, dus die sync ziet elke
thuiswedstrijd als gewijzigd — maar een tegenstander die enkel aangevuld
wordt (datum, uur, zaal en thuis/uit gelijk) geldt niet als meldbaar. Zonder
die regel kreeg de begeleiding bij de eerste sync een bericht per
thuiswedstrijd.

## Bestanden

| Bestand | Wat |
|---|---|
| `schema.sql` | `wedstrijden`: uniek op (wedstrijd_guid, team_guid) |
| `migratie-0.30.1.sql` | nieuw |
| `schema-alles-in-een.sql`, `schema-kaal.sql`, `schema-controle.sql` | opnieuw gegenereerd |
| `src/routes/admin/backup.js` | `_cf_*` overslaan; `problemen` |
| `src/lib/taakalarm.js` | nieuw: de beheerders verwittigen |
| `src/lib/ping.js`, `src/lib/geplandetaken.js` | roepen het alarm aan |
| `src/lib/opkuis.js` | laatste geslaagde run per taak blijft |
| `src/lib/vbl.js` | `tUNaam`/`tUGUID`; vreemde wedstrijden eruit |
| `src/lib/wedstrijdsync.js` | `onvolledig`; een aangevulde tegenstander meldt niets |
| `src/routes/admin/wedstrijden.js` | elke UPDATE ook op team_guid; `onvolledig` |
| `test/wedstrijden-bugfix.test.mjs` | nieuw: 5 tests |
| `test/migratie-0.30.1.test.mjs` | nieuw: 5 tests |
| `test/backup.test.mjs`, `test/ping.test.mjs`, `test/opkuis.test.mjs`, `test/geplandetaken.test.mjs` | nieuwe tests |
| `test/wedstrijden-routes.test.mjs`, `test/geplandetaken.test.mjs` | testgegevens met de echte veldnamen |
| `src/versie.js` | 0.30.0 → 0.30.1 |
| `.claude/BACKLOG.md` | 0.30.1 bij *afgewerkt* |

## Tests

843, allemaal groen. Elke nieuwe test is eerst rood geweest: de vier
sync-tests tegen de oude code (met exact de twee foutmeldingen uit het
logboek), de aangevulde tegenstander zonder de nieuwe regel, de backup-tests tegen de oude route, en de migratietest met een
weggelaten terugzetstap (2 rood).

## API-vorm

- `GET /api/admin/backup`: een nieuw veld `problemen` naast `tabellen`.
- `POST /api/admin/wedstrijden/sync`: per ploeg een lijst `onvolledig`, en
  `totalen.onvolledig`.
De frontend leest geen van beide velden; niets bestaands verandert van vorm.
