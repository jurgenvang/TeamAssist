# TeamAssist 0.1.2 — wat er wijzigde

Vorige versie: 0.1.1

## Databank

Niets. Het schema is ongewijzigd; `schema-controle.sql` verandert enkel omdat het
versienummer in de kopregel staat. Draai je ze toch, dan hoort er `ALLES OK` te
verschijnen.

## Configuratie — actie nodig

De namen van de secrets bij de Worker zijn gewijzigd. Staan ze er al onder de
oude naam, verwijder die dan.

| Oud | Nieuw |
|---|---|
| `SUPABASE_ANON_SLEUTEL` (0.1.0) / `SUPABASE_PUBLIEKE_SLEUTEL` (0.1.1) | `SUPABASE_PUBLISHABLE_KEY` |
| — | `SUPABASE_JWKS_URL` (nieuw, aanbevolen) |
| `SUPABASE_JWT_SECRET` | ongewijzigd, en meestal niet nodig |

```
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_JWKS_URL
```

`SUPABASE_SECRET_KEY` bestaat bewust niet. De secret key (`sb_secret_...`)
vervangt `service_role` en omzeilt alle beveiliging; TeamAssist heeft ze nergens
voor nodig. Ze is ook iets anders dan het JWT-geheim, ook al lijken de namen op
elkaar: het eerste geeft toegang, het tweede controleert handtekeningen.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/versie.js` | 0.1.1 → 0.1.2 |
| `src/lib/supabase.js` | `SUPABASE_JWKS_URL` wordt gebruikt indien ingesteld; anders worden de twee bekende paden geprobeerd. Een `sb_secret_`-sleutel in `SUPABASE_JWT_SECRET` wordt geweigerd vóór er iets anders gebeurt. |
| `src/lib/ping.js` | hernoemde secret |
| `src/index.js` | hernoemde secret; het veld in `/api/config` heet nu `supabase_publishable_key` |
| `public/index.html` | volgt de hernoemde veldnaam |
| `test/supabase-jwks.test.mjs` | twee tests erbij: de ingestelde JWKS-URL wordt gebruikt, en een secret key wordt geweigerd |
| `test/ping.test.mjs` | hernoemde secret |
| `schema-controle.sql` | enkel het versienummer in de kop |
| `README.md` | uitleg over waar de sleutels staan en welke je niet nodig hebt |

## Tests

89, allemaal groen, met `cd test && npm test`.
