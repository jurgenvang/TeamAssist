# TeamAssist 0.38.0 — I1 fase 4a: het scherm van een official

Vorige versie: 0.37.0

Het eerste scherm van de module Officials. Fase 4 is opgedeeld: 4a (dit),
4b Cluboverzicht, 4c Vergoedingen club, 4d Regio en beheer, 4e tabbladen per
stuk uitzetten. YOAssist blijft live.

## Databank

Geen wijziging. `main` mag meteen vooruit.

## Wat er bijkwam

**Tabblad Aanduidingen** (`public/js/schermen/aanduidingen.js`), vooraan in
de tabbalk voor wie de rol YO of YO+ heeft, en voor een ouder van een
official. Zoals in YOAssist:
- drie secties: *Je bent aangeduid*, *Nog te beantwoorden* (deze en volgende
  maand; de rest op vraag), *Je hebt geantwoord*;
- de indeling ligt vast per bezoek (de kaart die je aantikt, springt niet
  weg); de teller telt wel meteen mee;
- per wedstrijd: datum, ploegen, uitslag, forfait, categorie, de zaal (naar
  Google Maps), het wedstrijdblad, de scheidsrechters van de bond, REF1/REF2
  met bellen en WhatsApp bij een collega die samen met jou fluit en zijn
  nummer deelt;
- Beschikbaar / Niet beschikbaar (een tweede tik wist het antwoord), of —
  aangeduid — het opkomstuur en *Probleem melden*;
- een ouder kiest bovenaan voor welk kind; elke oproep geeft `namens` mee.

**Mijn vergoeding** in het naammenu (`mijn-vergoeding.js`): per maand de
regels, het totaal en de wedstrijden; de lopende maand met 'kan nog wijzigen';
het seizoenstotaal enkel wat afgesloten is.

**Bij Mijn voorkeuren, als official** (`officials-voorkeuren.js`): de
herinnering de avond ervoor en de ochtend zelf, het gsm-nummer delen, en de
agendalink (op het klembord; een nieuwe link vraagt bevestiging).

**Backend:**
- `/api/mij` geeft `officials_kinderen`: de kinderen van deze ouder met rol
  YO of YO+.
- `GET/POST /api/officials/voorkeuren[?namens=]` — wie geen rij heeft, krijgt
  alles aan; enkel wat meegegeven is, verandert.
- `navigatie.js`: een tabblad met `ouder: true` staat er ook voor een ouder
  van een official. Een beheerder zonder rol YO ziet Aanduidingen niet:
  beheren is geen fluiten.

`public/js/officials-hulp.js` bundelt de zuivere hulpjes (dag, maand, sectie,
forfait, gsm-nummer voor WhatsApp, bedrag), zodat ze zonder browser te testen
zijn.

## Getest

964 tests (was 954). `test/officials-schermen.test.mjs` (9),
`test/navigatie.test.mjs` aangepast en uitgebreid. Rood gezien tegen:
- een forfait als 'nog te beantwoorden';
- `namens` vergeten bij het antwoorden;
- kinderen die geen official zijn toch meegeven;
- een voorkeur die niet meegegeven werd, terug op 'aan' zetten (eerst groen:
  de test zette er maar één — aangescherpt);
- een ouder die het tabblad niet ziet;
- de voorkeuren zonder rechtencontrole;
- een gsm-nummer zonder landcode in de WhatsApp-link.

Daarnaast in Chromium bekeken, met een nep-API in de vorm van de echte
antwoorden: een ouder met twee kinderen, alle soorten kaarten, antwoorden,
probleem melden, van kind wisselen, Mijn vergoeding, voorkeuren en de
agendalink — geen fouten in de console, en `namens` ging overal mee. Op een
smal scherm stonden de knoppen eerst onder elkaar en zagen Beschikbaar en
Niet beschikbaar er hetzelfde uit; rechtgezet (kleiner, enkel de gekozen
knop gevuld).
