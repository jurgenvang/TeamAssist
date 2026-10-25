# TeamAssist 0.27.0 — I1 fase 1a: de kopbalk en de menu's van YOAssist

Vorige versie: 0.26.0

Eerste pakket van de integratie met YOAssist (backlog I1). Fase 1 is in drie
pakketten gesplitst: dit is de schil; 0.28.0 brengt Mijn berichten,
mededelingen en het meldingenbolletje, 0.29.0 push.

## Databank

Niets. Geen schemawijziging.

## Configuratie

Niets.

## Wat er wijzigt

**De kopbalk is die van YOAssist.** Een donkere strook over de volle breedte,
die bovenaan blijft staan bij het scrollen: *TeamAssist* met de club eronder
links, je naam met je rol(len) eronder rechts. Je naam is de knop naar het
naammenu, met een pijltje dat zegt dat er iets openklapt. Een beheerder ziet
zijn rol in amber.

**Een ingestelde topbalkkleur wint.** Stelde de club bij Configuratie een
topbalkkleur in, dan vervangt die het donker, met de tekstkleur die de backend
er al bij berekent. Het amber accent in de appnaam neemt dan die tekstkleur
over: amber is op een willekeurige clubkleur niet gegarandeerd leesbaar. Het
logo staat links naast de appnaam.

**Beheer staat enkel nog in het naammenu.** Dagelijks beheer, Configuratie en
Zaalbeheer zijn uit de tabbalk weg en staan bovenaan het naammenu onder
*Beheer*; daaronder, na een scheiding, het persoonlijke deel. De tabbalk houdt
Overzicht, Ploegen en Personen. Welke knoppen onder Beheer staan, volgt uit
dezelfde rechten als de tabbalk (`menuTabbladen()` in `navigatie.js`) — geen
aparte lijst in `app.js`. Omdat er geen tabblad meer oplicht, heeft elk van de
drie schermen bovenaan een titel.

**Kijken als … staat in het naammenu**, onder Beheer, en opent een eigen
paneel met dezelfde keuze als vroeger bij Configuratie. De testbalk bovenaan
met 'Terug naar mijn eigen rollen' blijft de weg terug. De instelling
`testrol_toegelaten` blijft bij Configuratie.

## Onderweg gevonden

**De testrol werd ook aangeboden als ze niet werkte.** De keuze stond bij
Configuratie altijd klaar, ook als `testrol_toegelaten` uit stond. De backend
negeerde de kop dan stil, maar de testbalk beweerde wel 'je kijkt als COACH'.
`/api/mij` geeft nu `testrol_mogelijk` mee, en enkel dan staat *Kijken als …*
in het menu. Tijdens een lopende testrol is die vlag false: de rechten zijn
dan al versmald, en de testbalk is de weg terug.

**Een test was een tijdbom.** `trainingenTonen toont de geplande trainingen`
gebruikte de vaste reeks van september 2026 uit `maakReeks()`, terwijl de route
enkel trainingen toont die niet ouder zijn dan een week. Sinds oktober faalde
hij altijd, zonder dat er iets aan de code veranderde — dezelfde valkuil die
YOAssist in oktober 2026 trof. De datums zijn nu relatief tegenover vandaag.
Ook de 0.26.0-zip had deze ene rode test (732 van 733).

## Niet in dit pakket

- **Tabbladen per stuk uitzetten** (YOAssist's `verborgen_tabs`). Met drie
  tabbladen heeft dat nog geen zin; het komt wanneer Aanduidingen,
  Cluboverzicht, Logboek en Regio erbij komen.
- **Het meldingenbolletje op de naam**: 0.28.0, samen met Mijn berichten.
- Handleiding, Rondleiding, Documenten en *Over* in het naammenu: die komen
  mee met de schermen van de module Officials.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `public/index.html` | nieuwe kopbalk buiten `<main>`; naammenu met Beheer bovenaan; paneel *Kijken als …*; titels boven de drie beheerschermen |
| `public/stijl.css` | de donkere YOAssist-strook, sticky; `body`/`main`-marges aangepast |
| `public/js/navigatie.js` | `inMenu` per scherm, `tabbalkTabbladen()` en `menuTabbladen()` |
| `public/js/app.js` | Beheer-menu uit de rechten, testrol uit het menu |
| `public/js/huisstijl.js` | `--merk-accent` volgt de tekstkleur van een clubkleur |
| `src/routes/mij.js` | `testrol_mogelijk` in het antwoord |
| `test/mij.test.mjs` | nieuw: 5 tests |
| `test/navigatie.test.mjs` | 3 tests erbij |
| `test/frontend.test.mjs` | kopbalk- en menutests herschreven, 6 erbij |
| `test/trainingsreeksen-routes.test.mjs` | datums relatief tegenover vandaag |
| `src/versie.js` | 0.26.0 → 0.27.0 |
| `schema-controle.sql` | enkel het versienummer in de kop, opnieuw gegenereerd |
| `.claude/BACKLOG.md` | 0.27.0 afgewerkt, fase 1 opgedeeld in 1a/1b/1c |

## Tests

746, allemaal groen. Ter controle telkens een fout ingebouwd: de beheerschermen
terug in de tabbalk (2 rood), *Kijken als …* altijd tonen (1 rood), de strook
niet meer sticky (1 rood), en `testrol_mogelijk` gelijkstellen aan 'is
beheerder' zonder naar de instelling te kijken (2 rood).

Bekeken in Chromium op 1000 en 390 pixels breed: donkere strook, met
clubkleur, het menu voor een beheerder en voor een coach.

## API-vorm

`/api/mij` krijgt één veld erbij (`testrol_mogelijk`); niets hernoemd of weg.
