# TeamAssist 0.16.0 — Zaalbeheer als apart tabblad, samenvouwbare secties (T9, T10)

Vorige versie: 0.15.0

## Databank

Niets. Zuiver een herschikking van de frontend.

## Configuratie

Niets.

## Wat er wijzigt

### T9 — een apart tabblad Zaalbeheer

Alles wat met een zaal te maken had, stond verspreid: zalen zelf en de twee
sjablonen bij Configuratie, vakanties/examens/feestdagen bij Dagelijks
beheer — terwijl dat laatste rechtstreeks stuurt wat een zaal-gebonden
trainingsreeks genereert. Nu samen onder een nieuw tabblad **Zaalbeheer**:
zalen, blokken, sluitingen, `open_op_feestdagen`, het zaaluren-sjabloon, het
trainingsuren-sjabloon, en de periodes (met hun sync-knoppen en het
handmatige toevoegformulier).

**Configuratie** houdt over: huisstijl, instellingen, de testrol — wat zelden
wijzigt. **Dagelijks beheer** houdt over: enkel nog de VBL-diagnose — wat je
vaak even wil checken.

Het trainingsuren-sjabloon bleef bewust in Zaalbeheer staan, niet verplaatst
naar Ploegen — de backlog had dit als open vraag genoteerd (het koppelt een
team aan een zaal, hoort dus evenzeer bij beide); voor nu geen aanleiding om
van de bestaande plek af te wijken.

### T10 — samenvouwbaar met een pijltje

Elke sectie in Configuratie en Zaalbeheer staat nu in een `<details>`/
`<summary>`-element — een natieve HTML-oplossing, geen eigen JavaScript
nodig, met de gevraagde pijltje-interactie gratis mee (de browser tekent die
zelf). Instellingen en Zalen (de kern van hun tabblad) staan standaard open;
de rest (huisstijl, de testrol, de sluitingsmelding, beide sjablonen, het
handmatige periodeformulier) staat standaard dicht.

Niet toegepast op de per-ploeg-panelen bij Ploegen (reeksen, wedstrijden,
aanwezigheid) — die worden al dynamisch getoond of verborgen via JavaScript,
en dat door elkaar laten lopen met `<details>` se eigen open/dicht-status zou
een aparte, foutgevoelige synchronisatie tussen twee mechanismen vragen.
Blijft een aandachtspunt voor een volgende ronde als dat ooit gewenst is.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `public/index.html` | Zalen/periodes/sjablonen verplaatst naar een nieuwe `tab-zaalbeheer`; elke sectie in `<details>`/`<summary>` |
| `public/js/navigatie.js` | `zaalbeheer` als derde tabblad |
| `public/js/app.js` | `laadZalen()`/`laadPeriodes()` verplaatst naar de `zaalbeheer`-tabwissel |
| `public/stijl.css` | stijl voor `details`/`summary`, ziet eruit als de vervangen `h2`/`h3` |
| `test/frontend.test.mjs` | tests herzien: niet enkel of de tabbladen bestaan, maar ook welke inhoud erin zit en dat de samenvouwbare structuur er echt staat |

## Tests

563, allemaal groen.
