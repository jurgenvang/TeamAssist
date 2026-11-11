# TeamAssist 0.43.0 — T21: één kaart, Mijn agenda, en elke lijst zoals in YOAssist

## Databank

Geen wijziging. Er is geen migratie nodig; de code mag meteen naar `main`.

## Wat en waarom

Beslist met Jurgen op 10 november 2026: overal waar TeamAssist wedstrijden
toont, gebeurt dat zoals in YOAssist. Dat geldt voor elke lijst, ook voor
schermen die er later bijkomen. Gebouwd als één pakket, zoals gevraagd.

Eerst heb ik elk scherm naast YOAssist gelegd, op telefoonbreedte. Beide apps
draaiden met hun echte handlers en met dezelfde wedstrijden.

- **De gedeelde kaart** (`public/js/kaart.js`) heeft dezelfde opbouw als in
  YOAssist:
  - het datumblok (dag, nummer, uur);
  - de ploegen, met thuis of uit;
  - de categorie;
  - de zaal, met een kaartlink;
  - het wedstrijdblad;
  - de uitslag, en een forfait als rood label;
  - een rand die de toestand zegt, met dezelfde kleuren als YOAssist:
    - geel: open of beschikbaar;
    - groen: het ligt vast, of je bent aanwezig;
    - rood: je bent niet beschikbaar of afwezig.

  Witte kaarten met een zachte schaduw. Sectiekoppen in hoofdletters met een
  lijn eronder. In donkere modus volgt alles de bestaande variabelen.
- **Mijn agenda** staat in Overzicht, in de plaats van de tabel *Mijn
  eerstvolgende trainingen*:
  - alles staat in één lijst per dag: trainingen en wedstrijden van de ploeg,
    fluiten (enkel wat aangeduid is) en taken bij een wedstrijd;
  - elk item heeft een label voor het type, elk in een eigen kleur;
  - een ouder ziet het hele gezin samen, met 'voor …' bij elk item. Twee
    kinderen in dezelfde ploeg hebben elk hun eigen opgave;
  - **bij een training of wedstrijd** geef je *Aanwezig* of *Afwezig* op. Bij
    afwezig volgen een reden en een toelichting. Een uitsluiting door de coach
    staat er zichtbaar bij. Een training die niet doorgaat, blijft staan met
    de reden;
  - **bij fluiten en een taak** kan je een probleem melden. Een taak kan
    enkel gemeld worden door wie ze zelf heeft, want de backend weigert dat
    namens een ander;
  - bovenaan staat per official van het gezin 'N wedstrijden te
    beantwoorden', met een link die Aanduidingen opent, meteen voor dat kind;
  - standaard staan deze en volgende maand erin; *Toon ook wat later komt*
    toont de rest;
  - **een botsing**, bijvoorbeeld spelen om 10 uur en fluiten om 11 uur,
    staat bij beide kaarten. Er wordt niets geweigerd: de club beslist. Het
    gebruikt dezelfde regel als bij aanduiden (`botst()` in
    `officials/regels.js`). Het geldt enkel waar er gefloten wordt of een
    taak is. Een taak bij een wedstrijd die je zelf speelt, botst niet;
  - wie speelt noch fluit noch een taak heeft (bijvoorbeeld enkel ADMIN),
    ziet geen agenda.
- **Nieuwe route `GET /api/mij/agenda`** (`src/routes/agenda.js`). Het
  venster, de volgorde, de botsing en de telling staan op één plaats.
  - Wie erin staat, komt uit het token en `ouder_kind`. De route heeft geen
    `namens`.
  - De telling 'te beantwoorden' gebruikt een gedeelde functie naast de
    lijst van een official (`aantalTeBeantwoorden` in `officials/routes.js`).
    Een test legt beide naast elkaar.
- **Het scherm van de coach (Ploegen)**:
  - de wedstrijden van een ploeg staan als kaarten, in *Komend* en
    *Gespeeld* (het laatst gespeelde bovenaan);
  - de trainingen staan ook als kaarten, met de zaal;
  - de aanwezigheid van één activiteit toont nu de activiteit zelf
    bovenaan. Tot nu toe stond er enkel *Aanwezigheid — wedstrijd*.
- **Aanduidingen**, **Cluboverzicht** en **Regio** zijn rechtgezet op wat
  verschilde met YOAssist:
  - REF1 en REF2 zijn gevulde balken: zwart voor een collega, groen voor
    jezelf, gestippeld voor wat nog gezocht wordt. De contactlinks staan
    rechts;
  - de keuzeknoppen zijn groot en staan naast elkaar;
  - een aangeduide wedstrijd heeft een groene rand en een *Aangeduid*-merk.
    Voorheen was dat blauw;
  - de sectie- en dagkoppen zijn zoals in YOAssist. *Aandacht nodig* staat
    in het rood;
  - het kruisje om vrij te geven is een gedempt teken in de balk. Het was een
    wit vakje (zie `learnings.md`);
  - Aanduidingen en Regio gebruiken de gedeelde kaart. Het Cluboverzicht houdt
    zijn eigen kaart, zoals in YOAssist, want daar staan per wedstrijd wie
    kan, wie niet en wie aangeduid is. Het neemt wel de koppen, dagen en stijl
    over.

## Vorm van een API-antwoord

- **Nieuw:** `GET /api/mij/agenda` geeft
  `{ tonen, gezin, grens, agenda: [...], te_beantwoorden: [...] }`.
- **Bijgekomen:** `GET /api/admin/wedstrijden` geeft per wedstrijd ook
  `ploeg_naam` en `naam_kort`.
- **Bijgekomen:** `GET /api/admin/trainingen` geeft ook `zaal`, `ploeg_naam`
  en `naam_kort`.
- Er is niets weggevallen. In `public/js/` en `test/` heb ik nagekeken of de
  oude velden nog gebruikt worden.
- `public/js/schermen/mijn-opgaven.js` is weg, want vervangen door
  `agenda.js`. De route `/api/aanwezigheid/mijn` blijft bestaan.

## Tests

1019 tests, allemaal groen.

Nieuwe testbestanden:
- `agenda.test.mjs` (10 tests);
- `kaart.test.mjs` (7 tests). Die bewaakt ook dat elke lijst met
  wedstrijden de kaart gebruikt en dat de oude tabellen weg zijn.

Uitgebreid:
- `wedstrijden-routes.test.mjs` en `trainingsreeksen-routes.test.mjs` voor de
  nieuwe velden;
- vier bestaande tests volgen de verhuizing van het ontsmetten naar de kaart.

Rood tegen de fout, telkens één keer gedraaid:
- een botsing ook tussen een training en een wedstrijd;
- een taak bij de eigen wedstrijd die toch als botsing telt;
- een vrijgegeven aanduiding die als fluiten telt;
- een kind dat met de rechten van zijn ouder telt (een YO die U14 te
  beantwoorden krijgt);
- een forfait dat als te beantwoorden telt;
- trainingen of wedstrijden van vóór vandaag. Deze test bleef eerst groen,
  want er was geen voorbije training in de testgegevens. Die is erbij
  gekomen, en daarna werd de test rood;
- een grens van één maand in plaats van twee;
- een agenda voor wie niets heeft;
- een kaart die de ploeg niet ontsmet;
- het label van het type altijd tonen;
- de ploegnaam die ontbreekt in de wedstrijden en in de trainingen van een
  ploeg.

## In de browser bekeken

In Chromium, tegen de echte handlers, op telefoonbreedte (390 px), naast
YOAssist met dezelfde wedstrijden. Ik heb doorgeklikt:
- Mijn agenda: aanwezig, dan afwezig met reden 'gekwetst'. Dat staat in de
  databank, en de rand werd telkens mee groen en daarna rood;
- 'naar Aanduidingen' voor een kind: het tabblad gaat open, met dat kind
  gekozen;
- Ploegen: een wedstrijd geopend, met de aanwezigheid en de kaart bovenaan;
- de agenda ook in donkere modus.

Er waren geen JavaScript-fouten en geen geweigerde oproepen.
