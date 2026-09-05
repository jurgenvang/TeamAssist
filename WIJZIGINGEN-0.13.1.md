# TeamAssist 0.13.1 — de echte OpenHolidays-fix

Vorige versie: 0.13.0

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer.

## Configuratie

Niets.

## De fout, deel twee

0.11.1 loste de helft van het probleem op: de waarde `BE-VLG` bestond niet en
werd vervangen door de echte groepscode `BE-NL`. De vakantiesynchronisatie
bleef daarna toch leeg — gemeld, en verder onderzocht.

**De officiële OpenAPI-specificatie van OpenHolidays**
(`openholidaysapi.org/swagger/v1/swagger.json`), rechtstreeks opgehaald en
nagekeken: `/SchoolHolidays` heeft twee aparte parameters, `subdivisionCode`
én `groupCode`. Een gewone ISO-subdivisie (zoals `DE-BY` voor Beieren) hoort in
`subdivisionCode`; een groepscode voor een land dat met taalgrenzen of zones
werkt — België is daar het eigen voorbeeld van in de documentatie — hoort in
`groupCode`. De code stuurde `BE-NL` nog steeds via `subdivisionCode`. Omdat
`BE-NL` geen geldige subdivisie is, vond de API niets om op te filteren.

**Twee onafhankelijke, rechtstreeks geverifieerde bronnen bevestigen dit:**
de `/Groups`-lijst (bevestigt dat `BE-NL` bestaat) en de OpenAPI-specificatie
zelf (bevestigt dat `groupCode` de juiste parameter is). Beide fetches gaven
een `destination_url` die exact overeenkwam met de gevraagde URL — geen
gecachete substitutie.

**Wat niet rechtstreeks bevestigd kon worden:** de combinatie
`SchoolHolidays?countryIsoCode=BE&groupCode=BE-NL` zelf uitvoeren en het
antwoord zien. Twee pogingen daartoe werden door het zoekhulpmiddel
teruggeleid naar een eerder gezien Oostenrijks voorbeeld. De indirecte
bevestiging — de juiste groepscode, plus de juiste parameter, elk apart en
écht getoetst — is sterk, maar geen vervanging voor de echte proef vanaf de
Worker.

## De fix

`periodeUrl()` en `haalVakanties()` in `src/lib/vakanties.js` accepteren nu een
object `{ subdivisieCode, groepscode }` in plaats van één positioneel
argument — een subdivisie en een groepscode zijn geen inwisselbare varianten
van hetzelfde, en de functiesignatuur zegt dat nu ook. `periodes.js` stuurt
`BE-NL` via `groepscode`.

**Draai een droogloop om het te bevestigen:**

```
POST /api/admin/periodes/sync
```

Komt `gevonden` nu boven 0 uit, dan is punt AA na twee pogingen eindelijk
volledig afgesloten.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/vakanties.js` | `groupCode` als eigen parameter naast `subdivisionCode` |
| `src/routes/admin/periodes.js` | stuurt `BE-NL` via `groepscode`, niet via `subdivisieCode` |
| `test/vakanties.test.mjs` | bijgewerkt naar de nieuwe signatuur, plus tests die `groupCode` expliciet controleren |
| `src/versie.js` | 0.13.0 → 0.13.1 |
| `schema-controle.sql` | enkel het versienummer |

## Tests

458, allemaal groen. Ter controle de groepscode weer via `subdivisionCode`
laten sturen: 2 tests rood — precies de fout die tot nu toe onopgemerkt bleef.
