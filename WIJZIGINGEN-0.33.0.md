# TeamAssist 0.33.0 — I1 fase 3b: de kern van de module Officials

Vorige versie: 0.32.0

De backend van wat in YOAssist het hart is: welke wedstrijden in de lijst
staan, wie zich beschikbaar zet, en wie er aangeduid wordt. Nog geen
schermen — die komen in fase 4. YOAssist blijft live.

## Databank

Geen wijziging: alles past in de tabellen van 0.30.0. `main` mag meteen
vooruit.

## De synchronisatie voor de officials

`src/officials/sync.js`, `sync-route.js`. Naar het voorbeeld van YOAssist:
**één** oproep `OrgMatchesByGuid` voor de hele club, enkel de
thuiswedstrijden van ploegen met `teams.officials = 1`.

- **Een gevolgde ploeg**: de gewone wedstrijdsync maakt de rij (met de
  taken); deze sync zet er de gegevens voor de officials naast. Ze draait
  daarom meteen na de gewone sync (0, 6, 12 en 18 uur).
- **Een ploeg met officials die TeamAssist niet volgt**: deze sync maakt en
  werkt de thuiswedstrijd zelf bij, zonder taken. Een verschoven wedstrijd
  komt open in het logboek.
- Per wedstrijd: de scheidsrechters van de bond (namen een dag na de
  wedstrijd gewist, het aantal blijft), het forfait (gemeld in het
  logboek; wat er met de aanduidingen gebeurt, komt in 3f), en U10/U12
  vanzelf in de lijst. De scope en een bevestiging van een beheerder blijven
  staan; die laatste vervalt zodra de bond zelf twee refs toont.
- Dezelfde veiligheden als in YOAssist: een mislukte oproep wijzigt niets;
  nul wedstrijden terwijl er bewaard zijn wijzigt niets; meer dan drie
  tegelijk verdwenen wordt niet als verdwenen gezet.
- Handmatig: `POST /api/admin/officials/sync` (standaard een droogloop,
  `?uitvoeren=1` echt), recht `officials.beheren`.

**Waarom niet in de gewone sync**: die haalt per ploeg op, en enkel de
gevolgde ploegen. Een Worker mag per aanroep maar een beperkt aantal
uitgaande oproepen doen; één oproep voor de club past daar ruim in.

## Wat een official doet

`src/officials/routes.js`:
- `GET /api/officials/wedstrijden` — de lijst vanaf vandaag. Een YO ziet
  enkel U10/U12, een YO+ alles wat in de lijst staat. Per wedstrijd: het
  eigen antwoord, of je aangeduid bent, hoeveel er nog nodig zijn, de
  scheidsrechters van de bond, wie er van de club op staat (met het
  gsm-nummer van een collega enkel als je samen op die wedstrijd staat en
  hij het deelt), het opkomstuur, de uitslag en het forfait.
- `POST /api/officials/beschikbaarheid` — ja, nee, of wissen. Niet buiten de
  eigen lijst, niet bij forfait, niet voor een voorbije wedstrijd, en niet
  meer eens aangeduid.
- `POST /api/officials/probleem` — voor wie aangeduid is; de YOADM's en
  ADMIN's krijgen bericht.

Alle drie ook **namens een kind** (`namens`): met de rechten van het kind,
gecontroleerd tegen `ouder_kind` (0.32.0).

## Wat een beheerder doet (`officials.beheren`)

- `GET /api/admin/officials/kandidaten` — wie in aanmerking komt, met zijn
  antwoord en een eventuele botsing.
- `POST /api/admin/officials/aanduiden` — met de controles uit YOAssist: in
  de lijst, geen forfait, een YO enkel bij U10/U12, nog een plaats vrij, en
  wie 'nee' zei of al ergens anders staat enkel met `forceer`. De official
  krijgt bericht (of zijn ouders, zie 0.32.0), behalve bij een voorbije
  wedstrijd: dat is een rechtzetting achteraf.
- `POST /api/admin/officials/vrijgeven` — de rij blijft, voor de facturatie.
- `POST /api/admin/officials/scope` — in of uit de lijst; uit legt
  `scope_uit` vast, en kan niet zolang er iemand op staat.
- `POST /api/admin/officials/refs-bevestigd`, `GET …/problemen`,
  `POST …/probleem-afhandelen`.

## Bestanden

| Bestand | Wat |
|---|---|
| `src/officials/regels.js` | nieuw: nog nodig, botsingen, opkomst, forfait, scheidsrechters |
| `src/officials/sync.js`, `sync-route.js` | nieuw: de synchronisatie |
| `src/officials/routes.js` | nieuw: official en beheer |
| `src/index.js` | dertien routes |
| `src/lib/planner.js`, `src/lib/geplandetaken.js` | `officials` om 0, 6, 12 en 18 uur, na de gewone sync |
| `test/officials-kern.test.mjs` | nieuw: 23 tests |
| `test/routes.test.mjs` | drie routes zonder recht in de route-tabel |
| `src/versie.js`, `schema-controle.sql` | 0.32.0 → 0.33.0 |
| `.claude/BACKLOG.md`, `.claude/learnings.md` | 3b afgewerkt; het maximum aan uitgaande oproepen |

## Tests

901, allemaal groen. Ter controle: de U10/U12-filter weg (2 rood), de
botsingscontrole weg (1 rood), de rem op nul wedstrijden weg (1 rood).

## Na het deployen

Een droogloop op de echte Worker:
`POST /api/admin/officials/sync` (zonder `uitvoeren=1`). Komt `gevonden` in
de buurt van de 210 wedstrijden die YOAssist kent, dan klopt de koppeling.
Daarna draait ze vanzelf; `wacht_op_sync` hoort na de eerste ronde 0 te zijn.
