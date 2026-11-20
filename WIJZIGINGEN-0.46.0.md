# TeamAssist 0.46.0 — T7: Mijn club

## Eerst de databank, dan `main`

Deze versie heeft een nieuwe tabel nodig. Doe het in deze volgorde:

1. Voer `migratie-0.46.0.sql` uit in de D1-console. Het maakt één tabel
   (`mijnclub_ploegen`) met een index.
2. Voer daarna `schema-controle.sql` uit. Bovenaan hoort `ALLES OK` te
   staan.
3. Zeg dat het gedaan is. Pas dan gaat 0.46.0 naar `main`.

Gebeurt het in de omgekeerde volgorde, dan geven het tabblad Mijn club en de
ophaling bij de bond de fout `no such table: mijnclub_ploegen`.

Er is geen heropbouw nodig: het is een `CREATE TABLE`, en aan bestaande
tabellen verandert niets. Een tweede keer uitvoeren kan geen kwaad (`IF NOT
EXISTS`). Er hoeft niets ingevuld te worden: zonder rij geldt de standaard.

## Wat en waarom

Uitgeklaard met Jurgen op 20 november 2026, in acht vragen; de beslissingen
staan in de backlog bij T7.

- **Een tabblad Mijn club**, voor iedereen, meteen na Overzicht. Het staat
  standaard aan en is uit te zetten bij Mijn voorkeuren → Tabbladen, zoals
  de andere.
- **De wedstrijden van de gevolgde ploegen**, thuis en uit, van de zaterdag
  van het vorige weekend tot de zondag van het komende.
  - Tijdens een weekend telt dat weekend als het komende, en het weekend
    ervoor staat er nog in. Zo staan de uitslagen van gisteren er altijd
    bij.
  - Voorbeeld: vrijdag 20/11 → za 14/11 tot zo 22/11; maandag 23/11 → za
    21/11 tot zo 29/11.
  - Bij het uitklaren stonden er voorbeelddata met verkeerde weekdagen in de
    vraag. De regel zelf is wat gekozen werd.
- **Elke wedstrijd als de gedeelde kaart** (T21), per dag, met thuis of uit,
  de zaal, de uitslag en het wedstrijdblad. De statistieken komen er niet
  bij: daarvoor is nog geen adres gekend.
- **Welke ploegen.** Standaard je eigen ploegen: als speler, coach of ouder
  van een speler. Wie aan geen enkele ploeg hangt, ziet ze allemaal.
  Bewaar je een keuze, dan geldt die voor alle ploegen samen.
- **Kiezen kan op twee plaatsen, met dezelfde vinkjes**: de knop *Ploegen
  kiezen* bovenaan het tabblad, en *Mijn club* bij Mijn voorkeuren. Per
  ploeg zijn er twee vinkjes: *tonen* en *op de hoogte*.
- **Op de hoogte houden** staat standaard uit. Wie het aanzet, krijgt na
  elke ophaling bij de bond hoogstens één bericht, met alles wat er voor
  zijn ploegen veranderde:
  - een gewijzigde datum, uur of zaal;
  - een nieuwe uitslag.

  Een nieuwe wedstrijd, of enkel een andere tegenstander, geeft geen
  bericht. In de stille periodes (het begin van het seizoen, de tweede
  ronde) komt er ook niets, net als bij de begeleiding. Het bericht gaat via
  `verwittig()`, dus volgens het kanaal van je voorkeur. Lukt het
  verwittigen niet, dan blijft de ophaling geslaagd, met een regel in het
  logboek.
- **Een uitslag staat er voortaan netjes**: `62-58` in plaats van `62- 58`.
  - De bond geeft opvulspaties door, en TeamAssist bewaart de uitslag zo.
    Tot nu toe stond ze ook zo op elke kaart.
  - Ze wordt nu netjes gemaakt bij het tonen (op elke kaart) en in de
    berichten. De bewaarde gegevens veranderen niet. Anders zou de volgende
    ophaling elke gespeelde wedstrijd als 'nieuwe uitslag' melden aan wie
    een ploeg volgt.
  - Dezelfde uitslag in een andere vorm telt ook niet als nieuw.

**Backlog.** V43 is uitgeklaard. Beheerders zien een aanduiding van de bond
enkel als botsing bij het aanduiden, en de ophaling gebeurt eens per dag.

## Vorm van een API-antwoord

Nieuwe routes, alle drie zonder recht, want ze gaan over jezelf:
- `GET /api/mijnclub` geeft
  `{ van, tot, gekozen, ploegen: [...], wedstrijden: [...] }`;
- `GET /api/mijnclub/ploegen`;
- `POST /api/mijnclub/keuze` met
  `{ ploegen: [{ team_guid, tonen, op_de_hoogte }] }`.

Intern geeft `maakWedstrijdplan` bij `uitslag_bijgewerkt` ook `was` mee. Er
is niets weggevallen.

## Tests

1036 tests, allemaal groen.

Nieuw:
- **`mijnclub.test.mjs`** (13 tests):
  - het venster, ook tijdens een weekend en over de jaargrens;
  - de standaard en een gemaakte keuze;
  - de regels voor volgers;
  - het bundelen per persoon;
  - de routes;
  - een volledige ophaling met een echte mail aan de volger en niet aan de
    anderen, en geen tweede mail voor dezelfde uitslag in een andere vorm;
  - de nette uitslag;
  - de migratie: het schema van 0.45.0 plus het script geeft dezelfde tabel
    en index als nu, en een tweede keer kan.
- **`kaart.test.mjs`**: Mijn club gebruikt de kaart en dezelfde kiezer op
  beide plaatsen.

Aangepast: de tabbladtests (Mijn club na Overzicht) en de lijst van routes
zonder recht.

Rood tegen de fout, telkens één keer gedraaid:
- het venster een week te kort;
- de standaard altijd 'alle ploegen';
- een niet gevolgde ploeg toegelaten in de keuze;
- ook melden in een stille periode;
- dezelfde uitslag in een andere vorm als nieuw tellen;
- ook wie niet volgt een bericht sturen;
- het venster niet filteren;
- de migratie zonder de index.

## In de browser bekeken

In Chromium, tegen de echte handlers, op telefoonbreedte, als ouder en
coach:
- Mijn club staat na Overzicht.
- Standaard staan de twee eigen ploegen er.
- De uitslag staat als `45-40`.
- *Ploegen kiezen* opent de vinkjes. Na het bewaren zat de keuze in de
  databank, toonde de lijst enkel nog de gekozen ploeg, en stond bij Mijn
  voorkeuren dezelfde keuze.

Er waren geen JavaScript-fouten.
