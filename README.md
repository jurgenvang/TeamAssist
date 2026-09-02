# TeamAssist 0.3.1 — het fundament

Eerste pakket. Het bevat geen functionaliteit voor de club: geen
synchronisatie, geen import, geen aanwezigheden. Wat het wel bevat, is het
geraamte waar al die dingen op komen te staan, en de zwaarst geteste laag van de
applicatie.

## Wat erin zit

- Het volledige schema voor personen, accounts, rollen, teams, spelers,
  ouder-kindkoppelingen, logboek, instellingen en taken.
- Aanmelden via Supabase Auth met een magic link, geverifieerd in de Worker. De
  link wordt aangevraagd via `/api/aanmeldlink`, die eerst nakijkt of het adres
  bij een actieve persoon hoort — anders kan iedereen via de app mails laten
  sturen naar willekeurige adressen, op ons quota.
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

### De eerste twee dingen die er handmatig in moeten

Het schema levert een lege databank op. Twee dingen ontbreken dan nog, en zonder
allebei raakt niemand binnen: een actief seizoen — elke route weigert met een 409
zonder — en één persoon met de rol ADMIN.

Dat handmatig invoeren is meteen het bootstrapmechanisme. Er staan geen adressen
in de code: een hardcoded beheerder zou een achterdeur zijn die elke
databankwijziging overleeft, en ze wijzigen zou een deploy vragen. De D1-console
is ook de weg terug als er ooit niemand meer binnen raakt.

```sql
INSERT INTO seizoenen (code, naam, actief)
VALUES ('2026-27', '2026-2027', 1);

INSERT INTO personen (id, voornaam, achternaam, email)
VALUES ('p-jurgen', 'Jurgen', 'van Geijstelen', 'jurgenvang@gmail.com');

INSERT INTO rollen (persoon_id, rol)
VALUES ('p-jurgen', 'ADMIN');
```

Waar het bij de rol op aankomt: `team_guid` en `seizoen` blijven leeg. ADMIN
geldt clubbreed en over seizoenen heen, en het schema weigert de rij als er toch
een ploeg bij staat. `p-jurgen` is enkel een interne sleutel; die mag alles zijn
zolang hij uniek is.

Waar het bij het adres op aankomt: het moet **letterlijk** overeenkomen met wat
je bij Supabase gebruikt, in kleine letters. Daarop wordt gematcht bij je eerste
aanmelding, en daarop kijkt `/api/aanmeldlink` of er iets mag vertrekken. Bij
Gmail is dat een valkuil: punten vóór het apenstaartje negeert Gmail, maar wij
niet. Meld je je aan als `jurgen.vang@gmail.com`, dan komt de mail wel aan maar
vindt TeamAssist geen persoon en beland je in de wachtrij.

### Controleren of het klopt

```sql
SELECT p.email, p.actief, r.rol, s.code AS seizoen
  FROM personen p
  JOIN rollen r ON r.persoon_id = p.id
  LEFT JOIN seizoenen s ON s.actief = 1
 WHERE r.rol = 'ADMIN';
```

Eén rij, met `actief = 1` en een seizoen ingevuld. Staat er `NULL` bij seizoen,
dan ontbreekt die eerste insert nog.

### Een tweede beheerder

Doen vóór je verdergaat. Nu hangt alle toegang aan één rij; raakt dat adres
onbruikbaar, dan is de D1-console de enige weg terug.

```sql
INSERT INTO personen (id, voornaam, achternaam, email)
VALUES ('p-tweede', 'Voornaam', 'Achternaam', 'adres@example.org');

INSERT INTO rollen (persoon_id, rol) VALUES ('p-tweede', 'ADMIN');
```

### Waar de toegang in de databank staat

Drie tabellen, elk met een eigen taak. `personen` zegt wie je bent, met het
e-mailadres als sleutel. `rollen` zegt wat je mag. `accounts` zegt hoe je
binnenkomt: die rij ontstaat pas bij je eerste geslaagde aanmelding en legt de
Supabase-identiteit (`sub`) vast bij je persoon.

Raak je niet binnen, kijk dan in `aanmeldingen_wachtrij`. Daar staat het adres
waarmee je binnenkwam; het verschil met `personen.email` is meestal een
hoofdletter of een plusadres.

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

**3. De aanmeldmethode.** Authentication, dan URL Configuration. Twee velden, en
allebei zijn ze nodig:

- **Site URL** — het adres waarop de app draait, bijvoorbeeld
  `https://teamassist.jurgenvang.workers.dev`. Standaard staat hier
  `http://localhost:3000`.
- **Redirect URLs** — hetzelfde adres, plus een regel met `/**` eronder
  (`https://teamassist.jurgenvang.workers.dev/**`) zodat ook paden werken.

**Dit is de meest verwarrende stap van de hele opzet, dus expliciet:** Supabase
honoreert enkel redirect-adressen die op die tweede lijst staan. Staat een adres
er niet op, dan wordt het **stil vervangen** door de Site URL — geen foutmelding
bij het versturen, geen spoor in het logboek. De link komt dan uit op localhost
en het lijkt alsof de applicatie het adres niet meegeeft, terwijl Supabase het
weigert.

Draait de app op meerdere adressen — het workers.dev-adres én een eigen domein —
dan moeten ze allebei in de lijst. De applicatie stuurt namelijk het adres mee
van de pagina waar de link gevraagd werd, en dat kan van keer tot keer
verschillen.

**Nakijken zonder in te loggen.** Vraag een link aan en bekijk in de mail de
parameter `redirect_to` in de URL. Staat daar jouw adres, dan is het rond. Staat
er `localhost`, dan ontbreekt het adres in Redirect URLs.

Zet daarna bij Providers e-mail aan en wachtwoorden uit.

**4. Resend als SMTP-server.** Dit is geen verfijning maar een voorwaarde. De
ingebouwde mailservice van Supabase stuurt **twee berichten per uur** en is
uitdrukkelijk enkel voor testen bedoeld — er is geen garantie op levering en het
aantal kan zonder aankondiging wijzigen. Met een paar honderd leden komt daar
niets van terecht, en zelfs tijdens het opzetten loop je er binnen het halfuur
tegenaan.

Authentication, dan SMTP Settings, en Enable Custom SMTP aanzetten:

| Veld | Waarde |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` (letterlijk dat woord) |
| Password | een API-sleutel uit het Resend-dashboard |
| Sender email | een adres op een domein dat in Resend geverifieerd is |
| Sender name | TeamAssist |

Het afzenderadres moet op een geverifieerd domein staan, anders weigert Resend
het bericht. Controleer de exacte host en poort in het Resend-dashboard onder
SMTP; die kunnen wijzigen.

**Verhoog daarna de limiet.** Zodra er een eigen SMTP-server staat, legt Supabase
zelf een voorzichtige grens van dertig berichten per uur op, om de reputatie van
een nieuw domein te beschermen. Dat is te weinig voor het moment waarop je een
ploeg in één keer uitnodigt. De instelling staat bij Authentication, dan Rate
Limits.

**Bent u al geblokkeerd?** De limiet loopt per uur; een uur wachten volstaat.
Wat er precies misging, staat in Logs, dan Auth: daar verschijnt de melding over
de overschreden limiet. In TeamAssist zelf zie je dat niet — daar staat enkel
`aanmeldlink niet verstuurd` in het logboek, want de reden van Supabase hoort niet
op het scherm van wie een link vroeg.

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

## Als er iets misgaat bij het aanmelden

**De link komt uit op `localhost:3000`.** Het adres van de app staat niet bij
Redirect URLs in Supabase. Zie stap 3 hierboven. Let op de misleiding: Supabase
vervangt een niet-toegelaten adres zonder iets te melden, dus het lijkt op een
fout in de applicatie.

**"Nog geen toegang" na een geslaagde aanmelding.** Het adres uit het token staat
niet bij een actieve persoon. Kijk in `aanmeldingen_wachtrij`: daar staat het
adres waarmee je binnenkwam. Het verschil met `personen.email` is meestal een
hoofdletter, een plusadres, of bij Gmail een punt.

**Er komt geen mail, terwijl het adres wel klopt.** Kijk eerst naar de
maillimiet. Zonder eigen SMTP-server stuurt Supabase er twee per uur; met Resend
ingesteld dertig, tot je die grens verhoogt. In Logs, dan Auth staat de melding.
In het logboek van TeamAssist verschijnt dan `aanmeldlink niet verstuurd`, als
onafgehandelde regel.

**Er komt geen mail en het adres is misschien onbekend.** `/api/aanmeldlink`
verstuurt enkel naar een adres dat bij een actieve persoon hoort, en het antwoord op het scherm is altijd hetzelfde —
ook wanneer er niets vertrok. Dat is opzettelijk: een verschillend antwoord zou
de route bruikbaar maken om af te tasten wie er lid is van de club. Kijk in het
logboek: `aanvraag voor een onbekend adres` betekent dat het adres niet in
`personen` staat.

Er geldt ook een wachttijd van een minuut per persoon. Twee keer op de knop
tikken levert dus één mail op — bewust, want een tweede link maakt de eerste
ongeldig.

**Een link die niet meer werkt.** Elke link is eenmalig en vervalt na een uur.
Een fout daarover verschijnt nu op het aanmeldscherm in plaats van stilzwijgend
het formulier opnieuw te tonen.

## Wat er nog niet is

Berichten worden nog niet verstuurd. De instelling `bericht_modus` staat bij een
verse installatie op `omleiden` en hoort daar te blijven tot de club van start
gaat — er is geen aparte testomgeving, dus dat is de enige rem.

De rechten `financieel.bekijken`, `personen.beheren` en
`persoonsgegevens.bekijken` bestaan al maar hangen nog aan geen enkele route.
Ze staan er zodat de rollen FINADM en ADMIN nu al kloppen.
