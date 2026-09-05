# TeamAssist 0.2.1 — installatie-uitleg

Vorige versie: 0.2.0

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

Enkel documentatie. De README beschrijft nu de volledige eerste opzet van de
databank: de twee rijen die er handmatig in moeten (een actief seizoen en de
eerste beheerder), waarom dat handmatig gebeurt in plaats van met adressen in de
code, hoe je nakijkt of het klopt, hoe je een tweede beheerder toevoegt, en welke
drie tabellen samen bepalen of iemand binnen raakt.

Twee valkuilen staan er expliciet bij. Bij de rol ADMIN blijven `team_guid` en
`seizoen` leeg — het schema weigert de rij anders. En het e-mailadres moet
letterlijk overeenkomen met wat bij Supabase gebruikt wordt: Gmail negeert punten
vóór het apenstaartje, TeamAssist niet, dus `jurgen.vang@` en `jurgenvang@`
komen bij Gmail op hetzelfde uit maar hier niet.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `README.md` | de volledige initiële setup, met controlequery en tweede beheerder |
| `src/versie.js` | 0.2.0 → 0.2.1 |
| `schema-controle.sql` | enkel het versienummer in de kop |

## Tests

103, allemaal groen, met `cd test && npm test`.
