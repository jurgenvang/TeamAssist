# TeamAssist 0.1.3 — het fundament

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

**Controleer daarna of het gelukt is.** Plak `schema-controle.sql` in dezelfde
console. Die query wijzigt niets en vergelijkt wat er staat met wat er hoort te
staan. Bovenaan verschijnt `ALLES OK`, of een aantal met daaronder de tabellen,
indexen en kolommen die ontbreken. Doe dit bij elke release waar de databank
mee verandert — de fout die dit vangt, is de ALTER die je vergat, en die meldt
zich anders pas weken later met `no such column`.

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

De ping stuurt de sleutel enkel in de `apikey`-kop en niet in een
`Authorization`-kop: een publishable-sleutel daarin levert een 401 op.

**3. De aanmeldmethode.** Zet e-mail aan en wachtwoorden uit, en voeg het adres
van de Worker toe bij de toegelaten redirect-URL's.

## Waar je de sleutels vindt

**Het adres van het project.** Settings, dan API Keys — of de knop Connect
bovenaan. Het heeft de vorm `https://<project-ref>.supabase.co`.

**De publieke sleutel.** Settings, dan API Keys, tabblad met de publishable en
secret keys. Kopieer de publishable sleutel; ze begint met `sb_publishable_`.
Toont dat tabblad enkel een knop om nieuwe sleutels aan te maken, dan staat het
project nog op de oude sleutels — die knop is veilig en laat de bestaande
sleutels ongemoeid. Een ouder project kan ook de `anon`-sleutel uit het tabblad
Legacy gebruiken; die werkt nog, maar wordt eind 2026 afgevoerd.

**De secret key heb je niet nodig.** TeamAssist gebruikt ze nergens: de Worker
verifieert tokens en doet een publieke leesoproep. Een sleutel die alle
beveiliging omzeilt, hoort niet in een applicatie die ze niet nodig heeft.

**Het JWT-geheim, enkel indien nodig.** Settings, dan JWT Keys. Staat het project
nog op het oude gedeelde geheim, dan heb je het nodig; ben je overgestapt op JWT
signing keys, dan niet. Dat laatste is het advies: dan verifieert de Worker de
handtekening zelf, zonder bij elke oproep de Auth-server te bevragen.

## Secrets bij de Worker

```
npx wrangler secret put SUPABASE_URL                # https://xxx.supabase.co
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY    # sb_publishable_...
npx wrangler secret put SUPABASE_JWKS_URL           # de JWKS-URL uit het dashboard
```

Met die drie is het rond. `SUPABASE_JWKS_URL` is strikt genomen optioneel — zonder
die instelling leidt de Worker het adres af uit `SUPABASE_URL` en probeert hij de
twee paden die Supabase gebruikt. Ze invullen is beter: geen giswerk, en geen
mislukte oproep bij elke koude start.

**`SUPABASE_SECRET_KEY` staat hier niet, en dat is opzettelijk.** De secret key
(`sb_secret_...`) vervangt `service_role` en omzeilt alle beveiliging. TeamAssist
heeft ze nergens voor nodig. Ze is ook iets anders dan het JWT-geheim, ook al
klinken de namen gelijk: het eerste geeft toegang, het tweede controleert
handtekeningen.

**`SUPABASE_JWT_SECRET`** bestaat nog als terugval, voor een project dat nog met
een gedeeld geheim ondertekent (Settings, dan JWT Keys). Ben je overgestapt op JWT
signing keys — en dat is het geval zodra het dashboard je een JWKS-URL toont — dan
heb je hem niet nodig en laat je hem leeg. Staat er per ongeluk een `sb_secret_`
in, dan weigert de Worker elk token met een duidelijke melding in plaats van
stilzwijgend iets anders te doen.

De `alg` uit het token bepaalt nooit welke weg gekozen wordt; dat is precies het
lek dat je niet wil.

De publishable key is geen geheim — ze staat in de pagina, zoals bedoeld. Ze gaat
hier toch als secret mee, omdat wat in `wrangler.toml` staat bij elke deploy
overschreven wordt.

De publieke sleutel is geen geheim — ze staat in de pagina, zoals bedoeld. Ze
gaat hier toch als secret mee, omdat wat in `wrangler.toml` staat bij elke deploy
overschreven wordt.

De D1-databank heet `teamassist` en heeft id
`0180e02c-f331-4f75-9e29-3f8f004ca1b5`; dat staat al ingevuld in
`wrangler.toml`. Het is geen geheim maar een verwijzing — zonder toegang tot het
Cloudflare-account valt er niets mee te doen. Als secret of variabele kan het
overigens niet: een binding wordt bij het deployen opgelost, vóór er iets van
`env` bestaat.

## Bij een volgende versie

`schema-controle.sql` wordt gegenereerd uit `schema.sql` en niet met de hand
bijgehouden:

```
node tools/genereer-controle.mjs
```

Er staat een test op die faalt zodra de twee uit elkaar lopen. In YOAssist bleef
de backuplijst jarenlang achter op het schema, telkens wanneer er een tabel
bijkwam, precies omdat zo'n test er niet was.

## Wat er nog niet is

Berichten worden nog niet verstuurd. De instelling `bericht_modus` staat bij een
verse installatie op `omleiden` en hoort daar te blijven tot de club van start
gaat — er is geen aparte testomgeving, dus dat is de enige rem.

De rechten `financieel.bekijken`, `personen.beheren` en
`persoonsgegevens.bekijken` bestaan al maar hangen nog aan geen enkele route.
Ze staan er zodat de rollen FINADM en ADMIN nu al kloppen.
