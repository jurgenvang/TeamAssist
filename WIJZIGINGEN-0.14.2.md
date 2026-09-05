# TeamAssist 0.14.2 — witruimte in de teamnaam maakt niet meer uit

Vorige versie: 0.14.1

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer.

## Configuratie

Niets.

## Aanleiding

0.14.1 corrigeerde één geval (`U21A` zonder spatie) handmatig in de
meegeleverde CSV. Terecht opgemerkt: dat is geen eenmalige typfout in die ene
PDF — een ontbrekende spatie tussen de categoriecode en de letter kan bij elk
sjabloon gebeuren, bij het overtypen of kopiëren van een rooster. Dat hoort dus
in de matchlogica zelf opgevangen te worden, niet telkens met de hand
rechtgezet te worden in de brongegevens.

## Wat er wijzigt

Het trainingsuren-sjabloon matcht een teamnaam nu op een genormaliseerde vorm:
kleine letters, én alle witruimte weg. `U21 A`, `U21A` en `U21   A` gelden
voortaan als dezelfde naam — zowel bij het matchen op `naam_kort` als bij de
volledige naam als terugval.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/reeksensjabloonplan.js` | `matchnaam()`: kleine letters + witruimte weg, gebruikt bij elke naamvergelijking |
| `test/reeksensjabloonplan.test.mjs` | drie tests erbij |
| `src/versie.js` | 0.14.1 → 0.14.2 |

## Tests

533, allemaal groen. Ter controle de witruimtenormalisatie weggehaald: 3
tests rood.
