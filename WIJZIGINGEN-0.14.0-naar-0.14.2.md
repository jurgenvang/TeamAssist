# TeamAssist — cumulatieve delta van 0.14.0 naar 0.14.2

Deze delta bevat alles wat wijzigde over **twee** versies heen: 0.14.1 en
0.14.2. Gebruik dit bestand in plaats van de losse 0.14.1-delta, die niet
meer beschikbaar is. De volledige `WIJZIGINGEN-0.14.1.md` en
`WIJZIGINGEN-0.14.2.md` staan hieronder na elkaar; dit bestand vervangt beide
niet, het voegt ze enkel samen voor wie van 0.14.0 rechtstreeks naar 0.14.2
gaat.

---

## 0.14.1 — de verkorte teamnaam

### Databank — één ALTER TABLE

```sql
ALTER TABLE teams ADD COLUMN naam_kort TEXT;
```

Bijgevoegd als `alter-0.14.1-naam_kort.sql`. Draai daarna `schema-controle.sql`:
`ALLES OK`. Geen `DROP` nodig.

### De fout die dit rechtzet

`teams.naam` komt rechtstreeks van Basketbal Vlaanderen, en is de **volledige**
naam: `AB InBev Leuven Bears G12 A`. Intern spreekt de club over `U12 A` — de
clubnaam valt weg, en de categoriecode wisselt van letter: `G` en `J` worden
`U` (`G12`→`U12`, `J16`→`U16`), `M` blijft `M` (`M14` blijft `M14`), en een
code zonder cijfers (`HSE`, `DSE`) blijft ongewijzigd.

Dit was door het hele project heen verkeerd aangenomen — elke test en het
trainingsuren-sjabloon van 0.14.0 gingen ervan uit dat `teams.naam` al de
korte vorm was.

### Wat er wijzigde

- `teams.naam_kort`, berekend bij elke ploegsynchronisatie
  (`src/lib/categorie.js`, `verkorteTeamnaam()`), met een veilige terugval
  naar de volledige naam als het knippen niet lukt.
- Het trainingsuren-sjabloon matcht eerst op `naam_kort`, met de volledige
  naam als terugval — zowel downloaden als inlezen.
- `categorie.js` had nog geen enkel testbestand; er zijn nu 18 tests voor het
  volledige bestand.
- Bij het herverifiëren van de CSV's uit 0.14.0 kwam een tweede fout boven
  water: `U21A` zonder spatie in de bron, overal elders met een spatie —
  destijds handmatig gecorrigeerd in de meegeleverde CSV.

### Tests
530, allemaal groen. Ter controle: enkel op de volledige naam matchen gaf 2
rode tests; `G`/`J` niet omzetten naar `U` gaf er 5.

---

## 0.14.2 — witruimte in de teamnaam maakt niet meer uit

### Databank
Niets.

### Aanleiding
0.14.1 corrigeerde de ontbrekende spatie bij `U21A` handmatig, in die ene
CSV. Terecht opgemerkt dat dit geen eenmalige typfout is: een ontbrekende
spatie tussen de categoriecode en de letter kan bij elk sjabloon gebeuren,
bij het overtypen of kopiëren van een rooster. Dat hoort in de matchlogica
zelf opgevangen te worden.

### Wat er wijzigde
Het trainingsuren-sjabloon matcht een teamnaam nu op een genormaliseerde
vorm: kleine letters, én alle witruimte weg. `U21 A`, `U21A` en `U21   A`
gelden voortaan als dezelfde naam — zowel bij `naam_kort` als bij de
volledige naam als terugval. Nieuwe functie: `matchnaam()` in
`src/lib/reeksensjabloonplan.js`.

### Tests
533, allemaal groen. Ter controle: de witruimtenormalisatie weghalen gaf 3
rode tests.

---

## Samenvatting van gewijzigde bestanden (beide versies samen)

| Bestand | Wat |
|---|---|
| `schema.sql`, `schema-alles-in-een.sql`, `schema-kaal.sql`, `schema-controle.sql` | `teams.naam_kort` erbij |
| `alter-0.14.1-naam_kort.sql` | nieuw: de ALTER voor een bestaande installatie |
| `src/lib/categorie.js` | `verkortCategorie()`, `verkorteTeamnaam()` |
| `src/lib/teamsync.js` | berekent en vergelijkt `naam_kort` |
| `src/routes/admin/teams.js` | haalt de `clubnaam`-instelling op, slaat `naam_kort` op |
| `src/lib/reeksensjabloonplan.js` | matcht op `naam_kort` mét terugval, én witruimtetolerant (`matchnaam()`) |
| `src/routes/admin/reeksensjabloon.js` | export gebruikt `naam_kort` |
| `test/categorie.test.mjs` | nieuw: 18 tests |
| `test/teamsync.test.mjs`, `test/teams-routes.test.mjs`, `test/reeksensjabloonplan.test.mjs`, `test/reeksensjabloon-routes.test.mjs` | uitgebreid |
| `src/versie.js` | 0.14.0 → 0.14.2 |

## Volgorde bij het toepassen

Deze delta in één keer over een 0.14.0-installatie uitpakken volstaat — de
bestanden staan al in hun eindtoestand (0.14.2), niet als twee aparte lagen.
Draai daarna `schema-controle.sql`: `ALLES OK`. Eindtotaal: 533 tests groen.
