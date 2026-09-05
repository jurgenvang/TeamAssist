# TeamAssist 0.2.4 — script voor het VBL-veldonderzoek

Vorige versie: 0.2.3

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

E�n script erbij: `tools/vbl-veldonderzoek.py`. Het beantwoordt de drie
openstaande vragen over de VBL-API die fase 2 tegenhouden — het formaat van
`sGebDat`, de betekenis van `ma`, en de codelijst van `tvCaC`.

```
python tools/vbl-veldonderzoek.py
```

Enkel standaardbibliotheek, dus geen pip install. Het haalt de ploeg-GUID's op
bij `OrgDetailByGuid` en loopt erover met `TeamDetailByGuid`. De veldnamen van
`OrgDetailByGuid` staan nergens gedocumenteerd, dus zoekt het script niet op een
pad maar op de vorm van de waarde: de club-GUID gevolgd door een categoriecode.
Zo maakt het niet uit hoe de respons gestructureerd is.

Voor `ma` zet het de waarden naast het geboortejaar en naast het
aansluitingsjaar. Loopt de verdeling mee met de leeftijd, dan gaat het
vermoedelijk over speelgerechtigdheid; loopt ze mee met de aansluitingsdatum,
over een mutatie.

De uitvoer bevat tellingen en een paar voorbeelden, geen ledenlijsten. Voor deze
vragen is dat niet nodig, en het scheelt namen in een uitvoer die gedeeld wordt.

Draaien vanaf een onbeperkte verbinding: de ontwikkelomgeving heeft geen toegang
tot `vblcb.wisseq.eu`. Vervangt een bedrijfsproxy het certificaat, dan valt het
script terug op een onbeveiligde verbinding met een waarschuwing — dat is het
netwerk, niet Wisseq.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `tools/vbl-veldonderzoek.py` | nieuw |
| `src/versie.js` | 0.2.3 → 0.2.4 |
| `schema-controle.sql` | enkel het versienummer in de kop |
| `README.md` | versienummer |

## Tests

103, allemaal groen. Het script zelf heeft geen tests in de suite — het praat met
een netwerk dat de testomgeving niet heeft. De hulproutines zijn wel nagekeken
tegen een nagebootste respons vóór levering.
