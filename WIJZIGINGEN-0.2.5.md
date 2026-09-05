# TeamAssist 0.2.5 — het onderzoeksscript door de bedrijfsproxy

Vorige versie: 0.2.4

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

Enkel `tools/vbl-veldonderzoek.py`. De eerste versie gebruikte `urllib`, wat op
een bedrijfsnetwerk in een timeout loopt: is de proxy via een PAC-bestand
geregeld, dan vindt `urllib` ze niet en probeert het rechtstreeks naar buiten te
gaan.

Drie aanpassingen:

- **`requests` wordt gebruikt wanneer het geïnstalleerd is**, met `urllib` als
  terugval. `requests` pikt de proxyconfiguratie op die op zo'n netwerk al
  werkt — het script dat eerder wél door de proxy raakte, gebruikte die
  bibliotheek.
- **`--proxy http://adres:poort`** om ze desnoods expliciet mee te geven.
- **Het script zegt bovenaan wat het gebruikt**: welke bibliotheek, en welke
  proxy het gevonden heeft. Loopt het daarna toch mis, dan volgt uitleg in
  plaats van een traceback.

De certificaatfout die een inspecterende proxy veroorzaakt, werd al opgevangen
en blijft opgevangen — in beide paden.

## Gebruik

```
python tools/vbl-veldonderzoek.py
python tools/vbl-veldonderzoek.py --proxy http://proxy.bedrijf.be:8080
```

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `tools/vbl-veldonderzoek.py` | requests met urllib als terugval, `--proxy`, diagnoseregels en uitleg bij een fout |
| `src/versie.js` | 0.2.4 → 0.2.5 |
| `schema-controle.sql` | enkel het versienummer in de kop |
| `README.md` | versienummer |

## Tests

103, allemaal groen.
