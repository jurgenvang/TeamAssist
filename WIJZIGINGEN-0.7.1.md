# TeamAssist 0.7.1 — het bewijs achter de testrol

Vorige versie: 0.7.0

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

Het gedrag blijft gelijk: met een andere rol kijken kan enkel door een beheerder,
en enkel wanneer een beheerder de instelling heeft aangezet. Wat wijzigt, is hoe
dat bewezen wordt.

In 0.7.0 stond die controle als drie voorwaarden in de contextopbouw, en de test
erop vergeleek de **tekst** van de broncode. Zo'n test vangt een verwijderde
regel, maar niet een verkeerd herschreven regel — en dat is precies de fout die
je hier niet wil missen.

De beslissing staat nu als één functie, `magTestrolGebruiken(rechten,
instelling, gevraagdeRol)`, met echte tests:

- Een coach die de kop meestuurt, krijgt niets. Een FINADM evenmin: die is geen
  beheerder.
- Elke waarde behalve een uitdrukkelijke `'1'` geldt als uit — ook een
  ontbrekende rij, een lege tekst, of `'true'`.
- Zonder gevraagde rol gebeurt er niets.
- **Het beheerrecht wordt op de échte rechten gemeten, niet op de versmalde.**
  Anders kon een beheerder zich tot coach versmallen en daarna niet meer terug,
  omdat het beheerrecht dan weg is.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/rechten.js` | `magTestrolGebruiken` erbij |
| `src/index.js` | de contextopbouw gebruikt die functie |
| `test/testrol.test.mjs` | vijf echte tests in plaats van een tekstvergelijking |
| `test/testrol-context.test.mjs` | controleert nog enkel dat de functie gebruikt wordt |
| `src/versie.js` | 0.7.0 → 0.7.1 |
| `schema-controle.sql` | enkel het versienummer |

## Tests

246, allemaal groen. De drie voorwaarden zijn elk apart uitgeschakeld ter
controle: het beheerrecht weghalen maakt 3 tests rood, de instelling niet
nakijken 1, en de instelling losjes als waar lezen (`if (!instelling)`) ook 1 —
die laatste is het geval dat een tekstvergelijking nooit zou vangen.
