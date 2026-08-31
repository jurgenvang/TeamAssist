# TeamAssist 0.2.2 — uitleg bij de aanmeldketen

Vorige versie: 0.2.1

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets aan de Worker. Wel het nakijken waard in Supabase: staat het adres van de
app bij **Redirect URLs** (Authentication, dan URL Configuration)? Zonder die
regel komt elke aanmeldlink uit op `localhost:3000`.

## Wat er wijzigt

Enkel documentatie. Twee stukken erbij in de README.

Stap 3 van de Supabase-opzet is uitgeschreven. Site URL én Redirect URLs zijn
allebei nodig, met een regel op `/**` erbij, en beide adressen als de app op meer
dan één adres draait. Met de nadruk op waar het misloopt: Supabase vervangt een
niet-toegelaten redirect **stil** door de Site URL — geen foutmelding, geen
spoor. Het lijkt daardoor op een fout in de applicatie terwijl het een ontbrekende
regel in een lijst is. Er staat ook bij hoe je het nakijkt zonder in te loggen:
de parameter `redirect_to` in de mail bekijken.

Daarnaast een sectie over wat er kan misgaan bij het aanmelden: de link die op
localhost uitkomt, "nog geen toegang" na een geslaagde aanmelding, geen mail, en
een link die niet meer werkt. Telkens met waar je moet kijken.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `README.md` | stap 3 uitgeschreven, plus een sectie over foutopsporing bij het aanmelden |
| `src/versie.js` | 0.2.1 → 0.2.2 |
| `schema-controle.sql` | enkel het versienummer in de kop |

## Tests

103, allemaal groen, met `cd test && npm test`.
