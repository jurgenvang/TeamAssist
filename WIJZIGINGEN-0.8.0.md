# TeamAssist 0.8.0 — trainingen, zalen en vakanties

Vorige versie: 0.7.1. Eerste pakket van fase 3.

## Databank — nieuwe tabellen, geen ALTER

Zes tabellen erbij: `zalen`, `zaal_blokken`, `zaal_sluitingen`, `periodes`,
`trainingsreeksen`, `trainingen`. Geen enkele bestaande tabel wijzigt.

Voer het `CREATE TABLE`-blok voor deze zes tabellen uit `schema-kaal.sql` uit —
of, eenvoudiger op een installatie zonder trainingsgegevens, gewoon
`schema-alles-in-een.sql` in zijn geheel. Draai daarna `schema-controle.sql`:
`ALLES OK`.

## Configuratie

Niets. `/api/admin/periodes/sync` praat met `openholidaysapi.org`, zonder
sleutel.

## Wat er wijzigt

### Trainingen en wedstrijden blijven twee tabellen

Zoals vastgelegd in de architectuur: andere bron, andere synchronisatie, en een
training die per ongeluk als wedstrijd behandeld wordt is een fout die niemand
wil debuggen. `wedstrijden` staat er al in dit pakket, klaar voor de
VBL-synchronisatie in het volgende.

### Zalen zijn blokken, geen adressen

Een zaal heeft **blokken**: op dinsdag van 18u30 tot 20u, bijvoorbeeld. Door die
apart te bewaren, weet de app welke blokken nog vrij zijn —
`GET /api/admin/zalen/vrij?zaal=…` toont dat. Zonder die tabel zou een gesloten
zaal enkel een melding opleveren en verder niets.

Zalen en blokken beheert enkel wie het systeem beheert; een sluiting melden mag
ook wie een ploeg configureert (COORD), want die hoort het meestal het eerst.
Een sluiting komt **onafgehandeld** in het logboek: iemand moet nakijken of de
getroffen trainingen een alternatief nodig hebben.

### Trainingsreeksen: bewust niet voor de coach zelf

Een reeks aanmaken kan enkel wie het systeem beheert. Dat een coach geen blok
kan claimen is een bewuste keuze uit de architectuur: anders ontstaat er een
race tussen ploegen om de goede zaaluren. Een reeks buiten de grenzen van het
seizoen (1 augustus tot 30 juni) wordt geweigerd.

### De generator: wat er nooit overschreven wordt

`POST /api/admin/trainingsreeksen/genereren?reeks=…` schrijft een reeks uit naar
concrete trainingen. Standaard een droogloop.

**Een handmatig gewijzigde training blijft onaangeroerd**, herkenbaar aan
`handmatig_gewijzigd = 1`. Zonder die vlag zou het verplaatsen van één training
verdwijnen zodra de reeks opnieuw gegenereerd wordt — hetzelfde principe als de
bron-vlag bij personen.

**Een vakantie slaat een training over**, tenzij de reeks `vakantie_doorlopen`
heeft. Een examenperiode raakt enkel de bijpassende onderwijsgroep: secundair
voor U14 tot U19, hoger voor U21 en de senioren.

**Een gesloten zaal levert een training op met status `zaal_niet_beschikbaar`**,
niet een ontbrekende rij. De betrokkenen horen te weten dat er iets mis is, niet
dat er niets gepland stond.

### Schoolvakanties via OpenHolidays

`POST /api/admin/periodes/sync` haalt de vakanties van het seizoen op, eenmalig
en niet live bij het genereren — een externe dienst die wegvalt mag de agenda
van de club niet platleggen. Ook hier standaard een droogloop.

**Een periode met bron `club` blijft altijd staan.** De synchronisatie
overschrijft enkel rijen met bron `openholidays`; een eigen correctie (een
facultatieve dag, een andere naam) botst dus nooit met de volgende ophaling. Om
dezelfde reden is een opgehaalde periode niet met de hand te verwijderen — de
volgende synchronisatie zou ze gewoon terugzetten.

De subdivisiecode voor Vlaanderen staat voorlopig op `BE-VLG`, nog niet tegen
een echt antwoord bevestigd (backlog, punt U3).

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `schema.sql` | zes nieuwe tabellen |
| `src/lib/trainingsgenerator.js` | nieuw: de generator als zuivere functie |
| `src/lib/vakanties.js` | nieuw: OpenHolidays-client |
| `src/routes/admin/zalen.js` | nieuw |
| `src/routes/admin/trainingsreeksen.js` | nieuw |
| `src/routes/admin/periodes.js` | nieuw |
| `src/index.js` | veertien routes ingehaakt |
| `public/index.html` | secties voor zalen, periodes, trainingsreeksen |
| `public/js/schermen/trainingen.js` | nieuw |
| `public/js/schermen/ploegen.js` | opent de reeksen bij het tonen van een ploeg |
| `public/js/app.js` | knoppen ingehaakt |
| `test/trainingsgenerator.test.mjs`, `test/zalen-routes.test.mjs`, `test/trainingsreeksen-routes.test.mjs`, `test/vakanties.test.mjs` | nieuw |
| `test/frontend.test.mjs` | drie tests erbij |
| `src/versie.js` | 0.7.1 → 0.8.0 |

## Tests

290, allemaal groen. Drie fouten ingebouwd ter controle: `handmatig_gewijzigd`
negeren maakt 2 tests rood, een gesloten zaal stil negeren 2, en bron `club` bij
periodes overschrijfbaar maken 1.

## Daarna

Wedstrijden ophalen bij Basketbal Vlaanderen, met de wijzigingsdetectie en de
stille periodes uit de architectuur.
