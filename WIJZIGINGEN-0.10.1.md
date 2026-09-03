# TeamAssist 0.10.1 — het logo tonen in plaats van enkel de link

Vorige versie: 0.10.0

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

Bij Configuratie → Huisstijl → *Voorstel ophalen bij de bond* stond het logo
tot nu toe als een kale URL in de tekst. Een link zegt niets over hoe een logo
eruitziet; nu wordt het logo zelf getoond, met daaronder de aantekening dat het
URL-patroon niet uit de officiële VBL-documentatie bevestigd is.

**Laadt het logo niet**, dan verdwijnt de afbeelding en verschijnt in plaats
daarvan de URL als tekst — geen zichtbaar gebroken-afbeelding-icoon. Dezelfde
terugval als in `huisstijl.js` bij het toepassen van een logo.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `public/js/schermen/instellingen.js` | het logo als `<img>` in plaats van als tekstregel, met terugval bij een laadfout |
| `public/stijl.css` | `.logovoorbeeld` |
| `test/frontend.test.mjs` | twee tests erbij |
| `src/versie.js` | 0.10.0 → 0.10.1 |
| `schema-controle.sql` | enkel het versienummer |

## Tests

345, allemaal groen. Ter controle de terugval bij een laadfout weggehaald: 1
test rood.
