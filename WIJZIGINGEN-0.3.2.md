# TeamAssist 0.3.2 — bevindingen uit een echt VBL-antwoord

Vorige versie: 0.3.1

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

`GET /api/admin/vbl-diagnose` is gedraaid op `BVBL1125J16  2`. Vier dingen liggen
daarmee vast; ze staan in hoofdstuk 7 van de architectuur.

| Veld | Bevinding |
|---|---|
| `sGebDat` | `dd-mm-jjjj` |
| `sAanslDat` | `dd-mm-jjjj uu:mm` — een ander formaat in hetzelfde record |
| `ma` | leeg bij alle dertien spelers; wordt niet ingelezen |
| `tvNr` | samengestelde sleutel (`51125J162_601903`), geen volgnummer |

**`sAanslDat` is niet de datum waarop iemand lid werd.** Alle spelers staan op
dezelfde dag, binnen enkele minuten van elkaar: het moment waarop de ploeg werd
samengesteld. Als 'lid sinds' is dat veld dus onbruikbaar, en dat is precies het
soort veld dat later verkeerd op een scherm belandt als het nu niet genoteerd
wordt.

De samenvatting telde `tvNr` alsof het een volgnummer was, wat bij een echte
ploeg enkel eenlingen oplevert. Ze toont nu een paar voorbeelden.

De testgegevens zijn gelijkgezet met het echte antwoord: een leeg `ma`, en de
werkelijke vorm van `sAanslDat` en `tvNr`. Fixtures die niet op de werkelijkheid
lijken, geven vertrouwen zonder dekking.

## Nog open

`tvCaC` gaf enkel `Coach`. Vraag met dezelfde knop eens een seniorenploeg op —
daar staat vaker een afgevaardigde of assistent bij, en dan zie je of er andere
codes bestaan. Blokkeert niets.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/vbl.js` | `tvNr` als sleutel behandeld, niet als volgnummer |
| `test/vbl.test.mjs` | testgegevens gelijkgezet met het echte antwoord |
| `src/versie.js` | 0.3.1 → 0.3.2 |
| `schema-controle.sql` | enkel het versienummer in de kop |
| `README.md` | versienummer |

## Tests

123, allemaal groen.
