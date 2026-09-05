# TeamAssist 0.12.0 — het personensjabloon

Vorige versie: 0.11.1. Rondt fase 2 af.

## Databank

Niets. Geen nieuwe tabellen, geen nieuwe kolommen — alles wat het sjabloon
nodig heeft (e-mail, telefoon, adres, `ouder_kind`) stond er al.
`schema-controle.sql` wijzigt enkel door het versienummer.

## Configuratie

Niets.

## Wat er wijzigt

Bij Ploegen → een ploeg openen staat nu een sjabloonpaneel: **Sjabloon
downloaden** en **Inlezen**. Dit is het laatste stuk van fase 2 — zonder
e-mailadressen kon tot nu toe niemand behalve de eerste beheerder zich
aanmelden.

### Het sjabloon is vooraf ingevuld

`GET /api/admin/sjabloon?team=…` geeft een CSV met één rij per speler van die
ploeg, met wat de bond al levert — lidnummer, naam, geboortedatum — er al in.
Een beheerder vult enkel de ontbrekende kolommen aan: e-mailadres van de
speler, e-mailadres van de ouder (meerdere gescheiden door een puntkomma),
telefoon, adres.

### Wat het sjabloon nooit doet

**Geen nieuwe spelers aanmaken.** Een rij met een onbekende of ontbrekende id
wordt als fout gemeld, niet als aanleiding om te gokken wie ermee bedoeld is —
anders dan bij de VBL-synchronisatie is er hier geen tweede bron die de
matching kan bevestigen.

**Een ouderkoppeling die uit het bestand verdwijnt, wordt nooit stil
verwijderd.** Ze komt als signaal in de droogloop en in het logboek te staan;
ontkoppelen blijft een bewuste handeling op het persoonsscherm. Bij een CSV is
er, anders dan bij VBL of OpenHolidays, geen bron die zichzelf corrigeert — een
weggehaalde rij betekent hier gewoon dat iemand een rij weghaalde, niet dat er
iets veranderd is bij de bond.

**Altijd een droogloop eerst**, met de rijfouten en de overgeslagen
koppelingen zichtbaar in de samenvatting vóór er iets uitgevoerd wordt.

### Hergebruik in plaats van een tweede implementatie

De bron-vlag-logica die een naam- of geboortedatumcorrectie op `club` zet, stond
tot nu toe enkel in het detailscherm van een persoon. Die logica is verplaatst
naar `src/lib/persoonwijzigen.js`, en het sjabloon gebruikt exact diezelfde
functie. Twee kopieën van deze logica zouden vroeg of laat uiteenlopen; deze
refactor is getoetst door de volledige bestaande testreeks voor het
persoonsscherm ongewijzigd te laten slagen na de herbouw.

### CSV, correct gelezen en geschreven

`src/lib/csv.js` is een eigen, kleine RFC4180-implementatie — geen
`split(',')`, wat zou breken bij een adres met een komma erin. Aanhalingstekens,
regeleindes binnen een veld, en de BOM die Excel toevoegt worden correct
afgehandeld.

### Downloaden en uploaden achter een beveiligde route

`GET /api/admin/sjabloon` vraagt een token, dus een gewone downloadlink werkt
niet. De knop haalt de CSV op via `apiRuw()` (nieuw in `api.js`, naast de
bestaande JSON-functie) en biedt ze lokaal aan als bestand.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/csv.js` | nieuw |
| `src/lib/persoonwijzigen.js` | nieuw: de bron-vlag-logica, uit `persoon.js` getrokken |
| `src/lib/sjabloonplan.js` | nieuw: de zuivere planfunctie |
| `src/routes/admin/sjabloon.js` | nieuw: export en import |
| `src/routes/admin/persoon.js` | herbouwd op `persoonwijzigen.js`, gedrag ongewijzigd |
| `src/index.js` | twee routes ingehaakt |
| `public/js/api.js` | `apiRuw()` erbij |
| `public/js/schermen/ploegen.js` | download- en uploadfuncties |
| `public/index.html` | sjabloonpaneel bij een geopende ploeg |
| `public/stijl.css` | `h3`, `white-space: pre-line` op meldingen |
| `test/csv.test.mjs`, `test/sjabloonplan.test.mjs`, `test/sjabloon-routes.test.mjs` | nieuw |
| `test/frontend.test.mjs` | vier tests erbij |
| `src/versie.js` | 0.11.1 → 0.12.0 |

## Tests

403, allemaal groen. Drie fouten ingebouwd ter controle: een onbekende id toch
verwerken maakte 2 tests rood, verdwenen ouderkoppelingen stil negeren 2, en de
rechtencontrole weglaten 2.

## Daarna

Fase 2 is hiermee af. Volgende stap: fase 4, aanwezigheden — de hoofdfunctie
van de app.
