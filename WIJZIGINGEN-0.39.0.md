# TeamAssist 0.39.0 — I1 fase 4b: het Cluboverzicht

Vorige versie: 0.38.0

Het scherm waarmee een beheerder de officials aanduidt. YOAssist blijft live.

## Databank

Geen wijziging. `main` mag meteen vooruit.

## Backend

`GET /api/admin/officials/overzicht[?voorbij=1&weekends=2&dagen=60]`
(`src/officials/overzicht.js`, recht `officials.beheren`), uit YOAssist:
- de thuiswedstrijden van ploegen met officials, met de scheidsrechters van
  de bond (en wat de woensdaglijst zegt), wie kan, wie niet, en wie er van de
  club op staat — antwoorden en aanduidingen elk in één query, op voorwaarden
  in plaats van een lijst id's (D1);
- de cijfers gaan over de eerstvolgende volledige weekends
  (`src/officials/venster.js`, ongewijzigd uit YOAssist); de lijst reikt 60
  dagen, zodat 'toon meer' geen tweede oproep kost;
- `?voorbij=1` begint bij de eerste van de vorige maand; een voorbije
  wedstrijd telt nooit mee en is nooit een probleem;
- een probleem: in de lijst, geen forfait, en te weinig aangeduid of niemand
  beschikbaar.

## Het scherm

Tabblad **Cluboverzicht** (`public/js/schermen/cluboverzicht.js`), in de
tabbalk voor YOADM en ADMIN:
- tegels met de cijfers, die ook filteren (nog eens tikken heft op);
- groepen *Aandacht nodig*, *U10 / U12*, *Overige*, en onderaan *Voorbij*;
- per wedstrijd: de bond (met 'er komen twee refs'), REF1/REF2 met × om vrij te
  geven, wie kan (tik = aanduiden) en wie niet (tik = toch aanduiden),
  *Iemand anders aanduiden* (de kandidaten met hun antwoord en botsingen),
  in of uit de aanduidingslijst;
- vraagt de backend om te bevestigen (een 'nee', een botsing), dan beslist de
  beheerder; vrijgeven vraagt altijd bevestiging;
- bovenaan de gemelde problemen (afhandelen), *Automatisch aanvullen* (eerst
  het voorstel, dan bevestigen) en de herinnering voor wie nog niet invulde.

## Getest

968 tests (was 964). `test/officials-overzicht.test.mjs` (3) en
`test/navigatie.test.mjs` (het tabblad voor YOADM, niet voor een YO). Rood
gezien tegen:
- een voorbije wedstrijd die toch meetelt;
- uitwedstrijden in het overzicht;
- een forfait dat nog officials nodig heeft;
- de woensdaglijst niet meetellen in wat nodig is;
- vrijgeven zonder bevestiging;
- het tabblad voor een gewone official.

In Chromium bekeken tegen de **echte** handlers op een testdatabank (niet
tegen een nep-API): aanduiden, iemand die 'nee' zei na bevestiging,
refs bevestigen, filteren, automatisch aanvullen met voorstel en uitvoeren,
vrijgeven, een probleem afhandelen, voorbije wedstrijden, de herinnering —
de databank stond daarna zoals verwacht. Enige melding in de console: de
verwachte 409 bij 'eerst bevestigen'. De knop 'afgehandeld' was te groot;
verkleind.
