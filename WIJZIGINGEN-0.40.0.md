# TeamAssist 0.40.0 — I1 fase 4c: Vergoedingen club

## Wat en waarom

Het scherm voor de vergoedingen van de officials, uit YOAssist. De backend
staat er al sinds 0.36.0. **Vergoedingen club** staat onder *Beheer* in het
naammenu, zoals in YOAssist: het is werk voor één keer per maand. Het is er
voor wie `officials.vergoedingen` heeft: YOADM, ADMIN en FINADM. De
penningmeester (FINADM) ziet daardoor enkel dit scherm onder Beheer.

- **Open maanden.** Per maand het aantal aanduidingen, met *Bekijken en
  afsluiten*. Pas vanaf de eerste dag van de volgende maand; daarvoor zegt
  het scherm waarom niet.
- **Het voorbeeld.** Per official de regels (aantal × categorie, bedrag,
  correcties op eerdere maanden) en de wedstrijden zelf, met forfait. Er
  staan waarschuwingen bij voor een categorie zonder tarief (dan kan je
  niet afsluiten) en voor een wedstrijd die niet meer bij de bond staat (die
  telt niet mee). Daarna *Afsluiten en versturen*, na bevestiging: elke
  official krijgt zijn overzicht, de ontvangers de verzamelstaat.
- **Weghalen = vrijgeven.** Het knopje *weg* bij een wedstrijd geeft de
  aanduiding vrij, zoals in het cluboverzicht. Daardoor kloppen het
  cluboverzicht, Mijn vergoeding en het logboek vanzelf mee. De knop staat
  er enkel bij werk in een open maand, niet bij een correctie (die is al
  uitbetaald), en enkel voor wie `officials.beheren` heeft. Een FINADM ziet
  hem dus niet; de backend weigert het hem ook. De wedstrijd is voorbij,
  dus de official krijgt geen bericht.
- **Afgesloten maanden.** Met *bekijk*: de bewaarde staat (wie afsloot, op
  welke dag, naar wie de verzamelstaat ging) en per official wat er toen
  meetelde.
- **Per official, dit seizoen.** Het totaal en per maand.
- **Tarieven.** Nieuw tegenover YOAssist, waar het enkel via de console
  kon. Een bedrag in euro (`15`, `17,50`), na bevestiging. Het geldt voor wat
  nog niet afgesloten is.
- **Wie krijgt de verzamelstaat.** Adressen, ook zonder account.

Ook: de regel voor één wedstrijd (`wedstrijdTekst`) staat nu in
`officials-hulp.js`, gedeeld met Mijn vergoeding, waar hij eerder apart
stond.

## Databank

Geen schemawijziging. `schema-controle.sql` is opnieuw gegenereerd voor het
versienummer.

## Tests

985, allemaal groen. Nieuw is `test/officials-vergoedingen.test.mjs` (8
tests). Die dekt:

- `naarCent` en `wedstrijdTekst`;
- de wedstrijd-id in het voorbeeld, en dat weghalen = vrijgeven, zonder
  bericht;
- de naam van wie afsloot, en dat een afgesloten maand niets heeft om weg
  te halen;
- het scherm als tekst: *weg* enkel met `officials.beheren` en enkel bij
  werk in een open maand, bevestiging vóór afsluiten en vóór een tarief,
  ontsmetting, verborgen tabblad.

`navigatie.test.mjs` is aangepast voor de nieuwe plaats onder Beheer, en
test nu ook FINADM.

Rood tegen de fout, telkens één keer gedraaid:

- `naarCent` die drie decimalen aanvaardt;
- *weg* zonder de rechtencontrole;
- de staat zonder naam van wie afsloot;
- het voorbeeld zonder wedstrijd-id.

In Chromium bekeken tegen de echte handlers op een testdatabank:

- als YOADM: een wedstrijd weggehaald, september afgesloten, de staat
  bekeken, het tarief van U12 op € 17,50 gezet (oktober rekent er meteen
  mee), het totaal per official;
- als FINADM: geen *weg*-knoppen en geen Cluboverzicht in de tabbalk;
- een naam met HTML wordt ontsmet getoond, en er waren geen fouten in de
  console.

## Vorm van een API-antwoord

Ongewijzigd. De velden `wedstrijdId` en `afgesloten_door_naam` kwamen er al
in 0.39.1 bij.
