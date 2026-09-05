# TeamAssist 0.15.0 — feestdagen

Vorige versie: 0.14.3

## Databank — een echte migratie, geen gewone ALTER

Twee wijzigingen, van verschillend gewicht:

```sql
ALTER TABLE zalen ADD COLUMN open_op_feestdagen INTEGER NOT NULL DEFAULT 0 CHECK (open_op_feestdagen IN (0, 1));
```

Dat deel is een gewone `ALTER`. Maar `periodes.soort` kreeg een derde geldige
waarde (`'feestdag'`, naast `'vakantie'` en `'examens'`) — een gewijzigde
`CHECK` kan SQLite niet met `ALTER TABLE`, dat vraagt een tabel-heropbouw:
nieuwe tabel aanmaken, data overzetten, oude tabel weg, hernoemen, index
opnieuw aanmaken. Beide stappen staan samen in **`migratie-feestdagen.sql`**.

**Getoetst tegen een nagemaakte bestaande installatie** — drie periodes (twee
vakanties, één examenperiode, een mix van bron `club` en `openholidays`) —
vóór en na de migratie: aantal rijen gelijk, elke naam/soort/bron ongewijzigd,
de index terug aanwezig, en een nieuwe `feestdag`-rij lukt daarna probleemloos.

Draai daarna `schema-controle.sql`: `ALLES OK`.

## Configuratie

Niets.

## Aanleiding

Bij het bevestigen van de OpenHolidays-fix (punt AA) kwam de vraag of ook
Belgische feestdagen geladen kunnen worden, met een belangrijke nuance: som­
mige zalen zijn wél beschikbaar op een feestdag, maar dat is niet de regel.

## Het model

**Een feestdag is een eigen `soort` in `periodes`**, niet hetzelfde als een
vakantie — een feestdag is één dag, geen week, en een training erop wordt om
een andere reden overgeslagen (de zaal is dicht) dan bij een vakantie (het
team wil niet trainen).

**`zalen.open_op_feestdagen`, standaard uit.** Een eigenschap van de zaal
zelf, volledig los van `trainingsreeksen.vakantie_doorlopen` — dat laatste is
een keuze van het team voor een echte vakantieweek, dit is een fysieke
beperking van de locatie. Een reeks die vakanties doorloopt, doorloopt een
feestdag dus niet automatisch mee; dat vraagt een zaal die zelf `open_op_feestdagen`
heeft. Omgekeerd: een zaal die open is op feestdagen, respecteert nog steeds
`vakantie_doorlopen = 0` — dat de hal fysiek open kan, betekent niet dat het
team tijdens zijn eigen vakantie wil trainen. Beide kruisgevallen staan
apart getest.

**`GET /PublicHolidays`** is een aparte endpoint bij OpenHolidays, los van
`/SchoolHolidays` — bevestigd via de officiële OpenAPI-specificatie. Geen
subdivisie- of groepscode nodig, een feestdag geldt landelijk.

**Niet rechtstreeks bevestigd:** een aanroep met `countryIsoCode=BE` en
2026-data gaf tweemaal een echte 400-fout bij het testen vanuit de sandbox,
zonder dat de precieze oorzaak daar te achterhalen was. Draai daarom eerst een
droogloop op de Worker (`POST /api/admin/periodes/feestdagen-sync`) vóór je
uitvoert.

## Wat er wijzigt

Bij Dagelijks beheer → Schoolvakanties en examens: een knop **Feestdagen
ophalen bij OpenHolidays**, naast de bestaande vakantieknop — zelfde
droogloop-aanpak, zelfde bescherming van een handmatige correctie (bron
`club` wordt nooit overschreven). Bij het handmatig toevoegen van een periode
is `feestdag` nu een keuzeoptie naast vakantie en examens.

Bij Configuratie → Zalen: een schakelaar per zaal, **open op feestdagen**,
standaard uit. Bewaart meteen bij het aanklikken; een fout zet de schakelaar
terug in de vorige stand.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `schema.sql`, `schema-alles-in-een.sql`, `schema-kaal.sql`, `schema-controle.sql` | `periodes.soort` met `feestdag`, `zalen.open_op_feestdagen` |
| `migratie-feestdagen.sql` | nieuw: de tabel-heropbouw voor een bestaande installatie |
| `src/lib/vakanties.js` | `feestdagUrl()`, `naarFeestdagPeriodes()`, `haalFeestdagen()` |
| `src/lib/trainingsgenerator.js` | feestdag als eigen, aparte regel vóór de vakantiecontrole |
| `src/routes/admin/periodes.js` | `feestdagenSync()`, vakantie- en feestdagensync samengetrokken tot een gedeelde kern |
| `src/routes/admin/zalen.js` | `zetOpenOpFeestdagen()` |
| `src/routes/admin/trainingsreeksen.js` | geeft de zaal-instelling door aan de generator |
| `src/index.js` | drie routes ingehaakt |
| `public/js/schermen/trainingen.js` | `synchroniseerFeestdagen()`, schakelaar per zaal |
| `public/index.html` | knop, keuzeoptie, kolom |
| `public/js/app.js` | knop ingehaakt |
| `test/trainingsgenerator.test.mjs`, `test/vakanties.test.mjs`, `test/zalen-routes.test.mjs`, `test/trainingsreeksen-routes.test.mjs`, `test/frontend.test.mjs` | uitgebreid |
| `src/versie.js` | 0.14.3 → 0.15.0 |

## Tests

559, allemaal groen. Vier fouten ingebouwd ter controle: de zaal-instelling
niet checken bij een feestdag (5 rood), feestdag per ongeluk aan
`vakantie_doorlopen` koppelen in plaats van aan de zaal (4 rood) — precies de
fout die het model bewust vermijdt.

**Onderweg gevonden en hersteld:** bij het toevoegen van de nieuwe zaalroute
verving een eigen bewerkingsfout de volledige inhoud van `sluitingAanmaken`
door enkel de openingsregel. Brak dertien testbestanden tegelijk bij de
eerstvolgende volledige suite-run; hersteld en bevestigd.

## Daarna

Punt AA (de OpenHolidays-vakantiefix) en deze feestdagensync wachten beide op
dezelfde bevestigingsstap: een droogloop draaien vanaf de echte Worker.
