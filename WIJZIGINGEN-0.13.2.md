# TeamAssist 0.13.2 — de ontbrekende schermen bij zalen en periodes

Vorige versie: 0.13.1

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer.

## Configuratie

Niets.

## Aanleiding

Gemeld: examenperiodes waren nergens te configureren, en er was geen sjabloon
voor zaaluren. Het tweede punt klopt en staat terecht nog open in de backlog
(punt Z) — dat is nooit gebouwd. Het eerste punt legde iets groters bloot: bij
een systematische vergelijking van elke backend-route tegen wat de frontend
werkelijk aanroept, bleken er **vijf routes te bestaan die nooit een knop of
formulier hadden gekregen**. De backend was af en getest sinds 0.8.0; de
frontend ernaartoe was het gewoon nooit.

## Wat er wijzigt

**Een periode handmatig toevoegen**, bij Dagelijks beheer → Schoolvakanties en
examens. Dit is de enige weg voor examenperiodes: die komen niet via
OpenHolidays binnen, en moesten altijd al met de hand ingevoerd worden — er was
alleen nooit een scherm voor. Naam, van, tot, soort (vakantie/examens) en
doelgroep (iedereen/secundair/hoger onderwijs).

**Een periode verwijderen**, enkel zichtbaar bij een handmatig aangemaakte
periode — een opgehaalde vakantie kan hier niet verwijderd worden, precies
zoals de route dat al afdwong.

**Een zaalblok verwijderen**, met een kruisje naast elk blok in de zalenlijst.

**Een zaalsluiting melden**: zaal, van, tot, een optionele reden. Dit bestond
als route sinds 0.8.0 (bewust ook toegankelijk voor COORD, niet enkel ADMIN)
maar had nog nooit een scherm.

**Onderweg gevonden en meteen rechtgezet:** het nieuwe sluitingsformulier
kreeg per ongeluk dezelfde `id="zaalkeuze"` als het bestaande blokformulier —
twee elementen met dezelfde id op één pagina, wat `getElementById` stil laat
mislukken. Rechtgezet met een aparte id, en een test toegevoegd die de hele
pagina op dubbele id's controleert.

## Wat bewust nog open blijft

`GET /api/admin/zalen/vrij` (welke blokken van een zaal nog niet aan een reeks
hangen) heeft nog geen scherm. Dat is een hulpmiddel, geen blokkerende functie
zoals de examenperiodes waren — wordt hier niet aan toegevoegd.

Het zalensjabloon (backlog punt Z) staat nog steeds als "nog uit te werken".

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `public/js/schermen/trainingen.js` | `maakPeriode`, periode verwijderen, blok verwijderen, `maakSluiting` |
| `public/index.html` | formulieren voor periode en sluiting, kolomkop erbij, dubbele id gecorrigeerd |
| `public/js/app.js` | drie knoppen ingehaakt |
| `test/frontend.test.mjs` | vijf tests erbij, waaronder een algemene controle op dubbele id's |
| `src/versie.js` | 0.13.1 → 0.13.2 |

## Tests

463, allemaal groen.
