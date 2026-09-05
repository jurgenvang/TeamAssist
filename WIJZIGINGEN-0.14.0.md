# TeamAssist 0.14.0 — twee nieuwe sjablonen: zaaluren en trainingsuren

Vorige versie: 0.13.2

## Databank

Niets. Beide sjablonen gebruiken de bestaande tabellen `zalen`, `zaal_blokken`
en `trainingsreeksen` — die droegen al een `seizoen`-kolom. `schema-controle.sql`
wijzigt enkel door het versienummer.

## Configuratie

Niets.

## Aanleiding

Backlogpunt Z (zaaluren via CSV) stond nog als "nog uit te werken". Een
aangeleverd rooster (PDF, zeven zalen) maakte meteen duidelijk dat er twee
losse dingen nodig zijn: welke blokken een zaal heeft (dat is Z), én welk team
op welk blok speelt — dat laatste bestond nergens, ook niet als los idee in de
backlog. Beide zijn nu gebouwd.

## Wat er wijzigt

### Zaaluren-sjabloon

Bij Configuratie → Zalen: **Sjabloon downloaden** en **Inlezen**. Kolommen:
`zaal, weekdag, begin, einde, seizoen`. Een onbekende zaalnaam wordt bij
uitvoeren als nieuwe zaal aangemaakt, zichtbaar gemeld in de droogloop. Een
blok dat niet meer in het bestand staat, blijft gewoon bestaan — nooit stil
verwijderd.

### Trainingsuren-sjabloon

Zelfde plek: **Sjabloon downloaden** en **Inlezen**, eronder. Kolommen:
`team_naam, zaal, weekdag, begin, einde, seizoen, van, tot` (`van`/`tot`
optioneel, vallen terug op de seizoensgrenzen).

**Kernregel, expliciet zo gevraagd: een onbekend team laat de import nooit
mislukken.** Een categorie die de bond nog niet synchroniseert (bijvoorbeeld
een recreatieve reeks) wordt gerapporteerd — in de droogloop én na uitvoeren —
en die ene rij wordt overgeslagen; de rest van het bestand gaat gewoon door.
Dat is bewust anders dan bij het personensjabloon, waar een onbekende id een
harde fout is: daar bestaat de persoon al en is een onbekende id een
vergissing, hier is 'het team bestaat nog niet' een verwachte, tijdelijke
toestand.

Meerdere teams op exact hetzelfde tijdslot in dezelfde zaal — parallelle
terreinen — geven gewoon aparte reeksen. De app kent geen 'terrein'-begrip
binnen een zaal; dat is voor nu geen probleem, met één bekende grens hieronder.

### Bekende grens: twee identieke teams op hetzelfde tijdslot

Staat hetzelfde team tweemaal op exact dezelfde zaal/weekdag/begin/einde (twee
terreinen, dezelfde groep), dan levert dat één reeks op, niet twee — de
matchsleutel is team + weekdag + begin + einde, zonder een manier om twee
terreinen van elkaar te onderscheiden. Kwam voor in het aangeleverde rooster
bij BB4FUN. Geen technisch probleem vandaag omdat die teams sowieso nog niet
bestaan; wordt relevant zodra ze wel bestaan en dit patroon zich herhaalt.

## De twee CSV's uit het aangeleverde rooster

Zeven zalen, 43 unieke blokken, 77 team-tijdslot-combinaties. Beide bestanden
zijn getoetst tegen de echte planfuncties hierboven — niet enkel gegenereerd,
maar echt door `maakZaalsjabloonplan` en `maakReeksensjabloonplan` gehaald.

**Vijf categorieën staan er bewust in met hun naam uit het rooster, ook al
bestaan ze nog niet als team in de app:** `HSE R`, `BB4FUN +14`, `BB4FUN -14`,
`U07 A`, `U07 B`. Bij het inlezen worden die als 'onbekend team' gerapporteerd
en overgeslagen — precies het gevraagde gedrag. Zodra die teams elders zijn
aangemaakt (of de bond ze gaat synchroniseren), leest hetzelfde bestand ze dan
gewoon mee in.

**Twee punten met het oog afgelezen uit de scan, te bevestigen in de
droogloop:** de tijdsgrens bij HHH op woensdag (rond 18:30–19:15), en de
dubbele bezetting van BB4FUN op twee terreinen tegelijk (UCLL donderdag,
Redingenhof woensdag) die door de grens hierboven als één rij eindigt.

'Fenics' (Sportoase Heverlee, donderdag) is bewust weggelaten — een andere
vereniging, geen eigen team.

**Aanbevolen volgorde bij het inlezen:** eerst het zaaluren-sjabloon
uitvoeren, dan het trainingsuren-sjabloon — dat laatste heeft de zalen nodig
om te matchen.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/zaalsjabloonplan.js` | nieuw |
| `src/lib/reeksensjabloonplan.js` | nieuw |
| `src/routes/admin/zaalsjabloon.js` | nieuw |
| `src/routes/admin/reeksensjabloon.js` | nieuw |
| `src/index.js` | vier routes ingehaakt |
| `public/js/schermen/trainingen.js` | download/upload voor beide sjablonen |
| `public/index.html` | secties bij Configuratie → Zalen |
| `public/js/app.js` | vier knoppen ingehaakt |
| `test/zaalsjabloonplan.test.mjs`, `test/reeksensjabloonplan.test.mjs`, `test/zaalsjabloon-routes.test.mjs`, `test/reeksensjabloon-routes.test.mjs` | nieuw |
| `test/frontend.test.mjs` | vier tests erbij, één bestaande test verstevigd |
| `src/versie.js` | 0.13.2 → 0.14.0 |

## Tests

501, allemaal groen. Vier fouten ingebouwd ter controle: onbekende teams
stilzwijgend toch matchen (4 rood), verdwenen reeksen niet signaleren (1
rood), en bij het zaaluren-sjabloon dezelfde twee soorten fouten apart getest.

## Daarna

De vijf onbekende categorieën uitzoeken en als team aanmaken (jouw actiepunt).
Backlogpunt Z is hiermee afgewerkt en kan als afgesloten gemarkeerd worden.
