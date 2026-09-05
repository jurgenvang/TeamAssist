# TeamAssist 0.6.0 — bekijken wat er binnengehaald is

Vorige versie: 0.5.3

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

Twee leesroutes en de bijhorende schermen. Tot nu toe konden spelers en staf
binnengehaald worden zonder dat er iets was om ze te bekijken; nakijken of de
synchronisatie deed wat ze moest, kon enkel in de D1-console.

**`GET /api/admin/team-leden?team=<guid>`** geeft de spelers en de staf van een
ploeg. In het scherm klik je op de naam van een ploeg in de lijst.

**`GET /api/admin/personen?zoek=…`** zoekt over voornaam, achternaam, de naam van
de bond, e-mailadres en lidnummer, met de ploegen erbij.

### Waar het rechtenmodel hier werk doet

**Wie de ploeg begeleidt, ziet de spelerslijst.** Het recht is
`team.spelers.bekijken` en het slaat op de ploeg uit de vraag zelf — zonder die
afleiding zou een coach van J16 ook G12 kunnen opvragen. Er staat een test op die
faalt zodra die afleiding wegvalt.

**Geboortedatum, e-mailadres en gsm-nummer blijven voor wie
`persoonsgegevens.bekijken` heeft**, vandaag enkel ADMIN. Dat is geen tweede
rechtencontrole op de route maar een filter op wat er teruggaat: het bepaalt niet
óf je binnen mag, maar hoeveel je te zien krijgt. Een coach krijgt de velden dus
niet leeg terug — ze staan er niet in.

**Zoeken vraagt minstens twee tekens.** Zonder die grens is het een knop die de
volledige ledenlijst teruggeeft, en dat is een uitnodiging om ze ergens anders te
laten belanden. Boven vijftig treffers volgt de vraag om te verfijnen.

**Een inactieve persoon is wel te vinden**, onderaan de lijst en met de
vermelding erbij. Een beheerder moet iemand die op verwijderen staat kunnen
terugvinden.

### Twee dingen die opvielen

De ledenlijst toont **de naam van de bond naast de gesplitste naam**. Zo zie je
in één oogopslag waar de splitsing op de eerste spatie misging — een dubbele
voornaam met een spatie. Dat is de plek waar je het rechtzet, en daarna houdt de
bron-vlag het zo.

De sortering gebeurt nu **hoofdletterongevoelig**. SQLite zette anders
`van Geijstelen` na `Muñiz`, en een Nederlandstalige ledenlijst staat vol
tussenvoegsels.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/routes/admin/bekijken.js` | nieuw: beide leesroutes |
| `src/index.js` | routes ingehaakt, met de ploeg uit de vraag als bereik |
| `public/index.html` | ledenlijst per ploeg en een zoekscherm |
| `test/bekijken.test.mjs` | nieuw, zestien tests |
| `src/versie.js` | 0.5.3 → 0.6.0 |
| `schema-controle.sql` | enkel het versienummer |

## Tests

199, allemaal groen. Drie fouten ingebouwd ter controle: geboortedata altijd
meesturen maakt 1 test rood, zoeken zonder minimumlengte 1, en het recht niet op
de gevraagde ploeg laten slaan 2.

## Daarna

Een persoon aanpassen — de plek waar de bron-vlag zich moet bewijzen.
