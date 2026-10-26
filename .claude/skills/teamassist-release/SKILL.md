---
name: teamassist-release
description: Het releaseproces van TeamAssist (met de module Officials, het vroegere YOAssist) — tests, versienummer, migratiescript, gegenereerde schemabestanden, volledige zip en delta-zip, backlog, en de push naar main pas na de migratie. Gebruik deze skill zodra een wijziging aan TeamAssist klaar is om als versie te leveren, of wanneer iemand vraagt om "een release", "een versie afronden", "een zip", "de volgende versie", of om te pushen.
---

# TeamAssist — release afronden

Volg de stappen in deze volgorde. Sla er geen over, ook niet als de wijziging
klein lijkt. Gebaseerd op `yoassist-release`, aangepast aan TeamAssist.

## 1. Tests

```
cd test && npm test
```

Alles groen vóór er iets verpakt wordt. Elke nieuwe test is één keer rood
geweest tegen de fout die hij moet vangen; noteer welke in `WIJZIGINGEN.md`.

## 2. Versienummer

Eén plaats: `src/versie.js`. Bugfix = patch (0.30.0 → 0.30.1), een
afgebakend pakket = minor. Kijk of het overeenkomt met "Stand" bovenaan
`.claude/BACKLOG.md`.

## 3. Schema

Wijzigt de databank? Zeg meteen of een `ALTER TABLE ... ADD COLUMN` volstaat
of dat er een heropbouw nodig is (zie `learnings.md`, *Databank*).

- `schema.sql` bijwerken (de bron van waarheid).
- `migratie-<versie>.sql` schrijven, en toetsen: het schema van de vorige
  versie (`git show HEAD:schema.sql`), met rijen erin en foreign keys aan,
  daarna de migratie, daarna dezelfde structuur als een verse `schema.sql`.
  Voor een heropbouw een eigen test (zie `test/migratie-0.30.1.test.mjs`).
- `node tools/genereer-controle.mjs` en `node tools/genereer-schemas.mjs`
  (de tests falen als je het vergeet).

## 4. Documenten

- `.claude/BACKLOG.md`: "Stand" bovenaan; een rij in *TeamAssist —
  afgewerkt*; het overzicht (*Wacht op een actie van Jurgen*, *Klaar om te
  bouwen*) bijwerken; afgewerkte punten markeren.
- `.claude/learnings.md`: een nieuwe valkuil erbij als er een boven kwam.
- `.claude/instructions.md`: enkel als de werkafspraken veranderen.
- `README.md`: als er een tool of een stap bij het installeren bijkwam.
- `WIJZIGINGEN-<versie>.md`: wat, waarom, de databankactie, de tests (en
  welke rood waren), wijzigingen in de vorm van een API-antwoord.

## 5. Commit en zips

Eén commit voor de versie. Daarna, in `/home/user/releases` (of waar de
gebruiker ze wil):

```
git archive --format=zip -o teamassist-<versie>.zip HEAD
git diff --name-only --diff-filter=AM HEAD~1 HEAD | zip -q teamassist-<versie>-delta.zip -@
```

Plus `WIJZIGINGEN.md` (een kopie van `WIJZIGINGEN-<versie>.md`) in de
delta-zip. `.claude/` zit in beide, de volledige zip altijd.

## 6. Pushen

- Altijd naar de werkbranch.
- Naar `main` (Cloudflare deployt): **pas als de gebruiker bevestigt dat de
  migratie is uitgevoerd**. Zonder schemawijziging meteen. Controleer eerst
  dat het een fast-forward is (`git merge-base --is-ancestor origin/main HEAD`).

## 7. Opleveren

Een korte samenvatting, de twee zips, de databankactie (het SQL-script in de
tekst als het kort is), en wat de gebruiker daarna moet nakijken. Vraag of je
doorgaat met het volgende pakket.
