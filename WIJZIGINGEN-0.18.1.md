# TeamAssist 0.18.1 — aanmelden met een cijfercode, voor iPhone-app-gebruikers

Vorige versie: 0.18.0

## Databank

Niets.

## Configuratie — BELANGRIJKE, HANDMATIGE STAP

**Zonder deze stap doet deze versie niets: de mail toont dan nog steeds enkel
een link, geen code.** In het Supabase-dashboard: Authentication → Email
Templates → **Magic Link**. Voeg `{{ .Token }}` toe aan de tekst van de mail,
bijvoorbeeld:

```
Je kan aanmelden via de link hieronder, of deze code intypen in de app:

{{ .Token }}

{{ .ConfirmationURL }}
```

De link blijft dus ook staan — voor wie op een computer of gewoon in Safari
aanmeldt, verandert er niets.

## Aanleiding

Op een iPhone waar TeamAssist als app op het beginscherm staat, werkte
aanmelden niet: de link in de mail opent in Safari, niet in de app zelf. Dat
is geen instelling die iemand vergat, maar een grens van iOS — een
'toegevoegd aan beginscherm'-app en Safari delen geen sessie-opslag. Wie zich
in Safari aanmeldt, blijft in de app gewoon op het aanmeldscherm staan: die
omgeving ziet daar niets van.

## Wat er wijzigt

Naast de link krijg je nu ook een zescijferige code. Bij het aanmeldscherm
staat een uitklapbaar stuk ("Liever de code intypen dan op de link
klikken?") met een invoerveld. Die code wordt rechtstreeks bij Supabase
geverifieerd (`POST {SUPABASE_URL}/auth/v1/verify`, `type: 'email'`) —
volledig binnen dezelfde app-omgeving, geen tweede browser nodig, dus geen
probleem.

**Bewust rechtstreeks naar Supabase, niet via de eigen `/api/aanmeldlink`-
route.** Die route bestaat om te verhinderen dat iemand via TeamAssist mails
laat versturen naar willekeurige adressen, op het quota van de club. Een code
verifiëren verstuurt niets meer — Supabase begrenst zelf hoe vaak een code
fout geraden mag worden, dezelfde bescherming die de link zelf ook al had.

**Beide wegen komen samen in dezelfde afrondingslogica**
(`voltooiAanmelding()`) — of de tokens nu uit het URL-fragment komen (na een
klik op de link) of uit het codeformulier, de rest van het aanmeldproces
(`/api/mij` bevragen, de juiste melding tonen) loopt maar op één plaats.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `public/js/api.js` | `verifieerCode()`: rechtstreeks naar Supabase |
| `public/index.html` | het uitklapbare codeveld bij het aanmeldscherm |
| `public/js/app.js` | `voltooiAanmelding()` als gedeelde afronding; het codeformulier ingehaakt |
| `test/frontend.test.mjs` | drie tests erbij |
| `src/versie.js` | 0.18.0 → 0.18.1 |

## Tests

597, allemaal groen. Eén fout ingebouwd ter controle: `type: 'email'` naar het
verouderde (en bij Supabase kapotte) `type: 'magiclink'` veranderen — 1 rood.
