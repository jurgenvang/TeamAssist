# TeamAssist 0.13.0 — aanwezigheden

Vorige versie: 0.12.0. Fase 4, de hoofdfunctie van de app.

## Databank — nieuwe tabellen én een ALTER

Twee nieuwe tabellen:

```sql
CREATE TABLE aanwezigheden (...)       -- zie schema.sql voor het volledige veld
CREATE TABLE wedstrijdselecties (...)
```

En kolommen erbij op twee bestaande tabellen — een gewone `ALTER TABLE ADD
COLUMN` volstaat, geen `DROP`:

```sql
ALTER TABLE teams ADD COLUMN opgave_toegelaten_training  INTEGER NOT NULL DEFAULT 1 CHECK (opgave_toegelaten_training IN (0,1));
ALTER TABLE teams ADD COLUMN opgave_toegelaten_wedstrijd INTEGER NOT NULL DEFAULT 1 CHECK (opgave_toegelaten_wedstrijd IN (0,1));
ALTER TABLE teams ADD COLUMN opgave_termijn_training_uren  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE teams ADD COLUMN opgave_termijn_wedstrijd_uren INTEGER NOT NULL DEFAULT 1;
ALTER TABLE wedstrijden ADD COLUMN selectie_gepubliceerd INTEGER NOT NULL DEFAULT 0 CHECK (selectie_gepubliceerd IN (0,1));
```

Draai daarna `schema-controle.sql`: `ALLES OK`.

## Configuratie

Niets.

## Wat er wijzigt

Dit bouwt rechtstreeks op de architectuur (hoofdstuk 8) en op rechten die er
al sinds 0.1.0 lagen — `team.aanwezigheid.bekijken`, `.vaststellen`,
`team.selectie.beheren`, `speler.uitsluiten`, `aanwezigheid.opgeven.eigen` en
`.kind` bestonden al, ongewijzigd.

### Drie velden, geen twee

Opgave (wat de speler of ouder vooraf invulde), selectie (enkel bij
wedstrijden, in een eigen tabel — 'niet geselecteerd' is nooit afwezig), en
vaststelling (wat de coach achteraf noteerde). Ze staan los van elkaar: de
coach overschrijft nooit de opgave. Wie zich afmeldde en toch kwam, blijft
zichtbaar als precies dat.

### Opgeven: `POST /api/aanwezigheid/opgave`

Door een speler voor zichzelf, of door een ouder namens zijn kind — gecontroleerd
tegen een echte `ouder_kind`-rij, niet enkel tegen wat de body beweert. Twee
harde grenzen:

- **Een uitgesloten speler kan zichzelf niet terugzetten op aanwezig**, ook al
  probeert hij het rechtstreeks via de route.
- **Na de opgavetermijn van de ploeg wordt elke opgave geweigerd** — apart
  instelbaar voor trainingen en wedstrijden, standaard één uur.

`GET /api/aanwezigheid/mijn` toont de eerstvolgende trainingen en wedstrijden
van jezelf en je kinderen. **Bij het bouwen ontdekt en rechtgezet:** de eerste
versie van deze query kon bij twee kinderen in dezelfde ploeg niet
onderscheiden van wie welke opgave was — de `LEFT JOIN` matchte op een lijst
id's in plaats van op het specifieke kind. Een test dekt dit geval nu expliciet.

### Uitsluiten: de enige plaats waar een volwassene eenzijdig iets oplegt aan een minderjarige

`POST /api/admin/aanwezigheid/uitsluiten`. De reden is verplicht — een
maatregel zonder motief is door niemand anders te beoordelen. Zowel het
uitsluiten als het terugdraaien komt altijd in het logboek. PLOEGV heeft dit
recht niet; dat lag al vast in de rechtenlaag.

### Selectie: een klad tot ze gepubliceerd wordt

`POST /api/admin/selectie` schrijft de lijst weg zonder ze te tonen aan de
ploeg. `POST /api/admin/selectie/publiceren` zet in één beweging de vlag om —
pas dan ziet de hele ploeg de namen (architectuur 8.4). Enkel spelers van de
eigen ploeg kunnen geselecteerd worden; doorschuiven komt later.

### Een route die het team pas na een databankoproep kent

Bij de meeste routes staat het team in de URL en kan de rechtencontrole
synchroon gebeuren vóór de route zelf draait. Bij aanwezigheid is dat team pas
bekend nadat de activiteit (training of wedstrijd) is opgezocht. Deze zeven
routes controleren daarom zelf `rechten.mag(...)`, zonder `route.recht` — een
patroon dat nu expliciet vastligt in `test/routes.test.mjs`, zodat een
volgende route zonder recht bewust moet zijn, niet per ongeluk.

### Nieuw: een lijst van individuele trainingen

Tot nu toe was enkel de trainingsreeks zichtbaar, niet de concrete trainingen
die eruit voortkwamen. `GET /api/admin/trainingen` vult dat gat — nodig om
vanuit het scherm naar een specifieke training te klikken voor de aanwezigheid.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `schema.sql` | `aanwezigheden`, `wedstrijdselecties`, vier kolommen op `teams`, één op `wedstrijden` |
| `src/lib/aanwezigheidregels.js` | nieuw: termijnen, uitsluiting, opbouw van een opgave |
| `src/routes/aanwezigheid-opgave.js` | nieuw |
| `src/routes/admin/aanwezigheid-beheer.js` | nieuw |
| `src/routes/admin/trainingsreeksen.js` | `trainingenTonen` erbij |
| `src/index.js` | acht routes ingehaakt |
| `public/js/schermen/mijn-opgaven.js` | nieuw |
| `public/js/schermen/aanwezigheid-beheer.js` | nieuw |
| `public/js/schermen/trainingen.js` | aanwezigheidsknop per wedstrijd |
| `public/js/schermen/ploegen.js` | koppelt de nieuwe schermen bij het tonen van een ploeg |
| `public/index.html` | opgaveblok bij Overzicht, aanwezigheids- en selectiescherm bij Ploegen |
| `public/js/app.js` | knoppen ingehaakt |
| `test/aanwezigheidregels.test.mjs`, `test/aanwezigheid-opgave.test.mjs`, `test/aanwezigheid-beheer.test.mjs` | nieuw |
| `test/trainingsreeksen-routes.test.mjs`, `test/routes.test.mjs`, `test/frontend.test.mjs` | uitgebreid |
| `src/versie.js` | 0.12.0 → 0.13.0 |

## Tests

455, allemaal groen. Drie fouten ingebouwd ter controle: uitsluiting negeren
bij het toelaten van een opgave maakte 2 tests rood, PLOEGV toch laten
vaststellen 5, uitsluiten zonder reden toelaten 1. Plus een vierde, gevonden
tijdens het bouwen zelf: de ambigue join bij meerdere kinderen in dezelfde
ploeg, teruggezet en bevestigd dat de nieuwe test die vangt (2 tests rood).

## Daarna

Optie 3 staat nog open: de OpenHolidays-fix (0.11.1) bevestigen met een echte
droogloop op de Worker. Voor fase 4 zelf blijft er nog wat over de rand van dit
pakket: T7 (het tabblad Mijn club) wacht op fase 5 voor de meldingsvlag, en
T1 (tafeltaken) bouwt straks voort op dezelfde `aanwezigheden`-tabel via
`hoedanigheid = 'OUVO'`.
