# TeamAssist 0.25.0 — T15: opruiming

Vorige versie: 0.24.0

## Databank — een tabel-heropbouw, geen gewone ALTER

`aanwezigheden.persoon_id` verliest zijn `NOT NULL` — SQLite kan die
beperking niet met een gewone `ALTER TABLE` loslaten, dus dit is een volledige
heropbouw. Bijgevoegd als `migratie-aanwezigheden-nullable.sql`.

**Grondig getoetst tegen een nagemaakte bestaande databank**: bestaande data
blijft volledig intact (rij voor rij vergeleken), anonimiseren (`persoon_id`
op `NULL` zetten) werkt, twee anonieme rijen voor dezelfde activiteit botsen
niet met de bestaande unieke index (SQLite behandelt meerdere `NULL`-waarden
daar terecht als niet-gelijk), en alle drie de bestaande indexen komen na de
heropbouw terug. `schema-controle.sql` bevestigt `ALLES OK`.

## Configuratie

Niets.

## Aanleiding

Niets ruimde ooit iets op: `logboek`, `taak_runs` en `berichten` groeiden
onbeperkt, en een inactieve persoon (`personen.actief = 0`) bleef voor altijd
staan — de projectinstructies beloofden een geplande taak die dat zou doen,
maar die bestond niet (nagekeken: geen enkele `DELETE FROM personen` in de
code). Sinds T13 (0.22.0) draait de synchronisatie automatisch, dus `logboek`
en `taak_runs` groeien sindsdien een veelvoud sneller.

## Twee tabellen extra gevonden tijdens het bouwen

Bij het volledig uitwerken van "wat verwijst er allemaal naar een persoon"
bleken er twee tabellen te bestaan die niet in het oorspronkelijke overzicht
stonden:

- **`accounts`** — de koppeling tussen een Supabase-identiteit en een
  persoon. Zonder die te verwijderen zou een gewiste persoon in theorie nog
  via zijn oude account kunnen aanmelden.
- **`ouder_kind`** — `persoon_id` zit hier, net als bij `team_spelers`, in de
  primary key zelf (als `ouder_id` én als `kind_id`), dus ook hier is enkel
  volledige verwijdering zinvol.

Beide behandeld volgens dezelfde, al afgesproken regel — geen nieuwe
beslissing, enkel het correct doorvoeren van de bestaande.

## Wat er wijzigt

**`src/lib/opkuis.js`** — vier functies:

| Functie | Wat |
|---|---|
| `kuisLogboekOp()` | `logboek` ouder dan 365 dagen, **enkel** `afgehandeld = 1` — een onafgehandelde regel verdwijnt nooit, hoe oud ook |
| `kuisTaakRunsOp()` | `taak_runs` ouder dan 30 dagen |
| `kuisBerichtenOp()` | `berichten` ouder dan 120 dagen, zoals YOAssist |
| `verwijderInactievePersonenOp()` | een persoon die 180 dagen of langer inactief is |

**Bij het verwijderen van een persoon is niet alles gelijk** — dat is geen
implementatiedetail, het zit in de structuur van het schema:

- **Volledig mee weg**: `accounts`, `team_spelers`, `rollen`, `ouder_kind`,
  `wedstrijdselecties`, `berichten`. Bij de eerste vijf is `persoon_id`
  letterlijk deel van de primary key of anderszins zonder betekenisvolle
  anonieme vorm.
- **Bewaard, met de identiteit losgekoppeld**: `aanwezigheden` — de enige
  tabel waar `persoon_id` wél verplicht was maar géén deel van de primary
  key. Niet enkel `persoon_id` zelf: ook `opgave_door`, `uitgesloten_door` en
  `vaststelling_door` worden losgekoppeld waar ze naar de verwijderde persoon
  verwijzen, óók op iemand anders zijn aanwezigheidsrij — geen van die drie
  heeft een eigen FK-afdwinging, maar zonder ze los te koppelen zou de
  identiteit daar alsnog blijven staan.
- **`logboek.wie` wordt bewust niet losgekoppeld.** Een logboek is een
  verantwoordingsspoor; "wie deed dit" hoort te blijven staan ook nadat
  iemand de club verlaten heeft.

**Vijfde geplande taak**: `opkuis`, elke dag om 2 uur — het rustigste uur,
vóór ploegen/leden (3 uur) en de ping (4 uur). Voert alle vier de
opkuisfuncties na elkaar uit, elk met zijn eigen `taak_runs`-regel.

**De uitvoeringslaag is herstructureerd** om dit netjes te dragen:
`geplandetaken.js` had enkel een `Response`-gebaseerde aanroepvorm
(`voerTaakUit`, voor de synchronisatiefuncties). De opkuisfuncties geven
gewoon een aantal terug, geen `Response` — een nieuwe `voerOpkuisFunctieUit`
deelt dezelfde onderliggende registratie (`registreerUitslag`), zodat er geen
tweede kopie van de taak_runs/logboek-logica ontstond. `opkuis` hangt bewust
niet af van een actief seizoen, in tegenstelling tot de andere taken —
opruiming moet ook draaien vóór een club haar eerste seizoen heeft ingesteld.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `schema.sql`, `schema-alles-in-een.sql`, `schema-kaal.sql`, `schema-controle.sql` | `aanwezigheden.persoon_id` nullable |
| `migratie-aanwezigheden-nullable.sql` | nieuw |
| `src/lib/opkuis.js` | nieuw |
| `src/lib/planner.js` | `opkuis` op uur 2, elke dag |
| `src/lib/geplandetaken.js` | herstructureerd: `registreerUitslag()` gedeeld tussen `voerTaakUit()` en het nieuwe `voerOpkuisFunctieUit()` |
| `test/opkuis.test.mjs` | nieuw: 15 tests |
| `test/planner.test.mjs` | 3 nieuwe tests, 1 aangepast (uur 2 is niet langer rustig) |
| `test/geplandetaken.test.mjs` | 4 nieuwe tests |
| `src/versie.js` | 0.24.0 → 0.25.0 |

## Tests

695, allemaal groen. Vier fouten ingebouwd ter controle: `afgehandeld = 0`
toch meenemen bij het opruimen van `logboek` (1 rood), de drie
`_door`-kolommen niet loskoppelen (1 rood), actieve personen ook verwijderen
(1 rood), `opkuis` onterecht afhankelijk maken van een actief seizoen (4
rood).
