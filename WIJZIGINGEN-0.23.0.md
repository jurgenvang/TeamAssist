# TeamAssist 0.23.0 — T14: backup van de databank

Vorige versie: 0.22.0

## Databank

Niets.

## Configuratie

Niets.

## Aanleiding

TeamAssist had geen enkele backupfunctie. YOAssist wel, en die leerde daar
een harde les: een backup met een met de hand bijgehouden tabellenlijst bleef
jarenlang achter zodra er een nieuwe tabel bijkwam, zonder dat iemand het
merkte — tot een test het schema naast die lijst legde.

## De keuze: structureel immuun, niet enkel gedetecteerd

In plaats van YOAssist's aanpak exact te kopiëren (een hardcoded lijst, met
een test die controleert of ze nog klopt), maakt `GET /api/admin/backup` de
hele bugklasse onmogelijk: de tabellen komen rechtstreeks uit `sqlite_master`
van de echte databank, op het moment van de backup zelf. Er is geen lijst die
kán achterblijven, dus geen test nodig die drift moet opvangen — een nieuwe
tabel zit er de dag dat ze aangemaakt wordt automatisch bij, zonder dat deze
route ooit aangepast hoeft te worden.

De kerntest bewijst precies dat: een tabel wordt in de test pas aangemaakt
**ná** het schrijven van `backup.js`, en zit toch in het resultaat. Ter
controle de exacte YOAssist-fout gesimuleerd (teruggezet naar een hardcoded
lijst): 3 tests rood, waaronder die kerntest.

## Wat er wijzigt

**`GET /api/admin/backup`** — één JSON-bestand met alle tabellen, elk als
platte lijst van rijen, plus een tijdstip. Geen restore-knop — dat blijft
handmatig via de D1-console, zoals bij YOAssist.

Bij Configuratie, een nieuwe sectie **Backup**, met een downloadknop.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/routes/admin/backup.js` | nieuw: `alleTabellen()`, `backupExporteren()` |
| `src/index.js` | route ingehaakt |
| `public/index.html` | sectie Backup bij Configuratie |
| `public/js/schermen/instellingen.js` | `downloadBackup()` |
| `public/js/app.js` | knop ingehaakt |
| `test/backup.test.mjs` | nieuw: 8 tests |
| `test/frontend.test.mjs` | 2 tests erbij |
| `src/versie.js` | 0.22.0 → 0.23.0 |

## Tests

670, allemaal groen. De YOAssist-fout zelf gesimuleerd (hardcoded lijst in
plaats van `sqlite_master`): 3 tests rood.
