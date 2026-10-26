# TeamAssist 0.36.0 — I1 fase 3e: facturatie

Vorige versie: 0.35.0

De vergoedingen van de officials, backend. De schermen komen in fase 4.
YOAssist blijft live. Het werk stond al als tussencommit op `main` (f792e3a);
deze versie voegt de tests, het versienummer en de documenten toe.

## Databank

Geen wijziging: `officials_maanden`, `officials_vergoeding_regels` en
`officials_vergoeding_verwerkt` bestaan sinds 0.30.0. `main` mag meteen
vooruit.

## Wat er bijkwam

- `src/officials/vergoeding.js` — de rekenregels van YOAssist, ongewijzigd,
  op persoon-id in plaats van e-mailadres.
- `src/officials/facturatie.js`, alle met recht `officials.vergoedingen`
  (YOADM, ADMIN, FINADM):
  - `GET /api/admin/officials/facturatie` — afgesloten en open maanden;
  - `GET …/facturatie/voorbeeld?maand=` — de droogloop, met de wedstrijden per
    official, wat niet meer bij de bond staat en wat geen tarief heeft;
  - `POST …/facturatie/afsluiten { maand, versturen? }` — momentopname plus
    spoor, de maandmail per official, de verzamelstaat;
  - `GET …/facturatie/staat?maand=` — een afgesloten maand, met het detail uit
    het spoor (wat er toen meetelde), nooit uit de huidige aanduidingen;
  - `GET …/facturatie/officials` — per official over alle maanden;
  - `POST …/facturatie/ontvangers` — wie de verzamelstaat krijgt;
  - `GET/POST /api/admin/officials/tarieven` — **nieuw**: in YOAssist kon een
    tarief enkel via de console. Een afgesloten maand ligt vast, ook een
    correctie rekent met het tarief van toen.
- `GET /api/officials/vergoeding[?namens=]` — Mijn vergoeding; een ouder ziet
  die van zijn kind.
- `verwittigExtern()` in `verwittigen.js` — voor adressen zonder account (de
  penningmeester). Volgt bericht_modus; geen push, geen `berichten`.
- Het spoor heet een wedstrijd bij haar GUID, zoals YOAssist en de migratie.
- Een wedstrijd weghalen uit een open maand is gewoon vrijgeven
  (`POST /api/admin/officials/vrijgeven`, 0.33.0): geen eigen route.

## Tests

943 (was 930). `test/officials-facturatie.test.mjs` (13). Rood gezien tegen:
- de correcties niet in het spoor (komen elke maand terug);
- een wedstrijd die niet meer bij de bond staat toch meetellen;
- afsluiten ondanks een categorie zonder tarief;
- geen positieve correctie voor een latere aanduiding;
- de staat uit de huidige aanduidingen in plaats van het spoor;
- de verzamelstaat niet omleiden in de modus *omleiden*;
- de lopende maand in het seizoenstotaal;
- `namens` niet nakijken bij Mijn vergoeding.
