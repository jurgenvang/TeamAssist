# TeamAssist 0.1.4 — wat er wijzigde

Vorige versie: 0.1.3

## Databank

Niets aan het schema. `schema-controle.sql` wijzigt enkel door het versienummer
in de kopregel.

## Configuratie — actie nodig in Supabase

De bevestigingslink kwam uit op `http://localhost:3000`. Dat had twee oorzaken,
waarvan er één in de code zat en één in het dashboard.

Ga naar Authentication, dan URL Configuration:

- Zet **Site URL** op het adres van de app. Standaard staat daar
  `http://localhost:3000`, en dat is het adres waar elke link uitkomt zolang er
  niets beters wordt meegegeven.
- Voeg datzelfde adres toe bij **Redirect URLs**. Supabase honoreert enkel
  adressen van die lijst. Staat er een adres niet op, dan wordt het stil
  vervangen door de Site URL — er komt geen foutmelding bij het versturen.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `public/index.html` | `redirect_to` gaat nu als queryparameter op de URL mee. In de body meesturen — zoals de clientbibliotheek het doet lijken — wordt door de REST-API genegeerd, waarna Supabase terugvalt op de Site URL. Daarnaast wordt een fout uit het URL-fragment nu getoond in plaats van genegeerd. |
| `src/versie.js` | 0.1.3 → 0.1.4 |
| `schema-controle.sql` | enkel het versienummer in de kop |
| `test/frontend.test.mjs` | twee tests erbij: `redirect_to` staat in de URL, en de foutmelding wordt gelezen |
| `README.md` | de twee instellingen bij URL Configuration staan er nu bij |

## Tests

91, allemaal groen, met `cd test && npm test`.
