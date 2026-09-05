# TeamAssist 0.19.0 — T6: naammenu, dark mode, communicatiekanaal

Vorige versie: 0.18.1

## Databank — gewone ALTER, twee kolommen

```sql
ALTER TABLE personen ADD COLUMN donkere_modus TEXT NOT NULL DEFAULT 'systeem'
  CHECK (donkere_modus IN ('systeem', 'licht', 'donker'));
ALTER TABLE personen ADD COLUMN kanaal_voorkeur TEXT NOT NULL DEFAULT 'mail'
  CHECK (kanaal_voorkeur IN ('mail', 'push', 'beide'));
```

Bijgevoegd als `migratie-voorkeuren.sql`. **Getoetst tegen een nagemaakte
bestaande databank**: bestaande personen blijven ongewijzigd, de nieuwe
kolommen krijgen de juiste standaardwaarde, `schema-controle.sql` bevestigt
`ALLES OK`.

## Configuratie

Niets.

## Aanleiding

Gevraagd: hetzelfde naammenu-patroon als YOAssist (opgedeeld in Persoonlijk en
Algemeen voor een beheerder), en de topbalk netter — met expliciet genoemd dat
de alignatie niet klopte.

**Bevestigd, met één keuze bewust opengelaten:** Zaalbeheer/Configuratie/
Dagelijks beheer verhuizen niet weg uit de tabbalk — ze staan er nu ook als
snelkoppeling in het naammenu bij, maar niets verdwijnt. Die latere keuze
(verhuizen of dubbel houden) blijft dus nog open.

## De alignatiefout

`.topbalk` gebruikte `align-items: flex-start`. De linkerkant (logo, titel,
clubnaam, versieregel — drie regels sinds 0.14.3) is intussen langer dan de
rechterkant (naam, rollen — twee regels), waardoor die laatste bovenaan bleef
hangen in plaats van gecentreerd tegenover het logo. Nu `align-items: center`.

## Het naammenu

Naam en rollen zijn niet langer platte tekst, maar een knop die een
uitklappaneel opent — sluit ook bij een klik ergens anders. Twee secties:

- **Persoonlijk** (iedereen): Mijn voorkeuren, Afmelden (verhuisd van
  Overzicht — de oude losse knop daar is weg).
- **Algemeen** (enkel wie `systeem.beheren` heeft): snelkoppelingen naar
  Zaalbeheer, Configuratie, Dagelijks beheer — gebruikt de `kies`-functie die
  `bouwNavigatie()` al teruggaf, geen nieuwe tab-wissellogica.

## Mijn voorkeuren

Twee keuzes: **uiterlijk** (volgt het toestel / licht / donker) en **hoe je
verwittigd wil worden** (mail / melding op het toestel / beide — met een
duidelijke notitie dat meldingen nog niet bestaan; tot dan gaat alles via
mail, ongeacht deze keuze).

**Dark mode**: de databank is de bron van waarheid; `localStorage` is enkel
een snel eerste beeld vóór `/api/mij` geantwoord heeft, om een zichtbare flits
van het verkeerde kleurenschema te vermijden. Bij een verschil (een ander
toestel) wint de databank.

## Een reële ontwerpfout onderweg gevonden en teruggedraaid

Eerste aanpak: `keurAccentkleurGoed()` ook tegen een donkere achtergrond
toetsen. Bleek de eigen, al lang actieve clubkleur (`#a4232b`) met
terugwerkende kracht af te keuren — contrast tegen de donkere achtergrond is
2,39, zelfs onder de lossere grens van 3 voor niet-tekstuele elementen.
**Teruggedraaid.** De juiste oplossing zit in de CSS: in donkere modus wordt
de accentkleur enkel als achtergrond gebruikt (met een apart berekende
leesbare tekstkleur, `kleur_accent_op_vlak_tekst` — dezelfde aanpak die de
topbalkkleur al had), nooit als tekst- of randkleur op de donkere pagina zelf.
`/api/branding` geeft dit nu mee.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `schema.sql`, `schema-alles-in-een.sql`, `schema-kaal.sql`, `schema-controle.sql` | `personen.donkere_modus`, `personen.kanaal_voorkeur` |
| `migratie-voorkeuren.sql` | nieuw |
| `src/routes/voorkeuren.js` | nieuw: `POST /api/mij/voorkeuren`, zelfbediening, persoon altijd uit het token |
| `src/routes/mij.js` | geeft de twee voorkeuren mee |
| `src/routes/admin/branding.js` | `kleur_accent_op_vlak_tekst` |
| `public/js/schermen/voorkeuren.js` | nieuw |
| `public/js/huisstijl.js` | zet `--accent-tekst-op-vlak` |
| `public/index.html` | het naammenu, het voorkeurenscherm, de oude afmeldknop weg |
| `public/js/app.js` | volledige bekabeling |
| `public/stijl.css` | dark-mode-variabelenstelsel, de alignatiefix, naammenu-stijl |
| `test/branding.test.mjs`, `test/frontend.test.mjs`, `test/routes.test.mjs` | uitgebreid |
| `test/voorkeuren.test.mjs` | nieuw |
| `src/versie.js` | 0.18.1 → 0.19.0 |

## Tests

618, allemaal groen. Vier fouten ingebouwd ter controle: Algemeen altijd
tonen ongeacht rechten (1 rood), de databankwaarde bij aanmelden niet
toepassen (1 rood), `persoon_id` uit de request body vertrouwen bij Mijn
voorkeuren (1 rood, ontdekt via een aanvankelijk te zwakke test), en de
oorspronkelijke, te strenge kleurcontrole (teruggedraaid vóór levering, niet
in deze telling).

## Nog open

Of Zaalbeheer/Configuratie/Dagelijks beheer ook uit de tabbalk verdwijnen nu
ze in het naammenu staan — bewust nog niet beslist.
