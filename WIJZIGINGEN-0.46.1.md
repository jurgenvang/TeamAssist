# TeamAssist 0.46.1 — nazicht van 0.46.0

Geen schemawijziging: er hoeft niets in de databank te gebeuren. Deze versie
staat op `main`.

## Hoe er nagekeken is

Elk tabblad en elk paneel is in Chromium geopend, tegen de echte routes op
een testdatabank:
- voor acht soorten gebruikers: beheerder, official (YO+), speler die ook
  fluit, ouder, coach zonder beheerrechten, YOADM, FINADM en iemand zonder
  rol;
- op telefoonbreedte (390) en op laptopbreedte (1280);
- in lichte en in donkere modus.

Het script zit nu in de repo: `tools/nazicht.mjs` (zie README). Het meldt
JavaScript-fouten, antwoorden met status 400 of hoger en alles wat buiten het
scherm valt. Er waren geen JavaScript-fouten.

## Fouten in de werking

- **Ploegen was leeg voor een coach die geen beheerder is.** Dat gold ook
  voor een coördinator en een ploegverantwoordelijke.
  - Oorzaak: het tabblad haalde zijn lijst bij `/api/admin/teams`, en die
    route vraagt `systeem.beheren`. Het antwoord was een 403, de lijst bleef
    leeg, en daarmee waren spelers, wedstrijden, selectie, aanwezigheid en
    taken onbereikbaar. Dat is zo sinds 0.7; elke controle in de browser
    gebeurde tot nu toe als beheerder.
  - Nu: een nieuwe route `GET /api/ploegen` geeft de ploegen die iemand
    begeleidt. Wie er één heeft, ziet ze meteen open.
  - Wat enkel een beheerder kan, staat er voor een coach niet meer: ploegen
    volgen, reeksen aanmaken of stoppen, ophalen bij de bond, het sjabloon.
    Een naam in de spelerslijst is voor hem gewone tekst.
  - In de lijst is te zien welke ploeg openstaat.
- **Een speler of ouder krijgt het tabblad Ploegen niet meer.** Het was voor
  hen altijd leeg: geen enkele route erachter geeft hun iets. Of er een
  ploegscherm voor hen komt, staat als vraag in de backlog (T23).
- **Bij een uitwedstrijd staat de thuisploeg nu vooraan.** De uitslag van de
  bond is altijd thuis–uit. Tot nu toe stond de eigen ploeg vooraan, en las
  `U14 A – Lier 38-61` als een nederlaag terwijl de ploeg won. Nu staat er
  `Lier – U14 A 38-61`, met het label *uit*. Dat geldt op elke kaart (Mijn
  agenda, Mijn club, Ploegen) en in het bericht aan wie een ploeg volgt.
- **Het cluboverzicht toonde de ruwe uitslag** (`45- 40`). Nu `45-40`, zoals
  elders sinds 0.46.0.
- **Mijn club ververste niet** na het bewaren van de keuze bij Mijn
  voorkeuren: het tabblad eronder toonde nog de oude ploegen.
- **Mijn club zei 'je eigen ploegen'** bij wie aan geen ploeg hangt en ze
  dus allemaal ziet.
- **Escape sloot het naammenu niet**, wel een paneel. Nu beide.

## Visuele fouten

Op een telefoon:
- De tabel met de **taken bij een wedstrijd** stak buiten beeld: een
  keuzelijst is zo breed als haar langste naam. De hele pagina schoof
  daardoor opzij.
- Bij **Configuratie → Instellingen** vielen de velden rechts weg.
- In de **aanwezigheidslijst** brak een naam af over vier regels. Daar staat
  de naam nu op een eigen regel, met opgave, vaststelling en *Uitsluiten*
  eronder.
- Een **lange naam** in de kopbalk duwde de clubnaam in drie regels.

Overal:
- **Keuzelijsten** zagen eruit als kale browservelden naast de opgemaakte
  tekstvelden, en rekten in sommige formulieren uit tot de volle hoogte van
  de rij (Zaalbeheer). Ze hebben nu dezelfde vorm als de velden ernaast.
- De link **wedstrijdblad** in het cluboverzicht was browserblauw.

In donkere modus:
- Groen, rood en amber stonden als tekst op een donker vlak en waren
  nauwelijks te lezen: de gekozen knop *Beschikbaar* of *Niet beschikbaar*,
  het label *forfait*, het cijfer in 'nog te beantwoorden', de labels van
  het type in Mijn agenda. Tekst in een signaalkleur heeft nu een eigen,
  lichtere kleur in donkere modus.
- De link naar het wedstrijdblad in het cluboverzicht was er onleesbaar.

Klein: '1 spelers' is '1 speler'; de datum bij *voorbije wedstrijden* staat
als 'do 1 oktober'; de tekst voor wie nog geen rol heeft, brak midden in de
zin af en klopt nu met wat hij ziet.

## Niet aangepast: vraagt een beslissing

Dit staat in de backlog als T23:
- een ploegscherm voor spelers en ouders (wedstrijden en namen van de
  ploeggenoten), of volstaan Mijn agenda en Mijn club;
- de ploeg van een coach in Mijn agenda: wie niet speelt of fluit, ziet nu
  geen agenda;
- de tabel *Rechten* op het Overzicht, die iedereen de technische namen van
  zijn rechten toont.

Klein, voor een volgend pakket: de datum bij *Gemelde problemen* en bij de
woensdaglijsten staat als `2026-11-21`; met zeven tabbladen past *Personen*
op een laptop net niet meer in de rij (ze schuift wel).

## Vorm van een API-antwoord

- Nieuw: `GET /api/ploegen` geeft
  `{ seizoen, mag: { beheren, personen }, teams: [...] }`. Geen recht op de
  route: ze geeft enkel de ploegen waarvoor iemand `team.spelers.bekijken`
  heeft.
- `/api/admin/teams` blijft bestaan, voor de schermen van de beheerder.
- Er is niets weggevallen. In `public/js/` en `test/` is gezocht naar
  `/api/admin/teams`: enkel het tabblad Ploegen is overgezet.

## Tests

1040 tests, allemaal groen.

Nieuw of aangepast, en telkens één keer rood gedraaid tegen de fout:
- `teams-routes.test.mjs`: een coach krijgt zijn ploeg, een
  ploegverantwoordelijke de zijne, een speler of ouder geen enkele, een
  beheerder alle. Rood met `team.bekijken` als filter.
- `teams-routes.test.mjs`: het scherm gebruikt `/api/ploegen` en verbergt de
  beheerknoppen. Rood met de oude route.
- `navigatie.test.mjs`: een speler of ouder krijgt het tabblad niet, een
  ploegverantwoordelijke wel. Rood met het oude recht.
- `kaart.test.mjs`: bij een uitwedstrijd de thuisploeg vooraan. Rood met de
  oude volgorde.
- `mijnclub.test.mjs`: het bericht over de uitslag van een uitwedstrijd.
  Rood met de eigen ploeg vooraan.
- `kaart.test.mjs`: de nette uitslag in het cluboverzicht, de keuzelijst
  nooit breder dan haar vak, de tekstkleuren in donkere modus, Escape. Rood
  met de ruwe uitslag, en rood zonder de maximale breedte.
- `kaart.test.mjs`: bewaren bij Mijn voorkeuren ververst Mijn club. Rood
  zonder.

## In de browser bekeken

Na de herstellingen opnieuw, als beheerder, coach, ouder en zonder rol, op
telefoonbreedte, licht en donker, en als beheerder op laptopbreedte:
- geen JavaScript-fouten en geen antwoorden met een fout;
- niets valt nog buiten het scherm;
- de coach ziet zijn ploeg met wedstrijden, trainingen, aanwezigheid en
  taken, zonder de knoppen van de beheerder.
