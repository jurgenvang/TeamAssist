# TeamAssist — werkafspraken

Kort en stabiel: dit zijn werkafspraken, geen documentatie. Wat er gebouwd
is en wat er nog komt, staat in `BACKLOG.md`; de valkuilen in
`learnings.md`. Overgenomen uit YOAssist (`instructions.md` daar) en
aangepast aan de samengevoegde app (I1).

Antwoord in het Nederlands.

## Werkwijze

- **Een versie afronden: volg `skills/teamassist-release/SKILL.md`.** Tests,
  versienummer, schema, zips, backlog, push — in die volgorde.
- **Eerst uitklaren, dan bouwen.** Bij een nieuwe wens: stel de vragen die het
  datamodel of de gebruikerservaring raken vóór je code schrijft, met een
  voorstel en een standaardkeuze in plaats van open vragen. Wat beslist is,
  gaat eerst in `BACKLOG.md`.
- **Eén pakket per versie, met twee zips**: een volledige en een delta-zip
  met `WIJZIGINGEN.md`. Vraag daarna of je doorgaat; bouw niet twee pakketten
  in één beurt.
- **Vertel wat er in de databank moet veranderen**, telkens: volstaat een
  `ALTER TABLE ... ADD COLUMN`, of is er een heropbouw nodig? Lever het
  script mee (`migratie-<versie>.sql`), getoetst tegen het schema van de
  vorige versie.
- **Eerst de migratie, dan de push naar `main`.** Cloudflare deployt vanaf
  `main`. Nieuwe code tegen een oud schema geeft `no such column`; oude code
  tegen een nieuw schema werkt meestal verder. Naar `main` pushen mag (Jurgen,
  26 oktober 2026) — maar pas nadat Jurgen zegt dat de migratie gedaan is.

## Kwaliteitseisen

- **Alles wat je bouwt heeft tests**, zonder netwerk en zonder dependencies:
  `cd test && npm test` (`node:sqlite`, Node 22+). Nieuwe logica zonder test
  is niet af.
- **Verifieer dat een nieuwe test echt kan falen**: draai hem één keer tegen
  de fout die hij moet vangen, en zeg in `WIJZIGINGEN.md` welke.
- **Controleer elke tekstvervanging**: `assert t.count(oud) == 1`.
- **Wijzig je de vorm van een API-respons**, zoek dan in `public/js/` en
  `test/` naar de oude veldnamen.
- **Schrijf commentaar dat het waarom uitlegt**, niet het wat. Nederlands.
- **Getoetst tegen echte gegevens waar het kan.** Een backup van de Worker
  (Beheer → Configuratie → Backup) mag in het gesprek gebruikt worden, maar
  hoort nooit in de repo: er staan persoonsgegevens in, ook van minderjarigen.

## Vaste regels van de applicatie

- De gebruiker komt altijd uit het geverifieerde token, nooit uit de request
  body. Namens iemand anders handelen kan enkel als ouder, gecontroleerd tegen
  `ouder_kind` (`src/lib/namens.js`). De frontend verbergt knoppen voor het
  gemak; de backend weigert voor de veiligheid.
- Rechten komen uit `src/lib/rechten.js`, nooit uit een rolnaam in een route.
- Alles wat gegevens wist, inleest of verstuurt naar velen, is eerst een
  droogloop.
- Berichten gaan altijd via `src/lib/verwittigen.js`, nooit rechtstreeks naar
  `mailer.js` of `push.js`.
- Loggen mag de actie zelf nooit laten mislukken.
- D1 staat honderd gebonden parameters per query toe. Filter op voorwaarden,
  nooit op een lijst sleutels.
- Een synchronisatie mag nooit schade doen: toevoegen mag, wegnemen markeert.
