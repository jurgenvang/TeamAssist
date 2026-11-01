# TeamAssist 0.39.2 — T20: langer aangemeld blijven

## Wat en waarom

Jurgen moest te vaak opnieuw aanmelden, en de mail bevatte geen code.
Supabase laat een sessie op het gratis plan nooit vervallen. Wat iemand
afmeldde, zat dus in de app zelf:

1. **Twee verversingen tegelijk.** Kregen twee oproepen tegelijk een 401,
   dan ververste elk met hetzelfde token. Supabase draait dat token bij elk
   gebruik. Een token dat buiten de wachttijd opnieuw opduikt, trekt de
   hele sessie in.
2. **Een storing meldde af.** Elke mislukte verversing (ook een 5xx of een
   gepauzeerd project) wiste de sessie. Kon de Worker de publieke sleutels
   (JWKS) niet ophalen, dan gaf hij een 401 op een geldig token.
3. **Safari wist wat een pagina zelf bewaart** na 7 dagen zonder bezoek. De
   sessie stond in `localStorage`.

Wat er nu gebeurt:

- **Het verversingstoken staat in een cookie die de Worker zet:**
  `ta_sessie`, HttpOnly, Secure, SameSite=Strict, Path=/api/sessie/,
  400 dagen. De cookie wordt bij elke verversing opnieuw gezet. Het
  toegangstoken staat enkel in het geheugen van de pagina. Een script kan
  het verversingstoken dus niet meer lezen.
- **Drie publieke routes** (`src/routes/sessie.js`):
  - `POST /api/sessie/start`: krijgt het token uit de link of de code en
    ververst meteen, zodat het token dat in de URL stond niet meer geldt.
    Het antwoord bevat enkel het toegangstoken.
  - `POST /api/sessie/vernieuw`: ververst met het token uit de cookie.
  - `POST /api/sessie/stop`: haalt de cookie weg en meldt af bij Supabase.
- **Enkel een 400/401 van Supabase meldt af.** Al de rest is een 503: de
  cookie blijft, en de app toont "Het aanmeldsysteem is even niet
  bereikbaar. Je blijft aangemeld". Een onbereikbare JWKS geeft ook een
  503 (`e.storing` in `supabase.js` en `index.js`).
- **De browser ververst nooit twee keer tegelijk** (`vernieuw()` in
  `public/js/api.js`). Wie een verversing vraagt terwijl er een loopt,
  wacht op die.
- **Wie al aangemeld is, blijft aangemeld.** Een sessie in de oude opslag
  gaat bij het openen één keer mee naar de cookie, en de oude opslag wordt
  daarna leeggemaakt.
- **De code:** het veld neemt 6 tot 10 cijfers. De README legt uit dat
  `{{ .Token }}` in *Magic Link* én in *Confirm signup* moet. Die tweede
  sjabloon krijgt wie zich met een adres voor het eerst aanmeldt; dat
  verklaart waarschijnlijk waarom er geen code in de mail stond.

Ook: `test/officials-overzicht.test.mjs` faalde op zondag. De test legde
wedstrijden op de zaterdag van het lopende weekend, en op zondag is die
zaterdag al voorbij. De test gebruikt nu de zondag. De app zelf deed niets
fout.

## Wat Jurgen moet doen

1. In Supabase, bij Authentication → Email Templates, `{{ .Token }}` in
   *Magic Link* én in *Confirm signup* zetten (zie de README).
2. Niets aan de Worker: geen nieuwe secret, geen nieuwe instelling.

## Databank

Geen schemawijziging. `schema-controle.sql` is opnieuw gegenereerd voor het
versienummer.

## Tests

977, allemaal groen. Nieuw is `test/sessie.test.mjs` (8 tests). Die dekt:

- `ververs`: ok, ongeldig (400/401), storing (429/5xx/530/netwerk/half
  antwoord);
- de eigenschappen van de cookie;
- `start`, `vernieuw` en `stop`;
- een 503 bij een onbereikbare of gepauzeerde JWKS, en een 401 bij een
  valse handtekening;
- de browserkant via `api.js`: de overzetting uit de oude opslag, drie
  gelijktijdige 401's met één verversing, en een storing die niet
  afmeldt.

Gewijzigd: `frontend.test.mjs` (afmelden enkel bij 401, niet bij 503) en
`routes.test.mjs` (de drie nieuwe publieke routes).

Rood tegen de fout, telkens één keer gedraaid:

- zonder de wachtrij in `vernieuw()`: de browsertest faalt (drie
  verversingen);
- elke niet-200 als 'ongeldig': tests 1 en 5 falen;
- zonder `e.storing` in `bouwContext`: de JWKS-test faalt (401).

In Chromium bekeken met een nep-API: geen sessie toont het aanmeldscherm,
een geldige cookie opent de app, een storing toont de melding zonder af
te melden.

## Vorm van een API-antwoord

Nieuw, geen bestaande velden gewijzigd. De frontend haalt geen tokens meer
rechtstreeks bij Supabase op: het verversen gaat via de Worker. Enkel de
code wordt nog rechtstreeks bij Supabase nagekeken (`/auth/v1/verify`).
