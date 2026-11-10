# TeamAssist 0.41.0 — I1 fase 4d: Regio en de beheerdelen

## Wat en waarom

De laatste schermen van de officials uit YOAssist. De backend stond er al
sinds 0.34.0–0.37.0. Er is één nieuwe route bij (de instellingen hieronder).

**Tabblad Regio**, voor wie de officials beheert (YOADM, ADMIN). Het toont
de wedstrijden bij gevolgde clubs met nul of één scheidsrechter, de komende
twee weekends, per dag. De kaart is die van YOAssist (de regel uit T21):

- het uur;
- de ploegen;
- de categorie en de club;
- een link naar het wedstrijdblad;
- een rode rand bij geen scheidsrechter, een oranje rand bij één, met de
  naam van die scheidsrechter.

Per dag staat er waar de cijfers vandaan komen: *volgens de lijst van de
bond*, of *volgens de API — de lijst van de bond volgt woensdag*.

**Dagelijks beheer en Configuratie, ook voor een YOADM.** Zoals beslist
(Jurgen, 10 november 2026) staan de beheerdelen van de officials waar
YOAssist ze had. Elke sectie zegt voor wie ze is, met `data-recht`. Een
YOADM ziet enkel de secties van de officials. Een ADMIN ziet alles. Elk
deel laadt enkel voor wie het mag, zodat een YOADM geen 403 krijgt op de
instellingen van de club. Zaalbeheer blijft enkel voor ADMIN.

- **Dagelijks beheer** krijgt twee secties:
  - *Woensdaglijst van de bond*: de lijsten van de laatste weken, met hun
    status, de fout, hoeveel eigen wedstrijden erin stonden, of 'geen
    wedstrijden zonder scheidsrechter' bij een lege lijst (V44);
  - *Synchronisatie van de officials*: eerst zie je wat er zou veranderen,
    dan *Uitvoeren*.
- **Configuratie** krijgt drie secties:
  - *Regio*: clubs volgen en weghalen, nu synchroniseren, en de
    wedstrijdenlijst leegmaken. Leegmaken telt eerst en vraagt dan
    bevestiging;
  - *Forfait*: automatisch vrijgeven, of enkel de beheerders verwittigen;
  - *Extern lezen*: initialen of volledige namen.

**Nieuwe route** `GET/POST /api/admin/officials/instellingen`, met het recht
`officials.beheren`. Ze kan enkel `forfait_aanduiding` en `extern_namen`
lezen en schrijven. De route naar de instellingen van de club vraagt
`systeem.beheren`, en een YOADM is geen beheerder van de hele club.
`officials_automatisch` (de overstap) blijft bij ADMIN.

De navigatie kent nu een lijst van rechten per tabblad, waarvan er één
volstaat.

## Databank

Geen schemawijziging. `schema-controle.sql` is opnieuw gegenereerd voor het
versienummer.

## Tests

995, allemaal groen. Nieuw is `test/officials-beheer.test.mjs` (6 tests).
Die dekt:

- de instellingen van de module: de standaard, bewaren met een regel in
  het logboek, en een weigering van elke andere sleutel (ook
  `officials_automatisch`);
- dat de routes van 4d `officials.beheren` vragen;
- wie wat ziet (YOADM en coach);
- dat elke sectie een `data-recht` heeft, en dat elk deel enkel laadt voor
  wie het mag;
- dat synchroniseren en leegmaken eerst tonen wat er zou gebeuren;
- Regio: de bron per dag, de ontsmetting, het wedstrijdblad.

`navigatie.test.mjs` en `frontend.test.mjs` zijn aangepast aan Regio en aan
de twee panelen voor een YOADM.

Rood tegen de fout, telkens één keer gedraaid:

- de bron van een dag met `some` in plaats van `every`;
- de instellingen van de club laden zonder het recht na te kijken;
- een waarde buiten de keuzes aanvaarden.

In Chromium bekeken tegen de echte handlers op een testdatabank:

- als YOADM:
  - het tabblad Regio met drie wedstrijden op twee dagen, één dag volgens
    de lijst en één volgens de API;
  - in Dagelijks beheer en Configuratie enkel de secties van de officials;
  - de woensdaglijsten met een fout en een lege lijst;
  - Forfait op *melden* gezet, een club toegevoegd en de lijst leeggemaakt
    na bevestiging;
- als ADMIN: alle secties.

Er werd geen enkele oproep geweigerd en er waren geen fouten in de browser.
De bond is vanuit de proef niet bereikbaar; de synchronisaties tonen dan
hun foutmelding.

## Vorm van een API-antwoord

Nieuw: `/api/admin/officials/instellingen`. Er is niets gewijzigd aan
bestaande antwoorden.
