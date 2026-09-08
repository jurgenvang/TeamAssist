# TeamAssist 0.22.0 — T13: automatische synchronisatie

Vorige versie: 0.21.0

## Databank

Niets.

## Configuratie

Niets. **Belangrijk gedragsverschil, geen instelling om aan te zetten:**
zodra dit gedeployed is, loopt de synchronisatie automatisch. Zie hieronder.

## Aanleiding

Het grootste vastgestelde functionele gat: de uurcron deed tot nu toe enkel
de `supabase-ping` om 4 uur. Wedstrijden, ploegen en leden werden uitsluitend
opgehaald wanneer een beheerder handmatig op een knop klikte. Dat ondergroef
rechtstreeks de meldingen uit 0.18.0 en 0.21.0: een wedstrijdwijziging
verwittigt pas wanneer er toevallig gesynchroniseerd wordt.

## Wat er wijzigt

**`src/lib/planner.js`** — een zuivere functie, `takenVoorUur(uur, dag)`, die
enkel beslist wélke taak op welk Brussels uur moet lopen:

| Wanneer | Taak |
|---|---|
| 0, 6, 12, 18 uur | Wedstrijden (per gevolgde ploeg) — vier keer per dag, zoals YOAssist |
| 3 uur, elke dag | Ploegen en leden — wijzigen veel trager dan de kalender |
| Maandag 5 uur | Vakanties, examens en feestdagen |
| 4 uur | De bestaande `supabase-ping`, ongewijzigd |

**`src/lib/geplandetaken.js`** — voert die taken echt uit, met dezelfde
fout-opvang als de bestaande ping: elke run komt in `taak_runs`, en twee
opeenvolgende mislukkingen geven een onafgehandelde logboekregel (één
mislukking op zich wordt wel gelogd, maar niet als alarmerend gemarkeerd).

**Bewust dezelfde functies als een handmatige synchronisatie** —
`wedstrijdenSync`, `teamsSync`, `ledenSync`, `vakantiesSync`, `feestdagenSync`
— geen tweede kopie van die logica. Dat betekent ook: **een automatische
wedstrijdwijziging verwittigt nu echt, zonder dat een beheerder ernaar hoefde
te klikken.** Dat was het hele punt van dit pakket, geen neveneffect.

**Een lege uitgangspositie (nog geen enkele gevolgde ploeg) telt niet als
mislukking.** Voor een verse installatie is dat de normale beginstand, geen
storing — twee keer na elkaar 'niets gevolgd' hoeft niemand te alarmeren.

## Een echte fout gevonden tijdens het testen

`wedstrijdenSync` vangt een mislukking per ploeg intern op (zodat één ploeg
met een probleem de andere niet blokkeert) en geeft toch status 200 terug,
met de mislukte ploeg gemarkeerd in het antwoord zelf. Mijn eerste versie van
`voerTaakUit` controleerde enkel de HTTP-status — een test met een
gesimuleerde 500 bij VBL zou daardoor stil als 'ok' doorgekomen zijn.
Rechtgezet: de wrapper controleert nu ook of `body.ploegen` een mislukte
ploeg bevat.

**Ook een fout in mijn eigen testverwachting gevonden en gecorrigeerd**, niet
in de code: ik nam aan dat een eerste mislukking nog niet gelogd zou worden
(pas de tweede), maar het bestaande, bewust hergebruikte pingpatroon logt bij
élke mislukking — enkel de `afgehandeld`-vlag verschilt tussen de eerste en de
tweede keer. De test paste zich aan het echte, juiste patroon aan, niet
omgekeerd.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/planner.js` | nieuw: `takenVoorUur()` |
| `src/lib/geplandetaken.js` | nieuw: `voerGeplandeTakenUit()` |
| `src/index.js` | `scheduled()` gebruikt nu de planner in plaats van enkel `uur === 4` |
| `test/planner.test.mjs` | nieuw: 8 tests |
| `test/geplandetaken.test.mjs` | nieuw: 10 tests |
| `src/versie.js` | 0.21.0 → 0.22.0 |

## Tests

660, allemaal groen. Drie fouten ingebouwd ter controle: de per-ploeg-
mislukking niet detecteren (enkel HTTP-status) — 2 rood; een lege
uitgangspositie toch als fout behandelen — 1 rood; wedstrijden op elk uur
laten lopen in plaats van enkel 0/6/12/18 — 2 rood.

## Let op bij het uitrollen

Dit is de eerste versie die zonder enige klik echte berichten kan versturen.
`bericht_modus` staat bij een nieuwe installatie op `'omleiden'`, dus er
vertrekt niets naar een echt adres tot die instelling bewust op `'normaal'`
gezet wordt — maar het is de moeite waard om dat expliciet te controleren
vóór deze versie live gaat, precies omdat de synchronisatie voortaan zonder
toezicht draait.
