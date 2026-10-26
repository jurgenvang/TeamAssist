# TeamAssist 0.31.0 — I1 fase 2b: YOAssist overzetten

Vorige versie: 0.30.1

Een script dat een YOAssist-backup omzet naar SQL voor TeamAssist:
`tools/migreer-yoassist.mjs`. Het draait op je eigen computer, niet in de
Worker; voor wie de app gebruikt, verandert er niets.

**Nog niet uitvoeren.** Het script hoort bij de overschakeling (fase 5), met
verse backups van dat moment. YOAssist blijft tot dan live; wat nu overgezet
wordt, is tegen dan verouderd. Bovendien kunnen de officials zich na het
uitvoeren aanmelden in TeamAssist, waar hun schermen nog niet bestaan.

## Databank

Geen wijziging.

## Gebruik

```
node tools/migreer-yoassist.mjs yoassist-backup.json teamassist-backup.json
node tools/migreer-yoassist.mjs yoassist-backup.json teamassist-backup.json --sql uit.sql
```

Het eerste geeft enkel het rapport (de droogloop). Het tweede schrijft ook
`uit.sql`, en ernaast `uit-1.sql`, `uit-2.sql`, … van hoogstens 90 kB, om na
elkaar in de D1-console te plakken — 600 kB in één keer slikt die niet.

## Wat het doet

Zoals beslist in I1 (*De migratie*):
- **Personen:** op e-mailadres; anders op voor- en achternaam als er precies
  één kandidaat is, en die nog geen ander e-mailadres heeft. Een naamgenoot
  met een ander adres, of twee naamgenoten, is twijfel: dan een nieuwe
  persoon, en een regel in het rapport. Een bestaande persoon krijgt enkel
  aangevuld wat leeg is (e-mail, gsm); agendasleutel en kanaal komen uit
  YOAssist.
- **Rollen:** YO/YOPLUS uit het profiel, YOADM voor een beheerder.
  Herinneringen en gsm delen naar `officials_voorkeuren`.
- **Ploegen:** `teams.officials` volgt `volgen`. Een ploeg die TeamAssist niet
  kent, komt erbij, niet gevolgd.
- **Wedstrijden:** de thuiswedstrijd op de ploeg van de thuisploeg, plus een
  rij in `officials_wedstrijd`. Het script verwijst naar een wedstrijd via
  (wedstrijd_guid, team_guid), nooit via een id: tussen de backup en het
  uitvoeren kan de sync rijen toevoegen.
- **Beschikbaarheden, aanduidingen, problemen, facturatie, Regio, de
  woensdaglijsten, Mijn berichten, en het logboek voor zover het openstaat.**
  Een vertrokken official in de facturatie houdt zijn e-mailadres als spoor
  (`yoassist:…`) — persoon_id is daar bewust geen foreign key.
- **Instellingen:** `facturatie_ontvangers`, `forfait_aanduiding`,
  `extern_namen`. De afzender niet.
- **Niet mee**, met de reden in het rapport: clubs, sync_runs,
  push_abonnementen, categorieën (staan er al), mededelingen, en de lege
  tabellen.

Alles is opnieuw uit te voeren zonder dubbels (INSERT OR IGNORE of een NOT
EXISTS op een natuurlijke sleutel): de D1-console voert een script niet als
één transactie uit, dus een tweede keer na een onderbreking moet veilig zijn.

## Getoetst tegen de echte backups (26 oktober 2026)

Een kopie van de TeamAssist-databank, met de foreign keys aan, en de zeven
delen na elkaar, twee keer:

| | Voor | Na |
|---|---|---|
| personen | 263 | 268 (5 nieuw) |
| rollen | 72 | 84 |
| officials_wedstrijd | 0 | 210 |
| officials_beschikbaarheid | 0 | 154 |
| officials_aanduidingen | 0 | 38 |
| berichten | 0 | 125 |
| logboek | 1031 | 1318 (287 open regels) |

De tweede keer veranderde niets; `foreign_key_check` bleef leeg. Alle 210
wedstrijden en 33 ploegen stonden al in TeamAssist.

Uit het rapport, voor wie het moet weten:
- Jurgen op e-mailadres; Max Cuyvers, Jonas Boeykens en Jaro Vanmontfort op
  naam; Fluppe, Mike, Tim, Rhune en Thiebe worden nieuwe personen.
- Max Cuyvers heeft in YOAssist het adres `ruudcuyvers@…` — mogelijk dat van
  een ouder. Komt het via het personensjabloon ook bij de ouder, dan botst
  het (personen.email is uniek). Vóór de overschakeling beslissen.
- De tabel `ouder_kind` bestaat niet in de echte YOAssist-databank (zat er
  sinds v1.7 in het schema, maar is nooit aangemaakt). Er zijn dus geen
  koppelingen om over te zetten.

## Bestanden

| Bestand | Wat |
|---|---|
| `tools/migreer-yoassist.mjs` | nieuw |
| `test/migreer-yoassist.test.mjs` | nieuw: 10 tests, met nagemaakte backups |
| `README.md` | hoe het script te gebruiken |
| `src/versie.js` | 0.30.1 → 0.31.0 |
| `schema-controle.sql` | opnieuw gegenereerd (enkel het versienummer) |
| `.claude/BACKLOG.md` | fase 2b afgewerkt; fase 3 klaar om op te delen |

## Tests

853, allemaal groen. Ter controle: naam koppelen ook bij een ander
e-mailadres (1 rood), berichten zonder NOT EXISTS (1 rood: dubbels bij een
tweede run), en opdelen per regel in plaats van per opdracht (1 rood).
