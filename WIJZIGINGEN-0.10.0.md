# TeamAssist 0.10.0 — clubkleur, logo en de YOAssist-stijl

Vorige versie: 0.9.0

## Databank

Niets. De drie nieuwe instellingen (`clubkleur_accent`, `clublogo_url`,
`clublogo_bron`) gebruiken de bestaande tabel `instellingen`, geen nieuwe
kolommen. `schema-controle.sql` wijzigt enkel door het versienummer.

## Configuratie

Niets.

## Belangrijk: over de gebruikte skill-informatie

Er is AI-gegenereerde documentatie over de VBL-clubintegratie meegegeven. Twee
delen ervan zijn overgenomen, één deel expliciet **niet**:

- **`shirtKleur` en `shirtReserve` bestaan echt** — bevestigd in een eerdere
  echte respons via `/api/admin/vbl-diagnose`. Betrouwbaar.
- **Het logo-URL-patroon (`vblapi1.wisseq.eu/vbldataOrgLogo/…`) is niet
  bevestigd.** De skill zegt zelf dat het enkel op de website waargenomen is,
  niet uit de officiële documentatie. Het wordt gebruikt, maar met een
  zichtbare `logo_url_geverifieerd: false` en een terugval die het logo gewoon
  verbergt als het niet laadt.
- **Het GUID-formaat uit de skill (`BVBL1125HSE002`, zonder spaties) is
  fout** en wordt genegeerd. Herhaaldelijk bevestigd in dit project:
  `BVBL1125J16  2`, met twee spaties.

## Wat er wijzigt

### Clubkleur: gecontroleerd, nooit geraden

Drie nieuwe instellingen bij Configuratie, onder **Huisstijl**. De accentkleur
wordt bij het bewaren getoetst op contrast met wit (`src/lib/kleur.js`, WCAG-
relatieve luminantie). Een te lichte kleur — geel, bijvoorbeeld — wordt
**geweigerd**, nooit stilzwijgend verdonkerd: dat zou een club een andere kleur
geven dan ze koos zonder het te melden.

**`GET /api/admin/branding-voorstel`** haalt bij de bond op wat er te vinden is
— het logo afgeleid uit het club-GUID, en de shirtkleur via `OrgDetailByGuid`
met `TeamDetailByGuid` van de eerste gevolgde ploeg als terugval. Dit schrijft
nooit rechtstreeks naar de instellingen: het is een voorstel, met de ruwe
waarde erbij, dat een beheerder expliciet overneemt met een knop — hetzelfde
patroon als bij het synchroniseren van ploegen en leden.

**`GET /api/branding`** is publiek: het aanmeldscherm toont de clubkleur en het
logo al vóór iemand een token heeft.

### Header en beheermenu in de stijl van YOAssist

De topbalk toont nu logo en clubnaam onder de apptitel, en de naam met
rol(len) eronder aan de rechterkant — dezelfde opbouw als bij YOAssist ('club
onder de apptitel, rol(len) onder de eigen naam').

Het beheertabblad is gesplitst in **Dagelijks beheer** (vakanties verversen,
de bond bekijken) en **Configuratie** (instellingen, zalen, de testrol) — het
patroon uit YOAssist van twee menu-items in plaats van één, zodat wat vaak
gebeurt niet tussen wat zelden wijzigt staat.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/kleur.js` | nieuw: contrastcontrole |
| `src/lib/vbl.js` | `clubLogoUrl`, `zoekShirtkleur` |
| `src/routes/admin/branding.js` | nieuw: voorstelroute en publieke route |
| `src/routes/admin/instellingen.js` | drie huisstijlvelden, kleurcontrole bij bewaren |
| `src/index.js` | twee routes ingehaakt |
| `public/js/huisstijl.js` | nieuw: kleur en logo toepassen |
| `public/js/api.js` | `haalBranding` erbij, naast `vraagAanmeldlink` |
| `public/js/schermen/instellingen.js` | kleurkiezer, voorstelknoppen |
| `public/js/navigatie.js` | Beheer gesplitst in twee tabbladen |
| `public/index.html` | topbalk herschreven, beheersectie gesplitst |
| `public/stijl.css` | topbalk-stijl, kleurkiezer |
| `test/kleur.test.mjs`, `test/branding.test.mjs` | nieuw |
| `test/frontend.test.mjs` | acht tests erbij |
| `test/routes.test.mjs` | publieke-routelijst bijgewerkt |
| `src/versie.js` | 0.9.0 → 0.10.0 |

## Tests

343, allemaal groen. Ter controle de contrastdrempel op 0 gezet: 3 tests rood.
