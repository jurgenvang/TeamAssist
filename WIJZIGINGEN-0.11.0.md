# TeamAssist 0.11.0 — de topbalk in de echte clubkleur

Vorige versie: 0.10.1

## Databank

Niets. De nieuwe instelling `clubkleur_topbalk` gebruikt de bestaande tabel
`instellingen`, geen nieuwe kolommen. `schema-controle.sql` wijzigt enkel door
het versienummer.

## Configuratie

Niets.

## Aanleiding

Het echte clublogo is gedeeld: fel oranje met zwarte tekst en belijning. Dat
oranje haalt het contrast niet als accentkleur — een knop met witte tekst op
dat oranje is te licht om leesbaar te zijn, en `keurAccentkleurGoed` zou het
terecht weigeren. Maar diezelfde kleur werkt uitstekend als achtergrond mét
zwarte tekst erop, en dat is precies waar een topbalk om vraagt.

Twee kleuren met twee verschillende leesbaarheidseisen dus, geen kunstmatige
versoepeling van de bestaande controle.

## Wat er wijzigt

**Een nieuwe instelling, `clubkleur_topbalk`**, los van `clubkleur_accent`. Ze
gebruikt een eigen goedkeuringsfunctie, `keurAchtergrondkleurGoed`, die zelf
bepaalt of zwarte of witte tekst beter leest op de gekozen kleur en het
contrast daartegen toetst — niet blind tegen wit, zoals bij de accentkleur.

**Wiskundig blijkt die functie bijna nooit een kleur te weigeren.** Met "de
beste van zwart of wit" als tekstkleur haalt zelfs de slechtst denkbare
grijswaarde (`#757575`, waar zwart en wit precies gelijk scoren) nog een
contrast van 4,608 — net boven de grens van 4,5. Er bestaat dus geen geldige
hexkleur die deze controle om reden van contrast kan laten falen. Dat is geen
gebrek maar een garantie, en staat als zodanig in de code gedocumenteerd, met
een test die het over alle 256 grijswaarden bevestigt.

**De topbalk in de app gebruikt nu twee CSS-variabelen**,
`--topbalk-achtergrond` en `--topbalk-tekst`, ingevuld door `huisstijl.js` op
basis van wat `/api/branding` teruggeeft. De tekstkleur wordt bewust niet in de
frontend herberekend: de backend bepaalt ze eenmalig, de frontend past enkel
toe.

**Het voorstelscherm bij Configuratie toont nu beide oordelen naast elkaar.**
Haal je het voorstel op bij de bond, dan zie je of de shirtkleur bruikbaar is
als accentkleur, als topbalkkleur, of beide — met een aparte knop per
toepassing.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/kleur.js` | `contrastTussen`, `kiesLeesbareTekstkleur`, `keurAchtergrondkleurGoed` erbij; bestaande functies ongewijzigd |
| `src/routes/admin/instellingen.js` | `clubkleur_topbalk`, met een per-veld gekozen contrastregel |
| `src/routes/admin/branding.js` | `shirt_kleur_bruikbaar_topbalk` in het voorstel; `kleur_topbalk` en `kleur_topbalk_tekst` in `/api/branding` |
| `public/js/huisstijl.js` | past de topbalkkleur en -tekst toe |
| `public/js/schermen/instellingen.js` | twee knoppen in plaats van één in het voorstelscherm |
| `public/stijl.css` | topbalk gebruikt de nieuwe CSS-variabelen, met een terugval naar het huidige uiterlijk |
| `test/kleur.test.mjs`, `test/branding.test.mjs`, `test/frontend.test.mjs` | nieuwe tests |
| `src/versie.js` | 0.10.1 → 0.11.0 |

## Tests

361, allemaal groen. Drie fouten ingebouwd ter controle: de topbalkkleur tegen
wit toetsen in plaats van tegen de leesbaarste tekstkleur maakt 5 tests rood,
de instelling altijd met de accentregel toetsen 2, en de tekstkleur in
`/api/branding` fout laten berekenen 1.
