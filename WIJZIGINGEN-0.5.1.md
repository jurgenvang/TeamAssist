# TeamAssist 0.5.1 — zeggen wat er misgaat bij het aanmelden

Vorige versie: 0.5.0

## Databank

Niets aan het schema. Wel het nakijken waard:

```sql
SELECT * FROM seizoenen;
```

Staat daar geen rij met `actief = 1`, dan antwoordt elke route met 409 en kan de
app niets tonen. Dat oplossen:

```sql
INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
```

## Configuratie

Niets.

## Wat er wijzigt

Een fout in het scherm. Na een geslaagde aanmelding werd enkel een 200 en een
403 opgevangen; elke andere uitkomst viel stilzwijgend terug op het
aanmeldformulier. Wie op zijn link klikte kwam dan gewoon terug op het scherm
waar hij zijn adres moest invullen, alsof de link niet werkte — terwijl hij wel
degelijk binnen was en de installatie iets miste.

Wat er nu getoond wordt:

| Uitkomst | Wat de gebruiker leest |
|---|---|
| 403 | het adres is nog niet gekoppeld aan iemand in TeamAssist |
| 409 | er is nog geen actief seizoen ingesteld |
| 401 | de aanmelding is verlopen, vraag een nieuwe link |
| overige | de status en de uitleg die de app meegaf |

**De sessie wordt enkel bij een 401 weggegooid.** Bij een 409 opnieuw laten
aanmelden lost niets op en verbergt de oorzaak. Er staat een test op die telt dat
er binnen die functie precies één plaats is die de sessie wist.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `public/index.html` | elke uitkomst van `/api/mij` wordt uitgelegd |
| `test/frontend.test.mjs` | twee tests erbij |
| `src/versie.js` | 0.5.0 → 0.5.1 |
| `schema-controle.sql` | enkel het versienummer |

## Tests

181, allemaal groen. Ter controle het stille terugvallen bij een 409 opnieuw
ingebouwd: 1 test rood.
