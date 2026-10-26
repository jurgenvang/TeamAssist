# TeamAssist

Dit bestand laadt de projectkennis uit deze map automatisch in elke sessie.

## Backlog
Eén backlog voor TeamAssist en YOAssist, dat erin opgaat (zie I1).

@BACKLOG.md

## Werkafspraken
- **Naar `main` pushen mag** (Jurgen, 26 oktober 2026). Cloudflare deployt vanaf
  `main`; een versie die enkel op een werkbranch staat, draait niet. Tot dan
  liep de Worker op 0.25.0 terwijl 0.26.0–0.30.1 al klaarstonden.
- **Eerst de migratie, dan de push.** Nieuwe code tegen een oud schema geeft
  'no such column'; oude code tegen een nieuw schema werkt meestal gewoon
  verder. Laat de migraties dus uitvoeren vóór `main` vooruitgaat.
