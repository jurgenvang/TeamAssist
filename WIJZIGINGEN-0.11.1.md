# TeamAssist 0.11.1 — de OpenHolidays-subdivisiecode rechtgezet

Vorige versie: 0.11.0

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## De fout

De vakantiesynchronisatie haalde niets op. Rechtstreeks tegen de echte API
getoetst: de code stuurde `subdivisionCode=BE-VLG`, en dat is dubbel fout.

**België werkt niet met gewone ISO-subdivisies, maar met `groups`.** Bevestigd
via `GET /Groups?countryIsoCode=BE`: die geeft `BE-NL` (Vlaamse gemeenschap),
`BE-FR` en `BE-DE` terug. Dat sluit aan bij de eigen documentatie van
OpenHolidays: filters die niet op een administratieve indeling passen — zoals
de Belgische taalgrens — lopen via `groups`, niet via `subdivisionCode`.

**En `BE-VLG` bestond sowieso niet**, zelfs los van dat eerste punt. De juiste
code voor Vlaanderen is `BE-NL`.

Dit stond bij het bouwen (0.8.0) al als onbevestigde aanname genoteerd — "welke
code Vlaanderen precies draagt, moet tegen de echte API bepaald worden" — en is
nu voor het eerst echt getoetst.

## De fix, en wat er nog niet zeker is

`SUBDIVISIE_VLAANDEREN` staat nu op `'BE-NL'`. **Wat nog niet bevestigd is:**
of de query-parameter voor deze groepscode bij `SchoolHolidays` ook gewoon
`subdivisionCode` heet, met de groepscode als waarde erin, of dat er een
andere parameter voor bestaat. Dat kon niet met zekerheid vastgesteld worden
zonder de exacte aanroep rechtstreeks uit te voeren.

**Draai daarom eerst een droogloop** vóór je de synchronisatie uitvoert:

```
POST /api/admin/periodes/sync
```

Komen er nu periodes terug (`gevonden` groter dan 0 in het antwoord), dan klopt
de fix. Blijft het leeg, dan is de parameternaam het probleem en niet de
waarde — meld dat, dan zoeken we het verder uit met de diagnose-aanpak die ook
bij VBL gebruikt is.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/routes/admin/periodes.js` | `SUBDIVISIE_VLAANDEREN`: `'BE-VLG'` → `'BE-NL'` |
| `src/versie.js` | 0.11.0 → 0.11.1 |
| `schema-controle.sql` | enkel het versienummer |

## Tests

361, allemaal groen. Geen nieuwe tests: dit is een waardecorrectie, geen
gedragswijziging die een test zou vangen — de bestaande tests testen de
URL-opbouwfunctie in het algemeen, niet welke code voor België correct is.
