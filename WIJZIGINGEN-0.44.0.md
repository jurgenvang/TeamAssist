# TeamAssist 0.44.0 — T18 en T19: twee kleine gaten uit de code-audit

## Databank

Geen wijziging. Er is geen migratie nodig.

De instelling `clublogo_bron` kan als rij in `instellingen` blijven staan.
Ze wordt nergens meer gelezen of getoond, en weghalen hoeft niet.

## Wat en waarom

Beide punten zijn beslist met Jurgen op 10 november 2026.

**T18: vrije zaaluren in de blokjes zelf.**
- Bij Zaalbeheer → Zalen zegt elk blokje nu of er een ploeg op traint:
  - een vrij blok staat gestippeld in het geel, met *vrij* erbij;
  - een bezet blok toont de ploeg of ploegen die erop trainen.
- Er is geen tweede lijst naast de blokjes gekomen. `GET /api/admin/zalen`
  geeft per blok `bezet` en `ploegen` mee.
- **Bezet** betekent: een actieve trainingsreeks in dezelfde zaal, op
  dezelfde weekdag, die het blok overlapt. Tot nu toe telde een blok enkel
  als bezet bij exact hetzelfde uur. Maar binnen zijn blok mag een coach het
  uur verfijnen (punt U2): een training van 18u30 tot 19u45 in een blok van
  18 tot 20 uur gebruikt dat blok. `/api/admin/zalen/vrij` noemde zo'n blok
  dus ten onrechte vrij.
- Er is nu één regel voor allebei: `ploegenOpBlok` in `zalen.js`. Een reeks
  die net aansluit (20 tot 21 uur na een blok van 18 tot 20 uur) raakt het
  blok niet.

**T19: `clublogo_bron` geschrapt.**
- Deze instelling werd geschreven, maar nergens gelezen. Een veld zonder
  effect verwart.
- Ze is weg uit `INSTELBAAR`, en daarmee uit het scherm. *Dit logo gebruiken*
  bij het voorstel van de bond zet ze ook niet meer.
- Komt er ooit een eigen logo-upload, dan komt de keuze terug met die
  functie.

**Backlog.** T22 is erbij: de tabbalk op een telefoon zoals in YOAssist. Dat
punt is nog uit te klaren: wat met zes tabbladen op één rij, welke volgorde,
en wat op een breed scherm.

## Vorm van een API-antwoord

`GET /api/admin/zalen` geeft per blok ook `bezet` (true of false) en
`ploegen` (een lijst met korte ploegnamen). Er is niets weggevallen.

## Tests

1021 tests, allemaal groen.

Nieuw in `zalen-routes.test.mjs`, één test voor alle gevallen samen:
- binnen het blok verfijnd: het blok is bezet;
- twee ploegen in één blok;
- een andere zaal;
- een gestopte reeks;
- een reeks die net aansluit;
- en `/zalen/vrij` geeft hetzelfde antwoord.

Er is ook een test op het scherm. `branding.test.mjs` controleert nu dat
`clublogo_bron` weg is, zowel uit de backend als uit het scherm.

Rood tegen de fout, telkens één keer gedraaid:
- weer enkel een exact hetzelfde uur als bezet tellen;
- een reeks die het blok enkel raakt als bezet tellen;
- een andere zaal laten meetellen;
- een gestopte reeks laten meetellen;
- `clublogo_bron` terugzetten in `INSTELBAAR`.

## In de browser bekeken

In Chromium, tegen de echte handlers, op telefoonbreedte:
- **Zaalbeheer:** het blok van dinsdag 18–20 uur, met een training van 18u30
  tot 19u45, staat als bezet met *U12 A*. De andere twee blokken staan geel
  als *vrij*.
- **Configuratie:** geen spoor meer van `clublogo_bron`, ook al staat de rij
  nog in de databank.

Er waren geen JavaScript-fouten.
