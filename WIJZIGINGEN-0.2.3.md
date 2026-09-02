# TeamAssist 0.2.3 — Resend als SMTP-server

Vorige versie: 0.2.2

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie — actie nodig in Supabase

De ingebouwde mailservice van Supabase stuurt **twee berichten per uur** en is
uitdrukkelijk enkel voor testen bedoeld. Er is geen garantie op levering en het
aantal kan zonder aankondiging wijzigen. Tijdens het opzetten loop je daar binnen
het halfuur tegenaan; met een paar honderd leden is het onbruikbaar.

Zet daarom Resend als SMTP-server. Authentication, dan SMTP Settings, en Enable
Custom SMTP aanzetten:

| Veld | Waarde |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` (letterlijk dat woord) |
| Password | een API-sleutel uit het Resend-dashboard |
| Sender email | een adres op een domein dat in Resend geverifieerd is |
| Sender name | TeamAssist |

Verhoog daarna de limiet bij Authentication, dan Rate Limits. Supabase legt bij
een nieuwe SMTP-server een voorzichtige grens van dertig berichten per uur op, om
de reputatie van het domein te beschermen. Dat is te weinig voor het moment
waarop je een ploeg in één keer uitnodigt.

Ben je al geblokkeerd, dan volstaat een uur wachten. De reden staat in Logs, dan
Auth.

## Wat er wijzigt

Enkel documentatie. De README beschrijft nu het opzetten van Resend als
SMTP-server als stap 4 van de Supabase-opzet, en de sectie over foutopsporing
maakt onderscheid tussen twee gevallen die er hetzelfde uitzien: geen mail omdat
het adres onbekend is, en geen mail omdat de limiet bereikt is. Het eerste zie je
in het logboek van TeamAssist, het tweede in de logs van Supabase.

Dat onderscheid is met opzet niet zichtbaar op het scherm van wie een link
vraagt: het antwoord blijft altijd hetzelfde, anders wordt de route bruikbaar om
af te tasten wie er lid is van de club.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `README.md` | stap 4 over Resend als SMTP-server; foutopsporing uitgebreid |
| `src/versie.js` | 0.2.2 → 0.2.3 |
| `schema-controle.sql` | enkel het versienummer in de kop |

## Tests

103, allemaal groen, met `cd test && npm test`.
