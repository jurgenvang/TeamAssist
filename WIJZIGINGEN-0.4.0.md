# TeamAssist 0.4.0 — ploegen laden bij de bond

Vorige versie: 0.3.2. Eerste pakket van fase 2.

## Databank — actie nodig

De tabel `teams` krijgt drie kolommen en één daarvan draagt een CHECK. Een CHECK
toevoegen kan niet met `ALTER TABLE`, dus moet deze tabel opnieuw opgebouwd
worden. Dat is nu goedkoop: er staan nog geen ploegen in.

```sql
DROP TABLE teams;
```

Voer daarna het `CREATE TABLE teams`-blok uit `schema-kaal.sql` uit. Geen enkele
andere tabel wordt aangeraakt: je personen, rollen en instellingen blijven staan.

Draai daarna `schema-controle.sql` — er hoort `ALLES OK` te komen.

Wat erbij komt:

| Kolom | Waarvoor |
|---|---|
| `onderwijsgroep` | bepaalt straks welke examenperiodes op de ploeg slaan; afgeleid uit de categorie |
| `bij_bond` | staat de ploeg nog bij de bond? Verdwijnt ze daar, dan gaat deze vlag op 0 en blijft de rij bestaan |
| `laatst_gezien` | wanneer de bond de ploeg voor het laatst teruggaf |

## Configuratie

Niets.

## Wat er wijzigt

Drie beheerroutes, alle drie achter `systeem.beheren`:

- `GET /api/admin/teams` — de ploegen van het actieve seizoen
- `POST /api/admin/teams/sync` — synchroniseren; **standaard een droogloop**,
  uitvoeren vraagt `?uitvoeren=1`
- `POST /api/admin/teams/gevolgd` — aanvinken welke ploegen TeamAssist beheert

In het scherm staat er voor een beheerder een sectie **Ploegen** bij, met een
lijst, aanvinkvakjes en een knop die eerst toont wat er zou gebeuren.

### Wat er vastligt in deze versie

**De categorie komt uit de GUID, niet uit de naam.** `BVBL1125J16  2` levert
`J16` op. De naam wisselt van jaar tot jaar en van invoerder tot invoerder; de
code niet.

**Een nieuwe ploeg staat op niet-volgen.** Ook wanneer haar categorie bekend is.
Ze stilzwijgend meenemen zou betekenen dat er trainingen en aanwezigheden aan
hangen voor een werking die niemand bedoeld heeft.

**Een verdwenen ploeg wordt gemarkeerd, nooit verwijderd** — er komen spelers en
aanwezigheden aan te hangen.

**Een leeg of sterk geslonken antwoord zet niets weg.** Verdwijnt meer dan een
derde van de ploegen tegelijk, dan gebeurt er niets, krijgt de ronde status
`deels`, en blijft er een onafgehandelde regel in het logboek staan. Bij een
storing bij de bond zou anders in één keer de hele werking van de club
verdwijnen.

**De synchronisatie overschrijft `gevolgd` en `onderwijsgroep` niet.** Dat zijn
keuzes van de club, geen gegevens van de bond.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/categorie.js` | nieuw: categorie uit de GUID, onderwijsgroep per categorie |
| `src/lib/teamsync.js` | nieuw: het plan als zuivere functie, met de veiligheidsrem |
| `src/routes/admin/teams.js` | nieuw: de drie routes |
| `src/lib/vbl.js` | `leesPloegen` erbij: ploegen met naam uit het clubantwoord |
| `src/index.js` | de routes ingehaakt |
| `schema.sql` | `teams` uitgebreid |
| `schema-alles-in-een.sql`, `schema-kaal.sql`, `schema-controle.sql` | hergenereerd |
| `public/index.html` | ploegenscherm; `api()` kan nu ook POST |
| `test/teamsync.test.mjs` | nieuw, veertien tests |
| `test/teams-routes.test.mjs` | nieuw, twaalf tests |
| `src/versie.js` | 0.3.2 → 0.4.0 |

## Tests

149, allemaal groen. Drie fouten ingebouwd ter controle: de veiligheidsrem
weghalen maakt 3 tests rood, een nieuwe ploeg meteen op gevolgd zetten 1, en de
droogloop toch laten uitvoeren 2.

## Daarna

Het volgende pakket is de spelers en de staf van elke gevolgde ploeg.
