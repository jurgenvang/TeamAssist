# TeamAssist 0.2.0 — wie een link mag vragen

Vorige versie: 0.1.4

## Databank — actie nodig

Eén kolom erbij. Een `ALTER TABLE` volstaat; niets hoeft gedropt te worden.

```sql
ALTER TABLE personen ADD COLUMN laatste_aanmeldlink TEXT;
```

Draai daarna `schema-controle.sql`: er hoort `ALLES OK` te verschijnen. Zie je
`kolom | personen.laatste_aanmeldlink`, dan is de ALTER niet uitgevoerd.

## Configuratie

Niets te doen.

## Wat er wijzigt

De frontend vroeg de aanmeldlink rechtstreeks bij Supabase. Daardoor kon
iedereen die de pagina opende mails laten versturen naar willekeurige adressen —
op het quota van de club — en liep de wachtrij vol met mensen die niets met de
club te maken hebben.

De aanvraag loopt nu via `POST /api/aanmeldlink`. Die route kijkt eerst of het
adres bij een actieve persoon hoort en vraagt de link alleen dan aan bij
Supabase.

**Het antwoord is altijd hetzelfde**, of het adres nu bekend is of niet: *is dat
adres bij ons bekend, dan is er een link onderweg*. Zou het verschillen, dan is
de route te gebruiken om af te tasten wie er lid is van de club, met namen van
minderjarigen erachter. Om dezelfde reden komt het adres van een onbekende
aanvrager niet in het logboek — enkel dat er een aanvraag was.

Er geldt een wachttijd van één minuut per persoon. Wie de knop twee keer aantikt
omdat de mail niet meteen aankomt, krijgt geen tweede link die de eerste
ongeldig maakt.

**Voor de eerste beheerder verandert er niets.** Jouw adres staat in `personen`,
gezet via de D1-console, en dat is precies wat de controle nakijkt. Er zijn geen
hardcoded adressen — die zouden een achterdeur zijn die elke databankwijziging
overleeft, en wijzigen zou een deploy vragen. Raak je ooit je ADMIN-rol kwijt,
dan is de D1-console de weg terug.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/routes/aanmeldlink.js` | nieuw |
| `src/index.js` | de route ingehaakt als publiek |
| `schema.sql` | kolom `personen.laatste_aanmeldlink` |
| `public/index.html` | vraagt de link via de eigen route |
| `test/aanmeldlink.test.mjs` | nieuw, twaalf tests |
| `test/frontend.test.mjs` | de controle op `redirect_to` verhuisde naar de backend |
| `test/routes.test.mjs` | de nieuwe publieke route |
| `src/versie.js` | 0.1.4 → 0.2.0 |
| `schema-controle.sql` | de nieuwe kolom en het versienummer |
| `schema-alles-in-een.sql`, `schema-kaal.sql` | hergenereerd; enkel nodig bij een verse installatie |
| `README.md` | uitleg bij de route |

## Tests

103, allemaal groen. Twee ingebouwde fouten ter controle: de persoonscontrole
weghalen maakt 4 tests rood, een verschillend antwoord voor een onbekend adres 1.
