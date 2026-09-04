# TeamAssist 0.17.0 — handmatig een persoon aan een team koppelen (punt Y)

Vorige versie: 0.16.0

## Databank

Niets. `team_spelers.bron` bestond al sinds 0.1.0 met `'club'` als geldige
waarde — enkel nooit een route die er iets mee deed. `schema-controle.sql`
wijzigt enkel door het versienummer.

## Configuratie

Niets.

## Aanleiding

Punt Y: de testrol werkt niet voor aanwezigheid opgeven, want een beheerder
heeft zelf geen SPELER- of OUVO-rechten en de testrol kan enkel versmallen,
nooit rechten toevoegen. Twee opties stonden in de backlog — jezelf als
speler in een ploeg zetten, of een aparte testpersoon — maar geen van beide
was mogelijk: er bestond geen enkele manier om iemand handmatig aan een team
te koppelen. `team_spelers` werd tot nu toe uitsluitend door de
VBL-synchronisatie geschreven.

## Een echte fout gevonden vóór het bouwen

`ledensync.js` beschermde een handmatig toegevoegde **coach** al expliciet
tegen de eerstvolgende synchronisatie ("een coach met bron 'club' wordt nooit
weggesynchroniseerd"). Diezelfde bescherming ontbrak bij **spelers** — de
`uitPloeg`-filter in `maakLedenplan()` checkte `bij_bond` en de relatie-GUID,
maar nooit `bron`. Een handmatig gekoppelde speler zou bij de eerstvolgende
ledensynchronisatie stil op `bij_bond = 0` gezet zijn, precies het lot dat
deze nieuwe functie moest vermijden. Bijkomend ontbrak `ts.bron` zelfs in de
`SELECT` die de synchronisatie gebruikt — de fix had zonder die aanvulling
niets gedaan.

Beide gecorrigeerd, met twee nieuwe tests die het exacte scenario dekken (een
club-speler blijft ongemoeid; de veiligheidsrem op een derde telt enkel de
echte VBL-rijen mee).

## Wat er wijzigt

**`POST /api/admin/persoon/team-koppelen`** — een bestaande persoon aan een
bestaand team koppelen als speler, met `bron: 'club'`, `bij_bond: 0`. Werkt
voor elk team, niet enkel voor testdoeleinden — ook nuttig voor een
recreatieve groep die de bond niet synchroniseert.

**`POST /api/admin/persoon/team-ontkoppelen`** — enkel voor `bron: 'club'`.
Een VBL-koppeling verwijder je hier niet; die loopt via de synchronisatie
zelf.

**Bijvangst:** `GET /api/admin/persoon` gaf `ploegen` altijd al terug, maar
het scherm toonde die lijst nergens. Nu zichtbaar, met de herkomst per ploeg
('bij de bond' / 'niet meer bij de bond' / 'handmatig gekoppeld') en een
ontkoppelknop enkel bij de laatste.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/ledensync.js` | bugfix: `bron === 'vbl'` toegevoegd aan de `uitPloeg`-filter |
| `src/routes/admin/leden.js` | `ts.bron` toegevoegd aan de `inPloeg`-query |
| `src/routes/admin/persoon.js` | `teamKoppelen()`, `teamOntkoppelen()`; `ploegen`-query geeft nu ook `bron` mee |
| `src/index.js` | twee routes ingehaakt |
| `public/index.html` | ploegenlijst en koppelformulier bij het persoonsscherm |
| `public/js/schermen/persoon.js` | toont de ploegen, koppelt de knoppen |
| `test/ledensync.test.mjs` | drie bestaande fixtures bijgewerkt (misten `bron`), twee nieuwe tests |
| `test/persoon.test.mjs` | tien nieuwe tests |
| `test/frontend.test.mjs` | vier nieuwe tests |
| `src/versie.js` | 0.16.0 → 0.17.0 |

## Tests

579, allemaal groen. Drie fouten ingebouwd ter controle: de `bron`-check in
`ledensync.js` weghalen (1 rood), de `bron`-check bij ontkoppelen weghalen (1
rood), de ontkoppelknop ook bij een VBL-koppeling tonen (1 rood).

## Daarna

Met deze functie kan punt Y nu echt afgesloten worden: koppel jezelf of een
testpersoon aan een team, en test de aanwezigheidsopgave via de testrol.
Volgende blok, zoals afgesproken: Fase 5, Communicatie.
