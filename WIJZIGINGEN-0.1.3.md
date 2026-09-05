# TeamAssist 0.1.3 — wat er wijzigde

Vorige versie: 0.1.2

## Databank

Niets aan het schema. `schema-controle.sql` wijzigt enkel door het versienummer
in de kopregel.

## Configuratie

Niets te doen. Deze versie vult juist iets in dat ontbrak.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `wrangler.toml` | `database_id` ingevuld: `0180e02c-f331-4f75-9e29-3f8f004ca1b5`. Zonder die waarde weigert de deploy met foutcode 10021. |
| `src/versie.js` | 0.1.2 → 0.1.3 |
| `schema-controle.sql` | enkel het versienummer in de kop |
| `README.md` | de id staat er nu bij, met waarom hij niet als secret kan |

## Tests

89, allemaal groen, met `cd test && npm test`.
