# TeamAssist 0.37.0 — I1 fase 3f: de rest van de module Officials

Vorige versie: 0.36.0

Daarmee staat de volledige backend van de module Officials. Volgende stap:
fase 4, de schermen. YOAssist blijft live.

## Databank

Geen wijziging: de Regio-tabellen, `personen.agenda_sleutel` en de rollen
PLOEGV/COACH bestaan al. `main` mag meteen vooruit.

## Regio

`src/officials/regio.js`, alle met recht `officials.beheren`:
- `GET/POST /api/admin/officials/volg-clubs`, `POST …/volg-clubs/weg` — clubs
  volgen; de naam haalt de app bij de bond (OrgDetailByGuid). Niet de eigen club.
- Een eigen synchronisatie (`regio`), elke ochtend om 5 uur, en
  `POST /api/admin/officials/regio/sync`: per gevolgde club één
  OrgMatchesByGuid, enkel thuis, vanaf U14 (toelatingslijst), wat nog komt.
  Wat de woensdaglijst zei, blijft staan, tenzij de wedstrijd verschoof.
  Opruimen met een stempel per ronde, niet met een lijst GUID's (D1). Een
  kapotte club houdt de andere niet tegen.
- `GET /api/admin/officials/regio` — nul of één ref, het hoogste van API en
  lijst, met de bron ('lijst' of 'api') en de naam bij één ref.
- `POST /api/admin/officials/regio/leegmaken` — **nieuw: eerst een droogloop**
  (in YOAssist meteen), zoals alles wat wist.

## Forfait

`src/officials/forfait.js`, aangeroepen door de officials-sync: eigen
aanduidingen op een nieuw forfait worden vrijgegeven (met bericht) als het
forfait vóór de wedstrijddag gekend is en `forfait_aanduiding` op
'vrijgeven' staat; anders enkel gemeld aan de beheerders. Voorbij in een
afgesloten maand: niets. Volgt `officials_automatisch` — tot de overstap
doet YOAssist dit, en zou een official twee berichten krijgen.

## Van buitenaf lezen

`src/officials/extern.js`:
- `GET /api/extern/aanduidingen` — publiek, met `Authorization: Bearer
  <EXTERN_API_SLEUTEL>` (vergeleken zonder timing-lek); initialen tenzij
  `extern_namen` = 'volledig'.
- `GET /api/kalender/<sleutel>.ics` — publiek, de sleutel in de URL. Enkel de
  eigen aanduidingen. **Anders dan YOAssist** in Brusselse tijd
  (`TZID=Europe/Brussels` met VTIMEZONE): YOAssist schreef de lokale tijd als
  UTC weg, zodat een wedstrijd een of twee uur verschoven in de agenda stond.
  Dezelfde UID's (`<guid>@yoassist.org`): een overgezet abonnement ziet geen
  dubbels.
- `POST /api/officials/agenda { namens?, vernieuw? }` — de agendalink; een
  ouder kan die van zijn kind opvragen.
- `src/index.js`: routes met `prefix: true` (de kalender), en `yoassist.org`
  stuurt met 301 door naar `teamassist.clubassist.org`, behalve
  `/api/kalender/` en `/api/extern/` (I1, *Domein*).

## PV's en coaches

`src/officials/ploegtekort.js`: woensdag en donderdag 20 uur, aan de rollen
PLOEGV en COACH van de ploeg in het seizoen (in YOAssist twee eigen lijsten met
een sjabloon). Te weinig = bond + club < 2, ook buiten de aanduidingslijst;
geen forfait, geen onbekende categorie, geen bevestigde refs. Eén bericht per
persoon, via `verwittig()`. Als contact de YOADM's. Volgt `officials_automatisch`.

## Tests

954 (was 943). `test/officials-regio.test.mjs` (11). Rood gezien tegen:
- de toelatingslijst vanaf U14 weg;
- de woensdaglijst niet behouden; niet opruimen;
- een forfait op de dag zelf toch vrijgeven;
- de sleutel van de externe API niet nakijken;
- in de agenda ook andermans wedstrijden;
- de doorverwijzing ook voor de kalender;
- bevestigde refs toch melden; één bericht per wedstrijd i.p.v. per persoon;
- de afscherming `officials_automatisch` weg (ook bij het forfait via de sync);
- leegmaken zonder droogloop.

Bleef groen: de controle 'enkel thuiswedstrijden' in Regio weglaten. Die is
dubbel: `categorieUitGuid()` geeft al null als de thuisploeg niet van de
gevolgde club is, en dan valt de wedstrijd uit de toelatingslijst.

`test/routes.test.mjs`: de twee publieke routes en `/api/officials/agenda`
bewust toegevoegd.

## Bij de overstap

De secret `EXTERN_API_SLEUTEL` overnemen van YOAssist (README), `yoassist.org`
als eigen domein aan deze Worker hangen, en `officials_automatisch` aan.
