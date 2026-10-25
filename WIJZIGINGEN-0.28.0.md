# TeamAssist 0.28.0 — I1 fase 1b: Mijn berichten en belangrijk nieuws

Vorige versie: 0.27.0

Tweede pakket van de integratie met YOAssist (backlog I1). 0.29.0 brengt push.

## Databank — een ALTER volstaat, geen DROP

Voer `migratie-0.28.0.sql` uit in de D1-console, daarna `schema-controle.sql`
(bovenaan: `ALLES OK`). Het script:

- zet drie kolommen bij in `berichten`: `soort`, `kort`, `gelezen_op`
  (`ALTER TABLE ... ADD COLUMN`; bestaande berichten blijven staan, als
  ongelezen);
- maakt twee nieuwe tabellen: `mededelingen` en `mededeling_gezien`;
- zet de standaardafzender van `noreply@teamassist.org` op
  `noreply@clubassist.org` — enkel als hij nog op die standaard stond.

Getoetst tegen een databank met het schema van 0.27.0 en een bestaand
bericht: daarna exact dezelfde structuur als een verse `schema.sql`, het
bericht is er nog. Een tweede keer uitvoeren faalt op de eerste ALTER
('duplicate column name'): dat betekent enkel dat het al gebeurd is.

## Configuratie

**`clubassist.org` moet bij Resend als domein geverifieerd zijn**, anders
weigert Resend elke mail met dat afzenderadres. Tot dan kan je bij
Configuratie `mail_afzender` op een adres van een al geverifieerd domein
zetten.

## Wat er wijzigt

**Mijn berichten.** In het naammenu, en via het bolletje op je naam. Wat de
app je stuurde, nieuwste eerst. Een bericht is ongelezen (stip, gekleurde
rand) tot je het zelf aantikt — niet bij het openen van de lijst, zodat je
eerst kan scannen. Is er meer dan één regel, dan klapt het open tot de
volledige tekst zoals verstuurd, met de links klikbaar. *Alles gelezen* en
per bericht een × om het weg te halen.

**Het meldingenbolletje.** Een rode badge op je naam met het aantal
ongelezen berichten. Tikken gaat rechtstreeks naar Mijn berichten, zonder
het menu. De teller ververst om de drie minuten zolang het tabblad zichtbaar
is, en meteen wanneer je terugkeert naar de app.

**Belangrijk nieuws** (bij Dagelijks beheer, enkel voor beheerders). Eén
mededeling tegelijk, als gele balk bovenaan, tot de einddatum of tot iemand
ze wegklikt. Bij het plaatsen kies je de doelgroep:

- *Iedereen*;
- *De begeleiding*: wie COORD, COACH of PLOEGV is in het seizoen;
- *Eén ploeg*: de spelers, hun ouders en de begeleiding van die ploeg.

Wie tot de doelgroep hoort **en een account heeft**, krijgt de mededeling ook
als bericht: mail, en in Mijn berichten. Wie nooit aanmeldde, krijgt geen
mail van een app die hij nog niet kent. Dat vinkje kan uit: dan enkel de
balk. Altijd eerst *Voorbereiden*: dat toont hoeveel mensen het krijgen, en
pas dan verschijnt *Plaatsen*. Elke wijziging aan het formulier verbergt
*Plaatsen* weer, zodat je nooit iets anders verstuurt dan wat de droogloop
toonde.

De balk volgt dezelfde doelgroep als de berichten — één SQL-voorwaarde op
beide plaatsen (`src/lib/doelgroep.js`). Een mededeling voor één ploeg
verschijnt dus enkel bij die ploeg. Dat wijkt af van wat ik bij het
uitklaren schreef ('de banner ziet iedereen die aanmeldt'): een balk over de
U12 bij de senioren klopte niet met de keuze van de doelgroep.

**Veel mails tegelijk.** Een mededeling aan de hele club kan honderden
ontvangers hebben. Elke mail apart versturen kost per ontvanger een
uitgaande oproep, en een Worker mag er per aanroep maar een beperkt aantal
doen. `verwittigVelen()` gebruikt daarom het batch-endpoint van Resend:
honderd mails per oproep. Een mislukte groep laat de andere niet mislukken;
wie erin zat, komt niet in Mijn berichten en staat open in het logboek. In de
modus *omleiden* gaat er één mail naar het testadres, met erin voor hoeveel
mensen ze bedoeld was — niet honderden keren dezelfde mail.

**Elk bericht krijgt een soort**: `wedstrijd` (een wijziging), `selectie`,
`taak` en `nieuws`. Bestaande triggers geven die nu mee.

## Onderweg gevonden

**Wie een wedstrijdtaak had, kon nooit verwijderd worden.** `wedstrijdtaken`
(0.26.0) verwijst naar `personen`, maar de dagelijkse opruiming van inactieve
personen (0.25.0) liet die tabel ongemoeid. De foreign key liet het
verwijderen dan mislukken — en omdat de lus geen foutopvang heeft, ook voor
iedereen na die persoon in dezelfde ronde. Nu wordt de persoon uit de taak
losgekoppeld (zoals bij aanwezigheden); de taak zelf blijft. Er staat nu een
test die elke tabel met een foreign key naar `personen` naloopt en nagaat of
de opruiming ze behandelt: zo kwam deze fout boven, en een volgende tabel
kan niet meer stil vergeten worden.

**`schema-alles-in-een.sql` en `schema-kaal.sql` werden met de hand
bijgehouden.** Ze worden nu gegenereerd (`node tools/genereer-schemas.mjs`),
met een test die ze naast `schema.sql` legt en ze twee keer na elkaar
uitvoert op een gevulde databank. Inhoudelijk niets veranderd: dezelfde
tabellen; de DROP's staan nu strikt in omgekeerde volgorde van het schema, en
`schema-kaal.sql` heeft wat minder lege regels.

## Niet in dit pakket

- **Push**: 0.29.0. Tot dan is mail het enige kanaal, ook voor wie 'push'
  koos.
- **Berichten in de modus *omleiden*** komen bewust niet in Mijn berichten:
  de echte persoon kreeg ze niet. Zolang `bericht_modus` op `omleiden` staat,
  blijft Mijn berichten dus leeg — dat is geen fout.
- **Een coach die zijn ploeg iets laat weten**: bewust enkel beheerders
  (beslist bij het uitklaren).

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `schema.sql` | `berichten`: drie kolommen; tabellen `mededelingen`, `mededeling_gezien`; standaardafzender `clubassist.org` |
| `migratie-0.28.0.sql` | nieuw: de ALTER's, de twee tabellen, de afzender |
| `schema-alles-in-een.sql`, `schema-kaal.sql`, `schema-controle.sql` | opnieuw gegenereerd |
| `tools/genereer-schemas.mjs` | nieuw: bouwt de twee heropbouwscripts uit `schema.sql` |
| `src/lib/doelgroep.js` | nieuw: wie tot een doelgroep hoort, één voorwaarde voor balk én berichten |
| `src/lib/verwittigen.js` | `soort` en `kort`; `verwittigVelen()` voor veel ontvangers; standaardafzender |
| `src/lib/mailer.js` | `verstuurMailBatch()`: honderd mails per oproep |
| `src/lib/opkuis.js` | `mededeling_gezien` en `wedstrijdtaken` bij het verwijderen van een persoon |
| `src/routes/berichten.js` | nieuw: Mijn berichten, teller, gelezen, verwijderen, de balk, wegklikken |
| `src/routes/admin/mededeling.js` | nieuw: huidige, voorbereiden/plaatsen, intrekken |
| `src/routes/admin/wedstrijden.js`, `aanwezigheid-beheer.js`, `wedstrijdtaken.js` | `soort` bij elk bericht |
| `src/index.js` | negen routes ingehaakt |
| `public/index.html` | bolletje, Mijn berichten in het menu en als scherm, de balk, Belangrijk nieuws bij Dagelijks beheer (de VBL-diagnose staat er nu in een uitklapsectie onder) |
| `public/stijl.css` | bolletje, balk, berichten |
| `public/js/app.js` | de teller starten, de balk tonen, knoppen koppelen |
| `public/js/schermen/berichten.js` | nieuw |
| `public/js/schermen/mededeling-beheer.js` | nieuw |
| `test/berichten.test.mjs` | nieuw: 13 tests |
| `test/mededeling.test.mjs` | nieuw: 12 tests |
| `test/schema-afgeleid.test.mjs` | nieuw: 4 tests |
| `test/opkuis.test.mjs` | 3 tests erbij, waaronder de structurele |
| `test/frontend.test.mjs` | 8 tests erbij |
| `test/routes.test.mjs` | de zes nieuwe routes over jezelf |
| `src/versie.js` | 0.27.0 → 0.28.0 |
| `README.md` | `genereer-schemas.mjs` bij 'Bij een volgende versie' |
| `.claude/BACKLOG.md` | 0.28.0, domein `clubassist.org` |

## Tests

786, allemaal groen. Ter controle telkens een fout ingebouwd: verwijderen
zonder te filteren op de eigen persoon (1 rood), de balk zonder
doelgroepvoorwaarde (2 rood), inactieve personen meetellen als ontvanger
(6 rood), links maken vóór het ontsmetten (1 rood), het bolletje zonder
`stopPropagation` (1 rood), en de wedstrijdtaak-opruiming weg (1 rood).

Bekeken in Chromium op 1000 en 390 pixels breed, met een nagebootste
backend: balk, bolletje, Mijn berichten met een opengeklapt bericht, en het
formulier bij Dagelijks beheer.

## API-vorm

Nieuwe routes; aan bestaande antwoorden verandert niets.
