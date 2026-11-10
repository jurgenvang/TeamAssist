# TeamAssist 0.42.0 — I1 fase 4e: tabbladen per stuk uitzetten

## Eerst de databank, dan `main`

Deze versie heeft een nieuwe kolom nodig. Doe het in deze volgorde:

1. Voer `migratie-0.42.0.sql` uit in de D1-console. Het is één opdracht:

   ```sql
   ALTER TABLE personen ADD COLUMN verborgen_tabs TEXT;
   ```

2. Voer daarna `schema-controle.sql` uit. Bovenaan hoort `ALLES OK` te
   staan.
3. Zeg dat het gedaan is. Pas dan gaat 0.42.0 naar `main`.

Gebeurt het in de omgekeerde volgorde, dan geeft `/api/mij` de fout
`no such column: verborgen_tabs` en raakt niemand de app nog binnen.

Een `ALTER` volstaat: de nieuwe kolom heeft geen CHECK, geen UNIQUE en geen
foreign key, dus er is geen heropbouw nodig. Een tweede keer uitvoeren
faalt met 'duplicate column name'; dan is het al gebeurd. NULL betekent de
standaard, dus er hoeft niets ingevuld te worden.

## Wat en waarom

Zoals `verborgen_tabs` in YOAssist, beslist met Jurgen op 10 november 2026.

- **Iedereen kiest voor zichzelf**, bij Mijn voorkeuren → *Tabbladen*,
  welke tabbladen in zijn tabbalk staan:
  - de keuze toont enkel de tabbladen waar iemand recht op heeft. Een coach
    ziet Regio dus niet en kan het ook niet aanzetten;
  - een vinkje wordt meteen bewaard, en de tabbalk verandert meteen mee;
  - verbergen gaat enkel over de weergave. Wat iemand mag, verandert niet.
- **Regio staat standaard uit**, zoals in YOAssist. Enkel wie de officials
  beheert, ziet Regio, en kan het voor zichzelf aanzetten.
- **Overzicht blijft altijd staan**, zodat niemand een lege app overhoudt.
  De panelen onder Beheer zijn geen tabbladen en vallen erbuiten.
- **De migratie van YOAssist** (`tools/migreer-yoassist.mjs`) neemt een
  eigen keuze mee: Cluboverzicht, Aanduidingen en Regio. Wie de standaard
  van YOAssist had (Logboek en Regio uit), volgt in TeamAssist de
  standaard. Het Logboek is in TeamAssist geen tabblad en valt weg. Tot nu
  toe meldde het script enkel dat dit nog niet meekwam.

Hoe het gebouwd is:

- `src/lib/tabbladen.js` bevat de regels: welke tabbladen verbergbaar zijn,
  de standaard, het nakijken en de vertaling uit YOAssist.
- `/api/mij` geeft `verborgen_tabs` mee.
- `POST /api/mij/voorkeuren` aanvaardt `verborgen_tabs`. Andere voorkeuren
  bewaren laat de tabbladen ongemoeid.
- In `navigatie.js` zijn de tabbladen gemarkeerd met `verbergbaar` en
  `standaardUit`. Een test legt die naast de lijst van de backend.

## Tests

1002, allemaal groen. Nieuw is `test/tabbladen.test.mjs` (7 tests). Die
dekt:

- het lezen en nakijken van de keuze: NULL is de standaard, Overzicht en de
  panelen kunnen niet weg;
- de vertaling uit YOAssist;
- dat backend en tabbalk dezelfde tabbladen kennen;
- de tabbalk met verborgen tabbladen;
- het bewaren bij Mijn voorkeuren, ook dat de modus alleen bewaren de
  tabbladen ongemoeid laat;
- `/api/mij`;
- **de migratie**: het schema van 0.41.0 plus `migratie-0.42.0.sql` geeft
  dezelfde tabel `personen` als een vers schema, en een tweede keer
  uitvoeren faalt.

`migreer-yoassist.test.mjs` test nu ook drie gevallen: een eigen keuze, de
standaard, en niets verborgen.

Rood tegen de fout, telkens één keer gedraaid:

- Overzicht verbergbaar maken;
- de tabbladen wissen bij het bewaren van enkel de modus;
- de migratie zonder de `ALTER`;
- de standaard van YOAssist als eigen keuze overnemen.

In Chromium bekeken: Regio aangezet en Ploegen uitgezet bij Mijn
voorkeuren. De tabbalk veranderde telkens meteen, zonder fouten.

`schema-alles-in-een.sql`, `schema-kaal.sql` en `schema-controle.sql` zijn
opnieuw gegenereerd.

## Vorm van een API-antwoord

Nieuw veld `verborgen_tabs` (een lijst) in `/api/mij` en in het antwoord
van `POST /api/mij/voorkeuren`. Er is niets weggevallen.
