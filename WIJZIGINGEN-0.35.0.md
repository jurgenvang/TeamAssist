# TeamAssist 0.35.0 — I1 fase 3d: automatisch aanvullen en herinneringen

Vorige versie: 0.34.0

Enkel backend; de schermen komen in fase 4. YOAssist blijft live.

## Databank

Geen wijziging. `officials_voorkeuren` (herinner_avond, herinner_ochtend)
bestaat sinds 0.30.0; wie er geen rij heeft, krijgt beide herinneringen.
`main` mag meteen vooruit.

## Automatisch aanvullen

- `src/officials/autotoewijzing.js` — het algoritme van YOAssist, een zuivere
  functie: schaarste eerst, wie het minst heeft eerst, botsingen vermeden
  (dezelfde marges als bij handmatig aanduiden), bestaande aanduidingen
  blijven staan. Op persoon-id in plaats van e-mailadres.
- `POST /api/admin/officials/automatisch { dagen?: 14, uitvoeren?: false }`
  (`officials.beheren`) — standaard een droogloop. Een YO enkel bij U10/U12,
  enkel actieve personen met rol YO/YO+, geen forfait, de woensdaglijst telt
  mee in wat nog nodig is.
- **Anders dan YOAssist:** wie automatisch aangeduid wordt, krijgt hetzelfde
  bericht als bij een handmatige aanduiding (`verwittigAanduiding()` in
  `routes.js`, nu gedeeld). In YOAssist bleef het stil tot de herinnering.

## Herinneringen

`src/officials/herinneringen.js`:
- **De avond ervoor (19 u) en de ochtend zelf (7 u)** aan wie aangeduid is:
  één bericht per persoon, ook bij twee wedstrijden, met het opkomstuur;
  volgens `officials_voorkeuren`; nooit voor een forfait. De dag is de
  Brusselse dag (`brusselDatum()` in `klok.js`).
- **Maandag 8 u** het weekoverzicht naar de beheerders (YOADM, ADMIN).
- **`POST /api/admin/officials/vul-nog-in { zaterdag }`** — wie voor het
  weekend niets invulde. **Anders dan YOAssist:** enkel voor wat iemand kan
  zien; een YO krijgt geen herinnering over een U16. Zoals YOAssist bewust
  zonder droogloop: een gerichte actie van een beheerder voor één weekend.

De drie geplande taken volgen `officials_automatisch`, net als de
woensdagregel: zolang YOAssist live is, stuurt dat zelf de herinneringen.

## Tests

930 (was 916). `test/officials-aanvullen.test.mjs` (14). Rood gezien tegen:
- de YO-grens weg bij het aanvullen;
- schaarste niet eerst; niet eerlijk verdelen;
- de voorkeur negeren; een forfait toch herinneren;
- een YO herinneren voor wat hij niet ziet;
- de droogloop overslaan; geen bericht bij een automatische aanduiding;
- de afscherming `officials_automatisch` weglaten.

## Ook

- De releaseskill zegt nu dat `schema-controle.sql` bij elke versie opnieuw
  gegenereerd wordt (het versienummer staat erin).
