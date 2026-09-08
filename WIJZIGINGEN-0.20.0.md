# TeamAssist 0.20.0 — T11: handmatig een rol koppelen

Vorige versie: 0.19.0

## Databank

Niets. `rollen.bron = 'club'` bestond al sinds 0.1.0, net als de unieke index
die dubbele koppelingen al voorkwam. `schema-controle.sql` wijzigt enkel door
het versienummer.

## Configuratie

Niets.

## Aanleiding

Ontdekt tijdens een vraag naar bestaande functionaliteit: geen enkele route
schreef ooit naar `rollen`, behalve de VBL-synchronisatie die automatisch
enkel de rol COACH aanmaakt. COORD, PLOEGV, een tweede ADMIN of FINADM waren
enkel via de D1-console rechtstreeks toe te kennen — ook de allereerste ADMIN
is zo ontstaan, met een losse `INSERT` bij de opstart.

## Wat er wijzigt

**`POST /api/admin/persoon/rol-koppelen`** — een bestaande persoon handmatig
aan een rol koppelen, met `bron: 'club'`. Een clubbrede rol (ADMIN, FINADM)
vraagt geen team; COORD, COACH en PLOEGV wel — dezelfde eis die de databank
al afdwong via een CHECK, nu ook aan de voordeur gecontroleerd met een
duidelijke foutmelding in plaats van een databankfout.

**`POST /api/admin/persoon/rol-ontkoppelen`** — enkel voor `bron: 'club'`.
Een VBL-koppeling (vandaag enkel COACH) verwijder je hier niet, die loopt via
de synchronisatie zelf — `ledensync.js` beschermde dat al expliciet
(`rollenWeg`, gefilterd op `bron === 'vbl'`), sinds het begin al aanwezig maar
tot nu toe nooit bereikbaar omdat er nergens een `bron: 'club'`-rol kon
ontstaan.

**Een ADMIN kan zijn eigen ADMIN-rol niet verwijderen** — dezelfde
bescherming als bij `persoonActief` (een beheerder kan zichzelf ook niet op
te verwijderen zetten). Wél iemand anders zijn ADMIN-rol verwijderen kan
gewoon.

**Bij het persoonsscherm**, naast de al bestaande ploegenlijst (0.17.0): een
Rollen-tabel met herkomst per rol, een keuzeveld voor de nieuwe rol (het
teamveld verbergt zichzelf bij een clubbrede rol), en een ontkoppelknop enkel
bij een handmatige koppeling.

**Bijvangst:** `persoonTonen` gaf de teamnaam bij een rol nog niet mee, enkel
de GUID — nu met een `LEFT JOIN` op `teams` erbij (`LEFT`, niet `JOIN`: een
clubbrede rol heeft geen team en moet toch getoond kunnen worden).

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/routes/admin/persoon.js` | `rolKoppelen()`, `rolOntkoppelen()`; `persoonTonen` geeft nu ook `team_naam` mee |
| `src/index.js` | twee routes ingehaakt |
| `public/index.html` | Rollen-sectie bij het persoonsscherm |
| `public/js/schermen/persoon.js` | toont de rollen, koppelt de knoppen, verbergt het teamveld bij een clubbrede rol |
| `test/persoon.test.mjs` | achttien nieuwe tests |
| `test/frontend.test.mjs` | vier nieuwe tests |
| `src/versie.js` | 0.19.0 → 0.20.0 |

## Tests

639, allemaal groen. Vier fouten ingebouwd ter controle: zelf-ADMIN-
verwijdering niet tegenhouden (1 rood), de bron-check bij rol-ontkoppelen
weghalen (1 rood), de clubbrede-teamcheck weghalen (1 rood), de ontkoppelknop
ook bij een VBL-rol tonen in de frontend (1 rood).
