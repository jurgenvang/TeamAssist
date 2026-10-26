---
name: vbl-api
description: Werken met de Basketbal Vlaanderen (VBL/Wisseq) wedstrijd-API op vblcb.wisseq.eu. Gebruik deze skill zodra het gesprek gaat over wedstrijdkalenders, uitslagen, standen of teams van Basketbal Vlaanderen, over GUID's in de vorm BVBL1053J16 1, over de endpoints TeamMatchesByGuid / OrgMatchesByGuid / TeamDetailByGuid / OrgDetailByGuid, of over het bouwen van een clubkalender, iCal-feed of scraper rond Vlaamse basketbaldata. Ook gebruiken bij vragen over de velden wedOff, jsDTCode, gespeeld of uitslag, en wanneer iemand "de basketbalAPI", "Wisseq" of "VBL" vermeldt zonder verdere uitleg.
---

# Basketbal Vlaanderen (VBL) API

Ongedocumenteerde-maar-werkende JSON-API achter Sportbeheer Online. Geen authenticatie,
geen API-key, geen rate limiting die we tegenkwamen. Werkt over HTTP.

**Basis-URL:** `http://vblcb.wisseq.eu/VBLCB_WebService/data`

De officiële spec (versie 1.1, november 2015) staat op
`https://www.basketbal.vlaanderen/documenten/Clubondersteuning/ApiDocV2.pdf`
maar is onvolledig: de API geeft intussen 16 velden terug in plaats van 13.

## Gebruiksvoorwaarden

De spec beperkt gebruik tot het integreren van kalenders, uitslagen en rangschikkingen
op websites van **aangesloten clubs**. Andere partijen moeten eerst
info@basketbal.vlaanderen contacteren. Vermeld dit wanneer iemand een publieke app,
commerciële dienst of grootschalige scraper bouwt — niet als waarschuwing bij elk
scriptje voor de eigen ploeg.

Het veld `wedOff` bevat namen van scheidsrechters. Dat zijn persoonsgegevens: niet
zomaar publiceren of loggen zonder reden.

## Endpoints

| Endpoint | Parameter | Geeft |
|---|---|---|
| `TeamMatchesByGuid` | `teamguid` | alle wedstrijden van één team |
| `OrgMatchesByGuid` | `issguid` | alle wedstrijden van een hele club |
| `TeamDetailByGuid` | `teamguid` | team, spelerslijst, staf én de poulestand |
| `OrgDetailByGuid` | `issguid` | club, adres, accommodaties, bestuur, teams |
| `RelatiesByOrgGuid` | `orgguid` | ledenlijst van een club |

Er is **geen endpoint voor één losse wedstrijd**. Haal de lijst op en filter op `wedID`
of `guid`.

## GUID's

**Club:** `BVBL1053` — vier cijfers na het voorvoegsel.

**Team:** `BVBL1053J16  1` = clubcode + categorie (`J16`, `HSE`, `G12`, ...) +
opvulling tot vaste breedte + volgnummer. Let op de **spaties**, meestal twee.
In een URL worden dat `%20%20`; de oude spec schrijft ze als `++`.

Normaliseer invoer altijd, want mensen plakken de GUID in alle vormen:

```python
def normalize_guid(guid: str) -> str:
    guid = guid.strip().rstrip("#")          # fragmentteken uit gekopieerde URL's
    if "%" in guid:
        guid = urllib.parse.unquote(guid)    # BVBL1053J16%20%201
    return guid.replace("+", " ")            # BVBL1053J16++1
```

Encodeer met `quote_via=urllib.parse.quote` zodat je `%20` krijgt en geen `+`.

GUID's opzoeken doe je via `vblweb.wisseq.eu`: navigeer naar de club of het team,
de codes staan in de URL's.

**Wedstrijd-GUID's zijn samengesteld en dus zelf leesbaar:**
`BVBL` + `2627` (seizoen 2026-27) + `9170` (regio) + `INJ1621F` (poule) + `AB` (wedstrijd).
Daarom geldt: `pouleGUID == wedstrijd-guid[:-2]`. Je hoeft de poule dus niet apart op
te vragen. Regiocode `9100` bleek de Beker van Vlaanderen, `9170` de interprovinciale
reeksen, `9120` Limburg.

## De 16 velden

| Veld | Type | Opmerking |
|---|---|---|
| `guid` | str | stabiele sleutel — gebruik deze voor caching en sync |
| `wedID` | str | poulecode + wedstrijdcode + volgnummer |
| `tTGUID` / `tTNaam` | str | **thuis**ploeg |
| `tUGUID` / `tUNaam` | str | **uit**ploeg (bezoekers) |
| `datumString` | str | `dd-mm-yyyy` |
| `beginTijd` | str | `"10.30"` — punt, geen dubbelpunt |
| `jsDTCode` | int | epoch in **milliseconden**, zie valkuil hieronder |
| `gespeeld` | str | `"G"` of `"N"`, zie valkuil hieronder |
| `uitslag` | str | `" 63- 92"` met opvulspaties, leeg indien niet gespeeld |
| `accGUID` / `accNaam` | str | accommodatie |
| `pouleGUID` / `pouleNaam` | str | reeks |
| `wedOff` | list \| null | aangeduide officials, zie valkuil hieronder |

## Valkuilen

Deze vier kosten anders elk een debugronde.

**`jsDTCode` bevat de lokale wandkloktijd verpakt als UTC-epoch.** Geverifieerd op
records in zomer- én wintertijd: `1794652200000` leest als 14-11-2026 10:30 UTC terwijl
de wedstrijd om 10:30 Belgische tijd begint. Converteer je met een tijdzone, dan schuift
alles een of twee uur op. Gebruik `datumString` + `beginTijd`, of lees `jsDTCode` als
naïef.

**`gespeeld` is `"G"`, niet `"J"`.** Voor de hand liggend na de feiten, maar `"J"` voor
"ja" is de intuïtieve gok en die is fout — het is `"G"` van gespeeld tegenover `"N"` van
niet gespeeld. Andere codes (forfait, uitgesteld) zijn niet uitgesloten, dus test op
`vlag not in ("N", "")` in plaats van op gelijkheid met `"G"`, en beschouw een ingevulde
uitslag als extra bewijs.

**`wedOff` wisselt van type.** Het is `null` zolang er geen scheidsrechters aangeduid
zijn en wordt dan een lijst met namen. Behandel het nooit blind als lijst.

**`uitslag` staat altijd als thuis-uit.** Speelt jouw team uit, dan moet je de score
omdraaien voor je wint/verlies bepaalt. Splits op `-` en strip; de opvulspaties zitten
op wisselende posities, dus geen vaste indexen gebruiken.

## Verder over de responses

Records komen **niet op datum gesorteerd** terug — sorteer zelf.

`TeamMatchesByGuid` mengt **meerdere competities**: een U16-team kreeg 13 wedstrijden
terug, waarvan 3 uit de Beker van Vlaanderen en 10 uit de reguliere reeks. Splits op
`pouleGUID` als je ze apart wil.

De lijst bevat zowel gespeelde als toekomstige wedstrijden — geen extra call nodig voor
het volledige seizoen. `uitslag` en `wedOff` vullen zich gaandeweg aan terwijl `guid`
stabiel blijft.

Responses kunnen een BOM hebben: decodeer met `utf-8-sig`.

## Meegeleverde scripts

`scripts/vbl_api_test.py` — ruwe verkenning. Toont de unie van alle veldnamen over alle
records (zo ontdek je nieuwe ongedocumenteerde velden) en print records volledig uit.

```
python vbl_api_test.py team "BVBL1053J16  1"
python vbl_api_test.py team "BVBL1053J16  1" --wedid INJ1621FAB08
python vbl_api_test.py clubdetail BVBL1053 --raw
```

`scripts/vbl_kalender.py` — genormaliseerde kalender plus iCal-export. Rekent thuis/uit
uit vanuit het opgegeven team, draait scores om waar nodig, en schrijft UTC-tijden met
`Z` zodat er geen `VTIMEZONE`-blok nodig is. De `UID` van elk event is de wedstrijd-GUID,
zodat heropladen bestaande agenda-items bijwerkt in plaats van dupliceert.

```
python vbl_kalender.py --guid "BVBL1053J16  1" --ics kalender.ics
python vbl_kalender.py --guid "BVBL1053J16  1" --json
python vbl_kalender.py --file bewaarde_response.json --guid "BVBL1053J16  1"
```

Beide scripts gebruiken enkel de standaardbibliotheek. De zomertijdberekening zit met
opzet handmatig in `vbl_kalender.py`, omdat `zoneinfo` op Windows het `tzdata`-package
nodig heeft dat er vaak niet is.

## Als de API onbereikbaar is

In een sandbox met een egress-allowlist geeft de proxy `403` met header
`x-deny-reason: host_not_allowed`. Dat is geen fout van Wisseq. Zeg dan dat
`vblcb.wisseq.eu` aan de toegelaten domeinen moet, en gebruik intussen `--file` om met
een bewaarde response te werken.
