# TeamAssist 0.39.1 — bugfix V44

## Wat en waarom

Als alle wedstrijden gedekt zijn, stuurt Basketbal Vlaanderen de woensdagmail
zonder link naar een Excel-bestand. De mail bevat dan enkel de tekst "0
wedstrijden met één of zonder officials — Alle wedstrijden zijn dit weekend
van officials voorzien." Dat gebeurde op 28 oktober 2026. Tot nu toe was zo'n
mail een fout, met drie gevolgen:

- de beheerders kregen een vals alarm;
- om 14 uur volgde 'nog niet binnen';
- om 20 uur volgde de terugval op de API, die wedstrijden in de lijst zette
  die de bond al gedekt had.

Wat er nu gebeurt (`src/officials/woensdaglijst.js`, `LEEG`):

- Een lijstmail zonder link, met een van beide zinnen (in tekst of HTML),
  wordt een lijst zonder rijen voor het komende weekend, met status
  'ontvangen'.
- Om 14 uur wordt die lijst verwerkt zoals elke andere:
  - er komt niets bij;
  - wat automatisch in de lijst kwam en niemand heeft, gaat eruit;
  - eigen thuiswedstrijden vanaf U14 en Regio krijgen 'twee volgens de bond'.
- Om 20 uur volgt dan geen terugval meer.
- Een mail zonder link en zonder die tekst blijft een fout. In dat geval
  veranderde de bond de vorm, en dat moet luid opvallen.

Dezelfde fix zit in YOAssist v1.17.1, voor de live app.

Ook mee in deze versie, al eerder op de werkbranch: het wedstrijd-id in de
items van het facturatievoorbeeld, en `afgesloten_door_naam` in de staat van
een maand. Allebei velden die erbij komen; er verdwijnt niets uit een
antwoord. Ze zijn een voorbereiding op 4c (Vergoedingen club).

## Databank

Geen schemawijziging. `schema-controle.sql` is opnieuw gegenereerd voor het
versienummer.

## Tests

969, allemaal groen. Nieuwe test in `test/woensdaglijst.test.mjs`: "V44:
alle wedstrijden gedekt — een mail zonder link is een lege lijst". Die test
dekt:
- de echte tekst en een HTML-variant;
- de verwerking om 14 uur, met Regio;
- geen terugval om 20 uur;
- een mail zonder link en zonder tekst, die een fout blijft.

De test is rood tegen de fout: met de herkenning uitgeschakeld faalt hij.
`test/woensdaglijst-hulp.mjs`: `bouwMail` kan nu een eigen tekst- en
HTML-inhoud meekrijgen.

## Docs

- README: *Gekende fouten* is leeg.
- BACKLOG: V44 is opgelost, met de 1.17.1-rij bij YOAssist.
- learnings: een nieuwe les over de lege lijst.
