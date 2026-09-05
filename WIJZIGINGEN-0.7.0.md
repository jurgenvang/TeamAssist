# TeamAssist 0.7.0 — navigatie, modules en de testrol

Vorige versie: 0.6.1

## Databank — één regel

Er komt één instelling bij. Bestaande installaties missen die rij; de code
behandelt een ontbrekende rij als 'uit', dus dit mag ook achterwege blijven.
Netter is ze toe te voegen:

```sql
INSERT INTO instellingen (sleutel, waarde) VALUES ('testrol_toegelaten', '0');
```

Draai daarna `schema-controle.sql`: `ALLES OK`. De controle kijkt naar tabellen,
indexen en kolommen, dus een ontbrekende instellingsrij valt daar niet onder —
vandaar deze vermelding.

## Configuratie

Niets.

## Wat er wijzigt

### Navigatie

Het scherm is niet langer één lange lijst. Er zijn vier tabbladen — Overzicht,
Ploegen, Personen, Beheer — en **welke je ziet, volgt uit de rechten die de
backend teruggeeft**, niet uit een rollijst in de frontend. Zo blijft er één
plaats waar bepaald wordt wat iemand mag. Een coach ziet Overzicht en Ploegen;
wie geen enkele rol heeft, houdt alleen Overzicht over.

Verbergen blijft een gemak en geen beveiliging: elke route controleert zelf.

### De frontend is opgesplitst

Wat één bestand van bijna achthonderd regels was, staat nu in modules die de
browser zelf inlaadt — nog altijd geen buildstap, geen framework, geen CDN. Dat
was in de architectuur afgesproken en tot nu toe niet uitgevoerd; hoe langer
gewacht, hoe duurder.

```
public/index.html          de schil
public/stijl.css
public/js/api.js           sessie, tokenvernieuwing, oproepen
public/js/hulp.js
public/js/navigatie.js
public/js/app.js           aanmelden en alles aan elkaar knopen
public/js/schermen/*.js    ploegen, personen, persoon, instellingen, diagnose, testrol
```

**Meteen rechtgezet bij het opsplitsen:** waarden uit de databank werden
rechtstreeks in HTML geplakt. Een naam met een punthaak brak daardoor het
scherm. Alles loopt nu door een ontsmettingsfunctie, met een test erop.

### Kijken met een andere rol

Staat de instelling `testrol_toegelaten` aan — standaard uit — dan kan een
beheerder bij Beheer een rol kiezen, en voor een ploegrol ook welke ploeg. De
keuze gaat in een kop mee; de backend versmalt daarmee de rechten.

**De schakelaar kan enkel wegnemen.** De uitkomst is de doorsnede van wat je
werkelijk mag en wat de gekozen rol mag. Een coach die ADMIN kiest, blijft coach.
Er staat een test op die voor elke combinatie van rol, recht en ploeg nagaat dat
er nooit iets bij komt.

Drie voorwaarden moeten kloppen: de instelling staat aan, de persoon is
werkelijk beheerder, en er is een rol gevraagd. Elk van de drie heeft een test
die faalt zodra ze wegvalt.

Bovenaan blijft een balk staan met de gekozen stand. Zonder die balk vergeet je
dat je versmald kijkt en meld je een fout die er niet is.

**Wat hiermee niet lukt:** kiezen voor SPELER of OUVO toont wel het scherm, maar
de knop om een aanwezigheid op te geven blijft dood. Dat recht heeft een
beheerder niet, en de doorsnede voegt niets toe. Zodra de aanwezigheden bestaan,
moet beslist worden wat daar hoort te gebeuren — het staat in de backlog.

### Instellingen

Een scherm bij Beheer voor de clubbrede instellingen, met een vaste lijst in de
code. Geen vrije sleutel/waarde van buitenaf: anders kan een verzoek een sleutel
schrijven die elders als schakelaar dienstdoet.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `public/index.html` | herschreven als schil |
| `public/stijl.css` | nieuw |
| `public/js/**` | nieuw: acht modules |
| `src/lib/rechten.js` | `beperkTot`: de doorsnede voor de testrol |
| `src/routes/admin/instellingen.js` | nieuw |
| `src/index.js` | instellingsroutes, en de testrol in de contextopbouw |
| `schema.sql` en de afgeleide bestanden | de nieuwe instellingsrij |
| `test/testrol.test.mjs`, `test/testrol-context.test.mjs`, `test/navigatie.test.mjs` | nieuw |
| `test/frontend.test.mjs` | herschreven voor de modules |
| `src/versie.js` | 0.6.1 → 0.7.0 |

## Tests

241, allemaal groen. Twee fouten ingebouwd ter controle: de testrol laten
verbreden in plaats van versmallen maakt 7 tests rood, en de navigatie niet op
rechten laten steunen 5.
