# TeamAssist 0.30.0 — I1 fase 2a: het schema van de module Officials

Vorige versie: 0.29.0

Eerste helft van fase 2 van de integratie met YOAssist (backlog I1): het
schema waar de officials in komen, en de rollen en rechten. Nog geen
schermen en nog geen gegevens — die komen met de migratie (0.31.0) en de
volgende fases. Voor wie de app vandaag gebruikt, verandert er niets, op drie
nieuwe keuzes bij *Rollen* in het persoonsscherm na.

## Databank — een heropbouw van `rollen`, verder ALTER en CREATE

Voer `migratie-0.30.0.sql` uit in de D1-console, in één keer, daarna
`schema-controle.sql` (bovenaan: `ALLES OK`).

- **`rollen` wordt heropgebouwd.** De CHECK krijgt drie rollen erbij, en een
  CHECK wijzigen kan SQLite niet met een ALTER. De bestaande rollen gaan mee,
  met hun id. Niets verwijst naar `rollen`, dus geen andere tabel wordt
  geraakt.
- **Drie kolommen, met ALTER:** `personen.agenda_sleutel` (met een unieke
  index), `teams.officials` (standaard 1) en `wedstrijden.bron` (standaard
  'vbl').
- **Twaalf nieuwe tabellen** `officials_*`, leeg op de categorieën en
  tarieven na.
- **Drie instellingen:** `facturatie_ontvangers`, `forfait_aanduiding`,
  `extern_namen`.

Getoetst tegen een databank met het schema van 0.29.0 en bestaande rollen:
daarna exact dezelfde structuur als een verse `schema.sql`, de rollen met
hun id bewaard, en de nieuwe CHECK doet wat ze moet (YO met een ploeg erbij
wordt geweigerd). Een tweede keer uitvoeren faalt op de eerste ALTER — dat
betekent dat het al gebeurd is.

Het script is gegenereerd uit `schema.sql` zelf, niet overgetypt: zo kan het
er niet van afwijken.

## Configuratie

Niets.

## Wat er wijzigt

**Drie rollen**, alle drie clubbreed — een official fluit voor de club, niet
voor één ploeg:

| Rol | Mag |
|---|---|
| `YO` | eigen beschikbaarheid opgeven (U10/U12) |
| `YOPLUS` | idem, ook vanaf U14 |
| `YOADM` | de officials beheren en de vergoedingen afsluiten — maar geen personen, zalen of aanwezigheden |

ADMIN mag de officials ook beheren; FINADM ziet de vergoedingen. Zelf fluiten
vraagt altijd YO of YO+, ook voor een beheerder. Ze staan als keuze bij het
persoonsscherm en bij *Kijken als …*.

**Voor welke ploegen de club officials regelt**, beslist zoals vandaag in
YOAssist: een eigen vlag `teams.officials`, standaard aan, los van
`teams.gevolgd`. Een ploeg kan officials krijgen zonder dat de club ze in
TeamAssist beheert.

**De tabellen van de module**, met het voorvoegsel `officials_`:
categorieën en tarieven, wat een wedstrijd voor de officials betekent (scope,
scheidsrechters van de bond, forfait), beschikbaarheden, aanduidingen,
problemen, afgesloten maanden en vergoedingen, voorkeuren (herinneringen, gsm
delen), Regio (gevolgde clubs en hun wedstrijden) en de woensdaglijsten. Een
persoon is overal een `persoon_id`, nooit een e-mailadres zoals in YOAssist.

**Een vertrokken official** (180 dagen inactief) verdwijnt met zijn
beschikbaarheden, aanduidingen, problemen en voorkeuren. Zijn uitbetaalde
vergoedingen blijven: daar is `persoon_id` bewust geen foreign key, en de
naam staat in de regel zelf.

Het volledige datamodel, en wat er bij de migratie met elke YOAssist-tabel
gebeurt, staat in de backlog onder I1 → *Datamodel*.

## Onderweg

**Rollen staan op vijf plaatsen**: de rechtenlaag, de CHECK in het schema,
de route die een rol koppelt, het persoonsscherm en *Kijken als …*. Een
nieuwe test legt ze naast elkaar. Een rol die op één plaats ontbreekt, viel
anders pas op wanneer iemand hem probeerde toe te kennen — als CHECK-fout,
of als een ploegveld dat niet verdwijnt bij een clubbrede rol.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `schema.sql` | `rollen` (CHECK), drie kolommen, twaalf tabellen, drie instellingen |
| `migratie-0.30.0.sql` | nieuw |
| `schema-alles-in-een.sql`, `schema-kaal.sql`, `schema-controle.sql` | opnieuw gegenereerd |
| `src/lib/rechten.js` | vier rechten, drie rollen; ADMIN en FINADM krijgen de rechten op de officials die bij hen horen |
| `src/lib/opkuis.js` | de officials-tabellen bij het verwijderen van een persoon |
| `src/routes/admin/persoon.js` | de nieuwe rollen zijn toe te kennen, clubbreed |
| `public/index.html` | drie keuzes bij *Rollen* |
| `public/js/schermen/persoon.js`, `testrol.js` | de nieuwe rollen zijn clubbreed |
| `test/rechten.test.mjs` | de matrix met de drie rollen en vier rechten |
| `test/rollen.test.mjs` | nieuw: 3 tests |
| `test/officials-schema.test.mjs` | nieuw: 8 tests |
| `test/frontend.test.mjs` | één test losser (de lijst van clubbrede rollen staat nu in rollen.test) |
| `src/versie.js` | 0.29.0 → 0.30.0 |
| `.claude/BACKLOG.md` | het datamodel als beslist; fase 2 in 2a en 2b |

## Tests

824, allemaal groen. Ter controle: een clubbrede rol weg uit één scherm (1
rood), en de aanduidingen van een vertrokken persoon niet meer opruimen (1
rood — de foreign key houdt het verwijderen tegen).

## API-vorm

Niets gewijzigd. `/api/mij` toont de nieuwe rollen en rechten als iemand ze
heeft.
