# TeamAssist 0.26.0 — T1: taken bij een wedstrijd

Vorige versie: 0.25.0

## Databank — één nieuwe tabel

`wedstrijdtaken`, bijgevoegd als `migratie-wedstrijdtaken.sql`. Enkel
`CREATE TABLE IF NOT EXISTS` en `CREATE INDEX IF NOT EXISTS` — **veilig
herhaalbaar**, in tegenstelling tot de `ALTER TABLE`-migraties van eerdere
versies. Getoetst tegen een nagemaakte databank zonder die tabel: bestaande
wedstrijden blijven ongemoeid, de unieke index werkt, tweemaal draaien geeft
geen fout, `schema-controle.sql` bevestigt `ALLES OK`.

## Configuratie

Niets.

## Wat er wijzigt

Bij thuiswedstrijden tot en met U12 is er iemand nodig voor de klok; vanaf U14
ook voor de 24 seconden. Bij uitwedstrijden iemand voor de tablet. Een
ploegafgevaardigde is er altijd nodig. Die taakslots ontstaan nu automatisch
bij de wedstrijdsynchronisatie — onbezet, als open plaatsen die een beheerder
invult.

**Waar**: bij Ploegen → aanwezigheid van een wedstrijd, onder de selectie. Het
blok blijft weg bij een training, en bij een wedstrijd van een ploeg met een
onbekende categorie (die krijgt bewust geen taakslots — liever niets dan
verkeerd gokken).

**Wie mag toewijzen**: dezelfde kring als de selectie
(`team.selectie.beheren` — COACH, COORD, PLOEGV), geen apart recht.

**Wie komt in aanmerking**: elk actief clublid, geen beperking tot ouders van
spelers in dat team.

**Een toewijzing verwittigt** de betrokken persoon via `verwittig()` — de
derde trigger in fase 5, opnieuw zonder enige aanpassing aan
`verwittigen.js` zelf.

**Een probleem melden**: wie is toegewezen kan zijn taak niet zelf wijzigen,
wel een probleem melden. Dat gaat naar de begeleiding van dat team en komt
onafgehandeld in het logboek.

## Een eigen kandidatenroute, en waarom

De frontend had een lijst van alle actieve clubleden nodig. De voor de hand
liggende keuze was de bestaande `/api/admin/personen` (`personenZoeken`), maar
die bleek op twee punten niet te passen — nagekeken vóór het gebruik, niet
achteraf:

- ze vraagt `personen.beheren`, wat een COACH niet heeft;
- ze weigert bewust een volledige lijst zonder zoekterm ("zonder zoekterm de
  volledige ledenlijst teruggeven is een uitnodiging om ze ergens anders te
  laten belanden").

Daarom `GET /api/admin/wedstrijdtaken/kandidaten`: dezelfde rechtencontrole als
de rest van T1, en enkel `id`, `voornaam`, `achternaam` — niet de e-mail,
geboortedatum, lidnummer of rel_guid die `personenZoeken` wél meegeeft. Een
test bevestigt letterlijk dat de teruggegeven velden exact die drie zijn.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `schema.sql` + afgeleiden | tabel `wedstrijdtaken` |
| `migratie-wedstrijdtaken.sql` | nieuw, veilig herhaalbaar |
| `src/lib/wedstrijdtaken.js` | `takenVoorWedstrijd()` |
| `src/routes/admin/wedstrijdtaken.js` | tonen, toewijzen, probleem melden, kandidaten |
| `src/routes/admin/wedstrijden.js` | taakslots bij een nieuwe wedstrijd; `gevolgdePloegen()` geeft nu ook `categorie` |
| `src/index.js` | vier routes ingehaakt |
| `public/index.html` | taakblok bij het aanwezigheidsscherm |
| `public/js/schermen/aanwezigheid-beheer.js` | `toonTaken()` |
| `test/wedstrijdtaken.test.mjs` | 7 tests |
| `test/wedstrijdtaken-routes.test.mjs` | nieuw: 24 tests |
| `test/wedstrijden-routes.test.mjs` | 4 tests erbij |
| `test/frontend.test.mjs` | 3 tests erbij |
| `src/versie.js` | 0.25.0 → 0.26.0 |

## Tests

733, allemaal groen. Vijf fouten ingebouwd ter controle: de rechtencontrole
bij toewijzen weghalen (1 rood), de eigenaarscontrole bij probleem melden
weghalen (2 rood), een inactieve persoon toch toelaten (1 rood), de
kandidatenroute ook inactieve personen laten geven (1 rood), en de
kandidatenroute ook de e-mail laten meegeven (1 rood).

## Nog open binnen T1

Eerlijke verdeling/rotatie over het seizoen is bewust buiten scope gebleven —
zoals bij YOAssist's automatische aanvulling voor scheidsrechters, een eigen,
later te bouwen uitbreiding.
