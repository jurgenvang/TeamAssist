# TeamAssist 0.40.1 — het naammenu opent panelen, zoals in YOAssist

## Wat en waarom

Gemeld door Jurgen: de items in het naammenu werkten niet goed, en zeker
niet zoals in YOAssist. Ze leken geen aparte pagina te openen.

In de browser nagekeken (390 px breed, op het Cluboverzicht):

- *Mijn voorkeuren* verscheen als sectie **onderaan** het Cluboverzicht,
  buiten beeld.
- *Mijn berichten* kwam er daarna ook nog bij, en *Mijn voorkeuren* bleef
  gewoon openstaan.
- *Configuratie* (onder Beheer) wisselde wel van tabblad, maar de twee
  persoonlijke schermen bleven eronder hangen.

In YOAssist opent elk item van het naammenu een paneel over de pagina heen.

Nu werkt het zo:

- **Elk scherm uit het naammenu is een paneel.** Het gaat om Mijn
  berichten, Mijn vergoeding, Mijn voorkeuren en Kijken als …, en onder
  Beheer om Vergoedingen club, Dagelijks beheer, Configuratie en
  Zaalbeheer. Het paneel schuift van rechts over de pagina. Op een
  telefoon is het schermvullend; op een groot scherm is het 32 rem breed,
  of 52 rem voor de beheerschermen met tabellen.
- **Altijd hoogstens één paneel tegelijk.** Een tweede openen sluit het
  eerste.
- **Sluiten** kan met de × in de kop, met de bestaande knop *Sluiten*, met
  Escape, of met een tik op de grijze achtergrond ernaast.
- **Het tabblad eronder blijft staan** waar het stond. Wie terugkomt, zit
  waar hij was.
- De pagina eronder scrollt niet mee zolang een paneel openstaat.

Hoe het gebouwd is:

- `public/js/paneel.js` is nieuw (`openPaneel`, `sluitPaneel`).
- De laadfunctie van de schermen (`laadScherm` in `app.js`) is één functie
  voor de tabbalk en de panelen.
- De tabbalk (`navigatie.js`) toont of verbergt enkel nog de echte
  tabbladen.

## Databank

Geen schemawijziging.

## Tests

989, allemaal groen. Nieuw is `test/paneel.test.mjs` (4 tests). Die dekt:

- elk scherm uit het menu is een paneel, met een titel en een ×, en staat
  standaard dicht;
- geen enkel scherm zet zich nog rechtstreeks open met `.hidden`;
- de tabbalk raakt de panelen niet;
- het gedrag met een nagemaakte DOM: één paneel tegelijk, Escape, de
  achtergrond, twee keer sluiten.

In `frontend.test.mjs` zijn drie tests aangepast aan de nieuwe kop van de
beheerschermen en aan `laadScherm`.

Rood tegen de fout, telkens één keer gedraaid:

- `openPaneel` zonder het vorige te sluiten;
- Mijn voorkeuren terug met `.hidden = false`.

Bekeken in Chromium, op 390 en op 1280 px breed: Mijn voorkeuren, Mijn
berichten en Configuratie, telkens vanuit het Cluboverzicht en met Escape
ertussen.

Niet aangepast: het persoonsscherm (vanuit Personen) en het
aanwezigheidsscherm (vanuit Ploegen). Die komen niet uit het menu en
staan nog in de pagina.
