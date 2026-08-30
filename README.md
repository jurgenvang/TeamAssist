# TeamAssist 0.1.0 — het fundament

Eerste pakket. Het bevat geen functionaliteit voor de club: geen
synchronisatie, geen import, geen aanwezigheden. Wat het wel bevat, is het
geraamte waar al die dingen op komen te staan, en de zwaarst geteste laag van de
applicatie.

## Wat erin zit

- Het volledige schema voor personen, accounts, rollen, teams, spelers,
  ouder-kindkoppelingen, logboek, instellingen en taken.
- Aanmelden via Supabase Auth met een magic link, geverifieerd in de Worker.
- De rechtenlaag: één functie die zegt wat iemand mag, met 21 tests die voor
  elke rol en elk recht zowel bewijzen dat het mag als dat het niet mag.
- De uurplanner, met daarin de dagelijkse `supabase-ping`.
- Eén scherm: wie ben je, welke rollen heb je, op welke ploegen, en welke
  rechten volgen daaruit.

78 tests, met `cd test && npm test`. Ze draaien zonder netwerk en zonder één
dependency: `node:sqlite` doet dienst als D1. Node 22 of nieuwer is nodig.

## Databank

Dit is de eerste installatie, dus geen ALTER maar een volledige opbouw. Voer
`schema-alles-in-een.sql` uit in de D1-console. Dat bestand begint met de
DROP's, zodat het ook later herbruikbaar is bij een schemawijziging die niet met
`ALTER TABLE ... ADD COLUMN` kan.

Daarna één rij handmatig, want zonder actief seizoen weigert elke route:

```sql
INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
```

En jezelf als eerste beheerder, met het adres waarmee je je gaat aanmelden:

```sql
INSERT INTO personen (id, voornaam, achternaam, email)
     VALUES ('p-jurgen', 'Jurgen', 'van Geijstelen', 'jouw@adres.be');
INSERT INTO rollen (persoon_id, rol) VALUES ('p-jurgen', 'ADMIN');
```

## Supabase opzetten

Drie dingen, in deze volgorde.

**1. Het project aanmaken, met regio EU.** Dat kies je bij het aanmaken en het
verhuist niet zomaar; er komen e-mailadressen van ouders en spelers in. Zet het
op een clubadres en niet op een persoonlijke mailbox, en voeg meteen een tweede
persoon toe als organisatielid.

**2. De ping-tabel.** Een gratis project dat een week lang te weinig
databankactiviteit krijgt, wordt gepauzeerd, en dan raakt niemand meer binnen.
De uurcron doet daarom dagelijks om 4 uur een leesoproep. Daarvoor moet er iets
te lezen zijn:

```sql
create table ping (id bigint primary key generated always as identity);
insert into ping default values;
alter table ping enable row level security;
create policy "ping is leesbaar" on ping for select using (true);
```

**3. De aanmeldmethode.** Zet e-mail aan en wachtwoorden uit, en voeg het adres
van de Worker toe bij de toegelaten redirect-URL's.

## Secrets bij de Worker

```
npx wrangler secret put SUPABASE_URL              # https://xxx.supabase.co
npx wrangler secret put SUPABASE_ANON_SLEUTEL     # de publieke anon-sleutel
npx wrangler secret put SUPABASE_JWT_SECRET       # enkel als het project met HS256 ondertekent
```

`SUPABASE_JWT_SECRET` is optioneel. Staat hij er niet, dan haalt de Worker de
publieke sleutels op bij het project zelf (JWKS) — de weg die nieuwere projecten
gebruiken. Staat hij er wel, dan wordt het gedeelde geheim gebruikt. De `alg`
uit het token bepaalt die keuze nooit; dat is precies het lek dat je niet wil.

Vul ook `database_id` in `wrangler.toml` in na het aanmaken van de D1-databank.

## Wat er nog niet is

Berichten worden nog niet verstuurd. De instelling `bericht_modus` staat bij een
verse installatie op `omleiden` en hoort daar te blijven tot de club van start
gaat — er is geen aparte testomgeving, dus dat is de enige rem.

De rechten `financieel.bekijken`, `personen.beheren` en
`persoonsgegevens.bekijken` bestaan al maar hangen nog aan geen enkele route.
Ze staan er zodat de rollen FINADM en ADMIN nu al kloppen.
