# TeamAssist 0.14.1 — de verkorte teamnaam

Vorige versie: 0.14.0

## Databank — één ALTER TABLE

```sql
ALTER TABLE teams ADD COLUMN naam_kort TEXT;
```

Bijgevoegd als `alter-0.14.1-naam_kort.sql`. Draai daarna `schema-controle.sql`:
`ALLES OK`. Geen `DROP` nodig — een gewone, nullable kolom.

## Configuratie

Niets.

## De fout die dit rechtzet

`teams.naam` komt rechtstreeks van Basketbal Vlaanderen, en is de **volledige**
naam: `AB InBev Leuven Bears G12 A`. Intern spreekt de club over `U12 A` — de
clubnaam valt weg, en de categoriecode wisselt van letter: `G` en `J` worden
`U` (`G12`→`U12`, `J16`→`U16`), `M` blijft `M` (`M14` blijft `M14`), en een
code zonder cijfers (`HSE`, `DSE`) blijft ongewijzigd.

**Dit was door het hele project heen verkeerd aangenomen** — elke test en het
trainingsuren-sjabloon van 0.14.0 gingen ervan uit dat `teams.naam` al de
korte vorm was. In de praktijk zou het trainingsuren-sjabloon dus voor élk
team 'onbekend' gemeld hebben, ondanks dat het team gewoon bestaat.

## Wat er wijzigt

**`teams.naam_kort`**, berekend bij elke ploegsynchronisatie
(`src/lib/categorie.js`, `verkorteTeamnaam()`). Gebruikt de `clubnaam`-instelling
om de clubnaam eraf te knippen; lukt dat knippen niet — een onverwachte
naamopbouw — dan komt de volledige naam terug in plaats van iets fout af te
knippen.

**Het trainingsuren-sjabloon matcht nu eerst op `naam_kort`, met de volledige
naam als terugval.** Zowel het downloaden (dat toont voortaan de korte naam)
als het inlezen zijn hierop aangepast.

**Bij het bouwen ontdekt: `categorie.js` had nog geen enkel testbestand**,
ondanks dat het onderwijsgroep- en GUID-logica bevat die overal gebruikt
wordt. Er zijn nu 18 tests voor het volledige bestand, niet enkel voor de
nieuwe functies.

**Bij het opnieuw toetsen van de CSV's uit 0.14.0 tegen een realistische
teamlijst (volledige naam + verkorte naam) kwam nog een tweede, kleinere fout
boven water:** één cel in de PDF had `U21A` zonder spatie staan, overal elders
stond het met een spatie (`U21 A`). Bij een echte import zou dat onterecht als
'onbekend team' gemeld zijn. Gecorrigeerd in beide meegeleverde CSV's.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `schema.sql` | `teams.naam_kort` |
| `alter-0.14.1-naam_kort.sql` | nieuw: de ALTER voor een bestaande installatie |
| `src/lib/categorie.js` | `verkortCategorie()`, `verkorteTeamnaam()` |
| `src/lib/teamsync.js` | berekent en vergelijkt `naam_kort` |
| `src/routes/admin/teams.js` | haalt de `clubnaam`-instelling op, slaat `naam_kort` op |
| `src/lib/reeksensjabloonplan.js` | matcht eerst op `naam_kort` |
| `src/routes/admin/reeksensjabloon.js` | export gebruikt `naam_kort` |
| `test/categorie.test.mjs` | nieuw: 18 tests voor het hele bestand |
| `test/teamsync.test.mjs`, `test/teams-routes.test.mjs`, `test/reeksensjabloonplan.test.mjs`, `test/reeksensjabloon-routes.test.mjs` | uitgebreid |
| `src/versie.js` | 0.14.0 → 0.14.1 |

## Tests

530, allemaal groen. Twee fouten ingebouwd ter controle: enkel op de volledige
naam matchen (`naam_kort` negeren) maakte 2 tests rood; `G`/`J` niet naar `U`
omzetten maakte 5 tests rood.

## De twee CSV's, opnieuw geleverd

`sjabloon-zaaluren-2026-27.csv` ongewijzigd. `sjabloon-trainingsuren-2026-27.csv`
met de `U21A`-correctie. Beide opnieuw getoetst — deze keer niet tegen een
korte-naam-fixture, maar tegen een gesimuleerde realistische teamlijst met
volledige VBL-namen: 30 teamnamen, nul mismatches; 72 van de 77 rijen geven
een nieuwe reeks, de resterende 5 zijn exact de vijf nog uit te zoeken
categorieën.
