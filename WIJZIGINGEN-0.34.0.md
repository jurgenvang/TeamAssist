# TeamAssist 0.34.0 — I1 fase 3c: de woensdagregel

Vorige versie: 0.33.0

De woensdagregel van YOAssist, met de woensdaglijst van de bond als bron, in
de module Officials. Enkel backend; de schermen komen in fase 4. YOAssist
blijft live.

## Databank

Geen wijziging: `officials_vbl_lijsten`, `officials_wedstrijd.bond_officials`
en `officials_volg_wedstrijden.bond_officials` bestaan sinds 0.30.0. De nieuwe
instelling `officials_automatisch` hoeft niet in de databank te staan
(ontbreekt ze, dan geldt 'uit'). `main` mag meteen vooruit.

## Wat er bijkwam

- `src/officials/mime.js`, `xlsx.js` — ongewijzigd uit YOAssist: een mail en
  een Excel-bestand lezen zonder bibliotheek.
- `src/officials/woensdaglijst.js` — ontvangen, koppelen, verwerken; om 14
  uur verwerken of waarschuwen, om 20 uur terugvallen op de API, en elke
  avond de avondcontrole. Dezelfde regels als YOAssist V39/V42:
  - in de lijst = 0 of 1 official (een cel die anders gekleurd is dan de
    datumcel = aangeduid); niet in de lijst = 2 volgens de bond;
  - enkel wat automatisch in de lijst kwam (`scope_reden = 'woensdag'`) gaat
    eruit, en nooit als er al iemand op staat;
  - Regio (`officials_volg_wedstrijden`) volgt de lijst, enkel voor rijen die
    er bij ontvangst al waren;
  - elke onverwachte vorm faalt luid naar de beheerders en wordt bewaard.
- `src/officials/woensdag.js` — de woensdagregel met de API en de
  avondcontrole, op de tabellen van TeamAssist.
- `src/officials/teksten.js` — de berichten; `ontvangers.js` — beheerders
  (YOADM, ADMIN) en YO+ uit de rollen, telkens via `verwittig()`, dus met
  kanaalvoorkeur, ouders en Mijn berichten.
- `src/index.js` — `email()`-handler (gooit nooit: een geweigerde mail kaatst
  terug naar de bond) en `GET /api/admin/officials/woensdaglijst`
  (`officials.beheren`).
- Planner: `woensdagregel` (wo 14 u), `woensdag-terugval` (wo 20 u),
  `avondcontrole` (elke dag 20 u).

## Verschillen met YOAssist

- **Uit tot de overstap.** De drie geplande taken lopen pas als
  `officials_automatisch` aanstaat. Zolang YOAssist live is, komt de lijst
  daar binnen, en zou TeamAssist elke woensdag ten onrechte 'nog niet binnen'
  melden en om 20 uur op de API terugvallen. De mailingang zelf werkt wel.
- **De API-terugval neemt enkel gekende categorieën vanaf U14.** In YOAssist
  kon een G08-wedstrijd zonder refs om 20 uur in de lijst komen; de
  woensdaglijst en Regio sloten die al uit (V41). Nu overal hetzelfde.
- Een wedstrijd heet bij haar id in `wedstrijden`; de thuisploeg is
  `teams.naam`, de volledige naam van de bond, zoals in de lijst.
- `src/officials/routes.js` gebruikt `beheerders()` uit `ontvangers.js`.
- `test/d1.mjs` kent nu `batch()`, zoals D1 (alles of niets).

## Tests

916 (was 901). `test/woensdaglijst.test.mjs` (15) met dezelfde scenario's als
in YOAssist; de Excel- en mailbouwers staan apart in
`test/woensdaglijst-hulp.mjs`. Rood gezien tegen:
- de bezetting niet nakijken bij het uit de lijst halen;
- de afscherming `officials_automatisch` weglaten;
- de categoriefilter (G08) uit de API-terugval halen;
- een vaste witte kleur in plaats van de kleur van de rij;
- `scope_uit` negeren;
- een `email()`-handler die gooit.

## Na te kijken

Niets op de echte Worker zolang `officials_automatisch` uit staat. Bij de
overstap: Email Routing en de instelling (README, *De woensdaglijst van de
bond*).
