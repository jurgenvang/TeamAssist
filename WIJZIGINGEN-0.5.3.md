# TeamAssist 0.5.3 — een ploeg aanvinken werkt weer

Vorige versie: 0.5.2

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

Een fout in het scherm. Het vinkje bij een ploeg stuurde zijn wijziging met een
kale `fetch` in plaats van via `api()`. Het verschil: `api()` vernieuwt een
verlopen token, een kale `fetch` niet. Een Supabase-token is maar enkele minuten
geldig, dus wie het scherm even open liet staan, kreeg een 401 terug.

Erger nog: het antwoord werd helemaal niet gelezen. Het vinkje bleef staan waar
je het zette, er werd niets bewaard, en er verscheen geen enkele melding. Het
scherm toonde dus iets anders dan wat er in de databank stond.

Drie dingen rechtgezet:

- Het aanvinken loopt via `api()`, met vernieuwing van het token.
- Het vinkje staat even uit tijdens het bewaren, zodat twee snelle klikken
  elkaar niet inhalen.
- Mislukt het, dan **springt het vinkje terug** en verschijnt de reden. Een
  scherm dat iets anders toont dan de databank, is erger dan een foutmelding.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `public/index.html` | aanvinken via `api()`, met terugkoppeling |
| `test/frontend.test.mjs` | twee tests erbij |
| `src/versie.js` | 0.5.2 → 0.5.3 |
| `schema-controle.sql` | enkel het versienummer |

## Tests

183, allemaal groen. Ter controle de kale `fetch` opnieuw ingebouwd: 1 test rood.
