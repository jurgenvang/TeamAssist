# TeamAssist 0.6.1 — een persoon aanpassen

Vorige versie: 0.6.0

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

Klik in een ledenlijst of in een zoekresultaat op een naam, en de details
verschijnen met bewerkbare velden: voornaam, achternaam, geboortedatum,
e-mailadres, telefoonnummers en adres.

Drie routes, alle drie achter `personen.beheren`:

- `GET /api/admin/persoon?id=…`
- `POST /api/admin/persoon` — aanpassen
- `POST /api/admin/persoon/actief` — op te verwijderen zetten, of terugdraaien

### Waar de bron-vlag zich bewijst

**Een naamcorrectie zet `naam_bron` op `club`.** Daarna laat de synchronisatie
die naam met rust. Dat is het geval waarvoor het scherm bestaat: een dubbele
voornaam met een spatie splitst verkeerd, en zonder deze vlag zou de correctie de
eerstvolgende synchronisatie weer verdwijnen. De naam zoals de bond ze geeft
blijft in `naam_vbl` bewaard en staat boven het formulier.

**Enkel wat werkelijk verandert, zet een vlag.** Een scherm dat alle velden
terugstuurt zou anders in één klik elke bron op `club` zetten en de
synchronisatie volledig uitschakelen. Er staat een test op die precies dat
scenario nabootst.

**Een adres invullen raakt geen enkele vlag.** Adres en telefoon komen niet van
de bond, dus daar valt niets te beschermen.

**Wat de bond levert, is niet aanpasbaar.** De relatie-GUID, het lidnummer en
`naam_vbl` staan niet in de lijst van bewerkbare velden. Ze zijn zichtbaar maar
niet te wijzigen: het zijn geen gegevens van de club.

### Verder

**Verwijderen is nooit onmiddellijk.** De persoon wordt inactief met een datum
erbij; het werkelijke wissen gebeurt later door een geplande taak, zodat een
vergissing dezelfde dag nog recht te zetten is.

**Een beheerder kan zichzelf niet op te verwijderen zetten.** Dat zou hem
buitensluiten, met de D1-console als enige weg terug.

**Een dubbel e-mailadres geeft 409** in plaats van een databankfout. Het adres is
de sleutel naar een account; twee personen ermee kan niet.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/routes/admin/persoon.js` | nieuw: de drie routes, met de bron-logica |
| `src/index.js` | routes ingehaakt |
| `public/index.html` | detailscherm; namen klikbaar in beide lijsten |
| `test/persoon.test.mjs` | nieuw, negentien tests |
| `src/versie.js` | 0.6.0 → 0.6.1 |
| `schema-controle.sql` | enkel het versienummer |

## Tests

218, allemaal groen. Drie fouten ingebouwd ter controle, elk goed voor 1 rode
test: de bron-vlag zetten bij elk opslaan in plaats van bij een echte wijziging,
velden van de bond aanpasbaar maken, en geen vlag zetten bij een naamcorrectie.
