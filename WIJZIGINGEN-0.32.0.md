# TeamAssist 0.32.0 — I1 fase 3a: ouder en kind

Vorige versie: 0.31.0

Wat er met een kind en zijn ouders gebeurt, voor de hele app — niet enkel
voor de officials. Zoals beslist met Jurgen op 26 oktober 2026 (backlog, I1,
*Ouder en kind*).

## Databank — ALTER en CREATE, geen heropbouw

Voer `migratie-0.32.0.sql` uit in de D1-console, daarna `schema-controle.sql`
(bovenaan: `ALLES OK`). **Pas daarna gaat `main` vooruit**: de nieuwe code
leest `personen.ouders_meelezen`.

- `personen.ouders_meelezen` (ALTER): NULL = de standaard volgens de leeftijd,
  1/0 = een gemaakte keuze.
- Tabel `ouder_toestemming` (CREATE): de openstaande vraag van een
  minderjarige om de berichten niet meer naar de ouders te sturen.

## Berichten ook naar de ouders

- **Een kind zonder eigen e-mailadres:** altijd naar de ouders. Tot nu kwam
  zo'n bericht nergens aan (bv. bij een gepubliceerde selectie) — er
  verscheen enkel een foutregel in het logboek.
- **Minderjarig:** standaard aan. Het kind kan vragen om het uit te zetten;
  elke ouder krijgt die vraag en antwoordt in de app. Zodra iedereen ja zei,
  gaat het uit; één nee en het blijft aan. Een ouder kan het altijd weer
  aanzetten. Een onbekende geboortedatum telt als minderjarig.
- **Meerderjarig:** standaard uit; het kind zet het zelf aan of uit.
- **Bij 18 verandert er niets vanzelf**; vanaf dan beslist het kind zelf.
- De ouder krijgt een kopie volgens zijn eigen voorkeur (mail, push of
  beide), met *Voor Max:* in het onderwerp. In `berichten` staat het bericht
  één keer, bij het kind; de ouder ziet het in zijn eigen Mijn berichten, met
  *Voor Max Cuyvers* erbij, en het telt mee in zijn bolletje. Verwijderen kan
  enkel het kind. Staat het uit, dan ziet de ouder ook de oudere berichten
  van dat kind niet meer.
- Belangrijk nieuws krijgt geen kopie: de ouders zitten zelf in de doelgroep.
- In de modus *omleiden* gaan ook de kopieën naar het omleidadres.

Waar: **Mijn voorkeuren → Berichten aan je ouders**. Wie ouders heeft, ziet
er zijn eigen stand; wie kinderen heeft, ziet er per kind de stand en een
openstaande vraag met *Ja* en *Nee*.

## Ouders en kinderen in het persoonsscherm

Onder *Ouders en kinderen*: wie de ouders of kinderen zijn, of de berichten
meegaan, *Ontkoppelen*, en zoeken naar een persoon om te koppelen (*is ouder*
of *is kind*). Tot nu kon dat enkel via het personensjabloon, en een official
die geen speler is, staat in geen enkel ploegsjabloon. Geen ketens: een ouder
is zelf geen kind, en omgekeerd.

## Namens een kind

`src/lib/namens.js`: één controle of iemand namens een ander mag handelen,
gebruikt door de aanwezigheden en straks door de officials (3b).

## De migratie: een keuzebestand

`node tools/migreer-yoassist.mjs … --keuzes keuzes.json`. Per YOAssist-adres
dat van een ouder is: wie die ouder is. Het adres gaat naar de ouder (een
bestaande persoon op adres of naam, of een nieuwe), het kind blijft zonder
adres, en ze worden gekoppeld. Getoetst op de echte backups met
`ruudcuyvers@…` → Ruud Cuyvers: Ruud werd herkend op naam en krijgt het
adres, Max blijft zonder adres, ze zijn gekoppeld; geen foreign-keyfout.

## Ook: de uitslag van een gewijzigde wedstrijd

Wijzigde er bij een wedstrijd tegelijk iets anders (in 0.30.1 bij elke
thuiswedstrijd de tegenstander), dan kwam de uitslag pas een synchronisatie
later binnen. Nu meteen.

## Bestanden

| Bestand | Wat |
|---|---|
| `schema.sql`, `migratie-0.32.0.sql` | kolom en tabel |
| `schema-alles-in-een.sql`, `schema-kaal.sql`, `schema-controle.sql` | opnieuw gegenereerd |
| `src/lib/namens.js` | nieuw: minderjarig, meelezen (JS en SQL), ouders, kinderen, namens |
| `src/lib/verwittigen.js` | één bezorgfunctie per ontvanger; de kopie naar de ouders |
| `src/routes/meelezen.js` | nieuw: de schakelaar, de vraag, het antwoord |
| `src/routes/berichten.js` | de berichten van een kind bij zijn ouders |
| `src/routes/admin/persoon.js` | ouders en kinderen tonen, koppelen, ontkoppelen |
| `src/routes/aanwezigheid-opgave.js` | gebruikt `namens.js` |
| `src/routes/admin/wedstrijden.js` | de uitslag bij een gewijzigde wedstrijd |
| `src/lib/opkuis.js` | `ouder_toestemming` bij het verwijderen van een persoon |
| `src/index.js` | vijf routes |
| `public/index.html`, `public/js/app.js`, `public/js/schermen/meelezen.js` (nieuw), `voorkeuren.js`, `persoon.js`, `berichten.js` | de schermen |
| `tools/migreer-yoassist.mjs`, `README.md` | het keuzebestand |
| `test/ouder-kind.test.mjs` | nieuw: 21 tests |
| `test/migreer-yoassist.test.mjs`, `test/wedstrijden-bugfix.test.mjs`, `test/routes.test.mjs` | uitgebreid |
| `src/versie.js` | 0.31.0 → 0.32.0 |
| `.claude/BACKLOG.md` | 3a afgewerkt |

## Tests

878, allemaal groen. Ter controle: zonder de kopie naar de ouders (3 rood),
de leeftijdsgrens in SQL op 17 in plaats van 18 (1 rood: SQL en JavaScript
zeggen niet meer hetzelfde), en de uitslag weer weg uit de UPDATE (1 rood).

## API-vorm

- `GET /api/berichten`: elk bericht heeft een veld `voor` (null, of de naam
  van het kind).
- `GET /api/admin/persoon`: nieuwe velden `ouders`, `kinderen`,
  `ouders_meelezen`.
- Nieuw: `GET/POST /api/meelezen`, `POST /api/meelezen/antwoord`,
  `POST /api/admin/persoon/ouder-koppelen` en `…/ouder-ontkoppelen`.
