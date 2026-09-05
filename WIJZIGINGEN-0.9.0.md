# TeamAssist 0.9.0 — wedstrijden ophalen bij de bond

Vorige versie: 0.8.0. Tweede pakket van fase 3.

## Databank — één instellingsrij

De tabel `wedstrijden` stond er al sinds 0.8.0. Er komt één instellingsrij bij:

```sql
INSERT INTO instellingen (sleutel, waarde) VALUES
  ('stille_periodes', '[{"van_dag":"06-01","tot_dag":"08-15"},{"van_dag":"12-28","tot_dag":"01-03"}]');
```

Ontbreekt ze, dan valt de code terug op dezelfde standaardwaarden, dus dit is
geen harde vereiste. Draai daarna `schema-controle.sql`: die kijkt niet naar
instellingsrijen, dus hij zal hoe dan ook `ALLES OK` tonen — vandaar dat dit
apart vermeld wordt, net als bij de testrol-instelling in 0.7.0.

## Configuratie

Niets.

## Wat er wijzigt

**`POST /api/admin/wedstrijden/sync`** haalt per gevolgde ploeg
`TeamMatchesByGuid` op, thuis én uit — anders dan YOAssist, dat enkel
thuiswedstrijden nodig heeft. Standaard een droogloop. `GET
/api/admin/wedstrijden?team=…` toont wat er staat, voor wie de ploeg mag
bekijken.

**Nog niet bevestigd tegen een echt antwoord.** De veldnamen (`tTGUID`,
`datumString`, `beginTijd`, `accGUID`, `wedOff`) zijn afgeleid uit YOAssist, dat
dezelfde VBL-API al gebruikt voor thuiswedstrijden — maar nooit gecontroleerd
voor `TeamMatchesByGuid` zelf, zoals dat voor `TeamDetailByGuid` wél gebeurd is
(punt M in de backlog). De eerste synchronisatie op een echte ploeg is meteen de
test: komen er wedstrijden binnen met een leesbare datum en uur, dan klopt de
aanname.

### De hash bevat de uitslag niet

Wat bijgehouden wordt om een wijziging te herkennen: datum, uur, locatie,
tegenstander, thuis-of-uit. De uitslag zit er bewust niet in — die komt vanzelf
binnen zodra een wedstrijd gespeeld is, en is geen wijziging die iemand moet
worden gemeld. Een nieuwe uitslag wordt wel bijgewerkt, maar apart geteld
(`uitslag_bijgewerkt`) en komt niet in het logboek als wijziging.

### Stille periodes

Een wijziging binnen de stille periodes — rond het begin van een nieuw seizoen
en de wissel naar de tweede ronde — wordt niet als meldbaar gemarkeerd. De bond
herschikt de kalender daar toch, en anders worden begeleiders platgespamd met
iets dat ze niet kunnen beïnvloeden. De vensters staan als instelling
(`stille_periodes`, JSON) en niet hardcoded.

**Er is nog geen berichtsysteem** — dat komt bij fase 5. Tot dan verschijnt een
meldbare wijziging als onafgehandelde regel in het logboek, zodat een beheerder
het opmerkt.

### Dezelfde veiligheidsrem als bij ploegen en leden

Een leeg of sterk geslonken antwoord (meer dan een derde van de wedstrijden
tegelijk weg) zet niets weg en krijgt status `deels`. Een verdwenen wedstrijd
blijft bestaan met `bij_bond = 0` — er kunnen taken aan hangen zodra die er zijn
(tafel, tablet, ploegafgevaardigde — backlog punt T1).

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/vbl.js` | `teamMatchesUrl`, `leesWedstrijden` |
| `src/lib/datum.js` | `vblTijdNaarUur`: het VBL-uur (`10.30`, met een punt) |
| `src/lib/wedstrijdsync.js` | nieuw: het plan, de hash, de stille periodes |
| `src/routes/admin/wedstrijden.js` | nieuw |
| `src/index.js` | twee routes ingehaakt |
| `schema.sql` | instelling `stille_periodes` |
| `public/index.html` | sectie wedstrijden bij een ploeg |
| `public/js/schermen/trainingen.js` | `toonWedstrijden`, `synchroniseerWedstrijden` |
| `public/js/schermen/ploegen.js` | opent de wedstrijden bij het tonen van een ploeg |
| `public/js/app.js` | knop ingehaakt, gekoppeld aan de getoonde ploeg |
| `test/wedstrijdsync.test.mjs`, `test/wedstrijden-routes.test.mjs` | nieuw |
| `test/frontend.test.mjs` | twee tests erbij |
| `src/versie.js` | 0.8.0 → 0.9.0 |

## Tests

318, allemaal groen. Drie fouten ingebouwd ter controle: de uitslag in de hash
meenemen maakt 4 tests rood, de stille periode niet nakijken 2, en de
veiligheidsrem weghalen 2.

## Daarna

Fase 3 is daarmee rond wat het ophalen betreft. Wat nog open staat volgens de
backlog: de subdivisiecode van OpenHolidays bevestigen (U3), en de eerste echte
synchronisatie van wedstrijden om de veldnamen te verifiëren. Fase 4 —
aanwezigheden — kan daarna beginnen.
