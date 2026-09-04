# TeamAssist 0.14.3 — versienummer in de topbalk (T8)

Vorige versie: 0.14.2

## Databank

Niets.

## Configuratie

Niets.

## Wat er wijzigt

Het versienummer stond enkel onderaan in de footer. Het staat nu ook klein,
gedempt, onder de clubnaam in de topbalk — dezelfde plek waar sinds 0.10.0 al
de clubnaam staat. Geen nieuwe route nodig: `config.versie` kwam al binnen via
`/api/config`.

De footer blijft gewoon staan.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `public/index.html` | `#topbalkversie` toegevoegd onder `#clubnaam` |
| `public/js/app.js` | vult het nieuwe element |
| `test/frontend.test.mjs` | één test erbij |
| `src/versie.js` | 0.14.2 → 0.14.3 |

## Tests

534, allemaal groen.
