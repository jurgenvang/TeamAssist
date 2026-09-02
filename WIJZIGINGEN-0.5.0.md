# TeamAssist 0.5.0 — spelers en staf laden

Vorige versie: 0.4.0. Tweede pakket van fase 2.

## Databank

**Niets.** Alle kolommen die hiervoor nodig zijn, stonden al in het schema:
`personen` heeft `rel_guid`, `lid_nr`, `naam_vbl`, `naam_bron` en
`geboortedatum_bron`; `team_spelers` en `rollen` dragen allebei een `bron`.
`schema-controle.sql` wijzigt enkel door het versienummer.

## Configuratie

Niets.

## Wat er wijzigt

**`POST /api/admin/leden/sync`**, achter het recht `personen.beheren`. Haalt per
gevolgde ploeg `TeamDetailByGuid` op en legt spelers en staf naast de club.
Standaard een droogloop; uitvoeren vraagt `?uitvoeren=1`. Met `?team=<guid>` voor
één ploeg.

In het scherm staat er een knop **Spelers en staf ophalen** bij, die eerst toont
wat er zou gebeuren, inclusief de twijfelgevallen.

### Wat er vastligt

**Matchen gebeurt in twee stappen.** De relatie-GUID is de harde sleutel. Bestaat
die nog niet in de club, dan wordt er op naam en geboortedatum gezocht — maar
enkel wanneer dat precies één persoon oplevert. Zo wordt een coach die al als
persoon bestond gekoppeld in plaats van gedupliceerd.

**Bij twijfel gebeurt er niets.** Twee naamgenoten, of dezelfde naam met een
andere geboortedatum: die gaan naar een lijst en worden overgeslagen. Twee
personen verkeerd tot één maken is niet terug te draaien.

**De bron-vlag beslist.** Een naam of geboortedatum die op `club` staat, is
handmatig rechtgezet en wordt niet overschreven — precies waarvoor die vlag
bestaat, want de splitsing van een dubbele voornaam met een spatie loopt anders
elke synchronisatie opnieuw mis.

**Een lege of sterk geslonken spelerslijst haalt niemand uit de ploeg.** Aan het
begin van een seizoen loopt de bond weken achter op de werkelijkheid; dat is de
normale toestand, geen storing. Verdwijnt meer dan een derde tegelijk, dan
gebeurt er niets en krijgt de ronde status `deels`.

**Wie wel verdwijnt, blijft in de ploeg staan** met `bij_bond = 0`. Er komen
aanwezigheden aan te hangen.

**Enkel gevolgde ploegen.** Een ploeg waar de club niets mee doet, hoeft geen
gegevens van minderjarigen in de databank te hebben staan.

**Eén stukke ploeg houdt de rest niet tegen.** Een fout wordt per ploeg
opgevangen en gelogd; de andere ploegen gaan door.

**De staf wordt gevolgd.** Wie in `tvlijst` staat, krijgt de rol COACH met bron
`vbl`. Een handmatig toegevoegde coach draagt bron `club` en wordt nooit
weggesynchroniseerd.

### Twee bouwstenen uit de bevindingen van M

`src/lib/datum.js` leest beide formaten van de bond — `dd-mm-jjjj` en
`dd-mm-jjjj uu:mm` — en geeft null terug bij alles wat niet met zekerheid te
lezen valt. Een onleesbare datum komt in het plan te staan in plaats van stil als
'geen geboortedatum' door te gaan.

`src/lib/naam.js` splitst op de **eerste** spatie. Op de dertien spelers van de
nagekeken ploeg klopt dat overal, ook bij `van Geijstelen Forier` en `Muñiz
Espinoza`; splitsen op de laatste spatie zou daar juist misgaan.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/datum.js` | nieuw |
| `src/lib/naam.js` | nieuw |
| `src/lib/ledensync.js` | nieuw: het plan als zuivere functie |
| `src/routes/admin/leden.js` | nieuw: de route |
| `src/index.js` | route ingehaakt |
| `public/index.html` | knop en samenvatting |
| `test/ledensync.test.mjs` | nieuw, negentien tests |
| `test/leden-routes.test.mjs` | nieuw, elf tests |
| `src/versie.js` | 0.4.0 → 0.5.0 |
| `schema-controle.sql` | enkel het versienummer |

## Tests

179, allemaal groen. Drie fouten ingebouwd ter controle: bij twijfel toch
aanmaken maakt 1 test rood, de bron-vlag negeren 1, en ook niet-gevolgde ploegen
ophalen 5.

## Daarna

Het sjabloon voor wat de bond niet heeft: e-mail, telefoon, adres en de
ouder-kindkoppeling.
