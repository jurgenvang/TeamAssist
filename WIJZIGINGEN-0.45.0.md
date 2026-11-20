# TeamAssist 0.45.0 — T22: de tabbalk zoals in YOAssist

## Databank

Geen wijziging. Er is geen migratie nodig.

## Wat en waarom

Beslist met Jurgen op 20 november 2026. Het viel op bij het naast elkaar
leggen voor T21: op een telefoon brak de tabbalk van TeamAssist over drie
regels af, met een rode streep onder het gekozen tabblad.

- **Het blok van YOAssist**, op elk scherm: een grijs vlak met de tabbladen
  naast elkaar. Het gekozen tabblad staat er als wit vlak in. In donkere
  modus is het vlak donkergrijs en het gekozen tabblad de achtergrondkleur.
- **Altijd één rij.** Iemand die ADMIN, coach en official is, heeft zes
  tabbladen; die passen niet naast elkaar op een telefoon.
  - De rij schuift met de vinger.
  - Het gekozen tabblad schuift vanzelf in beeld, ook als het vanuit een
    ander scherm gekozen wordt (Mijn agenda → Aanduidingen).
  - Een vervaagde rand toont aan welke kant er nog tabbladen staan. Zonder
    die rand leek de rij na *Cluboverzicht* te stoppen.
- **Weinig tabbladen** vullen de breedte, zoals in YOAssist. Op een laptop
  passen er zes, en daar schuift niets.
- **Overzicht staat altijd vooraan**, ook voor een official. Iedereen begint
  bij Mijn agenda, die al toont hoeveel er nog te beantwoorden is.
  - Dit is een bewuste afwijking van YOAssist, waar een official bij
    Aanduidingen begint. Bij de overstap (fase 5) moet dat in de uitnodiging
    staan.
  - De rest van de volgorde blijft: Aanduidingen, Cluboverzicht, Regio,
    Ploegen, Personen.

## Vorm van een API-antwoord

Ongewijzigd.

## Tests

1023 tests, allemaal groen.

In `navigatie.test.mjs`:
- de volgorde (Overzicht vooraan, ook voor een official en voor een ouder van
  een official, en de volledige volgorde voor iemand met alles);
- het blok in de CSS (één rij, niet afbreken, de breedte vullen, het witte
  vlak);
- het in beeld schuiven en de vervaagde rand.

Die laatste test leest enkel de broncode. Wat het schuiven echt doet, heb ik
in Chromium nagekeken (zie hieronder).

Rood tegen de fout, telkens één keer gedraaid:
- Aanduidingen weer vooraan;
- de tabbalk weer over meerdere regels;
- een tabblad dat afbreekt;
- het gekozen tabblad niet meer in beeld schuiven.

## In de browser bekeken

In Chromium, tegen de echte handlers, met iemand die zes tabbladen heeft:
- **Telefoon (390 px):** één rij van 44 px hoog, met Overzicht gekozen en de
  rechterrand vervaagd. Na een tik op *Personen* schoof de rij mee: Personen
  stond volledig in beeld, en de linkerrand vervaagde.
- **Telefoon in donkere modus:** hetzelfde gedrag.
- **Laptop (1200 px):** zes tabbladen op één rij, zonder schuiven en zonder
  vervaging.

Onderweg rechtgezet: de rij begon 4 px verschoven, omdat ze uitlijnde op het
tabblad in plaats van op de binnenrand. Daardoor vervaagde ook de linkerrand.
De oplossing was `scroll-padding-inline`.

Er waren geen JavaScript-fouten.
