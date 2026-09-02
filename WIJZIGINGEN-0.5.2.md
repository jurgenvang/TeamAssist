# TeamAssist 0.5.2 — documentatie bijgewerkt

Vorige versie: 0.5.1

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

Enkel de README. Drie stukken erbij, en één stuk rechtgezet.

**Waarom de eerste beheerder handmatig moet.** Er staat geen enkel e-mailadres in
de code. Een beheerder hardcoderen zou een achterdeur zijn die elke
databankwijziging overleeft, en wijzigen zou een deploy vragen. Het alternatief —
een scherm dat de eerste gebruiker tot beheerder maakt — is erger: zo'n scherm
staat open tot iemand het gebruikt, en wie toevallig als eerste de app opent, is
beheerder van een club met gegevens van minderjarigen. De D1-console is de
bootstrap én de weg terug.

**Meerdere beheerders.** Hoe je er een toevoegt, hoe je een rol weer afneemt, en
dat de persoon daarbij blijft bestaan met zijn ploegen en zijn geschiedenis.

**Waarom sommige meldingen vaag zijn en andere niet.** Het aanmeldformulier
blijft altijd hetzelfde antwoorden, want die route is publiek en een verschillend
antwoord maakt ze bruikbaar om af te tasten wie er lid is van de club. De
meldingen ná een geslaagde aanmelding zijn wel duidelijk: om die te zien moet je
de mailbox beheren, dus leer je enkel iets over je eigen adres. Het overblijvende
verschil in reactietijd staat er ook bij, met de reden waarom het aanvaard is.

**Rechtgezet:** de inleiding beschreef nog de eerste versie ("geen
synchronisatie, geen import"), wat sinds 0.4.0 en 0.5.0 niet meer klopte. Het
versienummer is bovendien uit de titel gehaald — het liep daar stil achter, en
het staat al in `src/versie.js` en op `/api/versie`.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `README.md` | bootstrap van beheerders, verantwoording van de meldingen, inleiding bijgewerkt |
| `src/versie.js` | 0.5.1 → 0.5.2 |
| `schema-controle.sql` | enkel het versienummer |

## Tests

181, allemaal groen.
