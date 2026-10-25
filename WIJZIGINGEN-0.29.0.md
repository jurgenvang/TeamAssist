# TeamAssist 0.29.0 — I1 fase 1c: pushmeldingen

Vorige versie: 0.28.0

Derde en laatste pakket van fase 1 van de integratie met YOAssist (backlog
I1). Daarmee staat de schil: kopbalk en menu's (0.27.0), Mijn berichten en
belangrijk nieuws (0.28.0), en nu meldingen op de telefoon.

## Databank — geen ALTER, geen DROP

Voer `migratie-0.29.0.sql` uit in de D1-console: één nieuwe tabel,
`push_abonnementen`, met haar index. Veilig herhaalbaar. Daarna
`schema-controle.sql` (bovenaan: `ALLES OK`). Getoetst tegen het schema van
0.28.0, twee keer na elkaar: daarna exact dezelfde structuur als een verse
`schema.sql`.

## Configuratie — drie secrets

```
node tools/maak-vapid.mjs
npx wrangler secret put VAPID_PUBLIEK
npx wrangler secret put VAPID_PRIVE
npx wrangler secret put VAPID_CONTACT     # een mailadres
```

Zonder die drie werkt alles zoals voorheen, per mail; Mijn voorkeuren zegt
dan dat meldingen nog niet ingesteld zijn. Staat ook in de README.

## Wat er wijzigt

**`kanaal_voorkeur` wordt eindelijk gevolgd.** Sinds 0.19.0 kon je kiezen
tussen mail, melding of beide, maar iedereen kreeg mail. Nu:

- *Mail*: enkel mail.
- *Melding*: een melding op elk ingeschreven toestel. Komt er op geen enkel
  toestel iets aan — geen toestel ingeschreven, of ze falen allemaal — dan
  toch een mail. Liever een mail te veel dan een bericht dat nergens
  aankomt. Dat staat dan ook in het logboek, zodat een beheerder ziet wie
  push wil maar het niet krijgt.
- *Beide*: mail én melding. In Mijn berichten één keer, niet twee keer.

Push vertrekt enkel in de modus *normaal*. In *omleiden* kan een melding niet
naar een testadres omgeleid worden, en naar de echte persoon mag ze dan net
niet.

**Meldingen op dit toestel**, onderaan Mijn voorkeuren. Wat er staat, komt
van het abonnement van dít toestel, niet van de voorkeur in de databank: die
zegt wat je wil, niet of het hier ooit gelukt is (in YOAssist liepen die
twee ooit uiteen). Aanzetten vraagt de toestemming van de browser en schrijft
het toestel in; wie enkel mail had, gaat daarbij naar *beide*. Uitzetten
meldt eerst af bij de server en dan in de browser; was het het laatste
toestel van iemand die enkel meldingen wilde, dan gaat de voorkeur terug naar
mail. Een knop stuurt een **testmelding** naar je eigen toestellen — ook in
de modus *omleiden*, want die gaat enkel naar jou.

**Op een iPhone** kan dat enkel als TeamAssist op het beginscherm staat; het
scherm legt uit hoe. Daarvoor zijn er nu een **manifest** en een **icoon**
(een donker vlak met *TA*, in de kleuren van de kopstrook — voorlopig, een
eigen ontwerp kan het zo vervangen).

**Tikken op een melding opent Mijn berichten.** Staat de app al open, dan
komt ze naar voren en opent het scherm zonder herladen; anders opent ze met
`/?open=berichten`. Een melding die binnenkomt terwijl de app openstaat,
werkt meteen het bolletje bij. Dit is het mechanisme waar V32 over gaat: of
het op een echte telefoon ook zo aanvoelt, moet nog getest worden.

**Een verlopen toestel ruimt zichzelf op.** Meldt de pushdienst dat een
abonnement niet meer bestaat (404 of 410), dan wordt het meteen gewist. Een
gewone mislukking telt op in `mislukt`; een geslaagde zet `laatst_ok`. Dat
is de basis voor het overzicht 'wie krijgt meldingen' bij Beheer (V26 uit
YOAssist), dat met de gebruikersschermen meekomt.

## Overgenomen uit YOAssist

`src/lib/push.js` (VAPID-JWT en aes128gcm met WebCrypto) en `public/sw.js`,
zoals ze daar sinds v0.12 draaien. Eén aanpassing: `stuurPush` krijgt de
fetch mee, zoals `mailer.js`, zodat het zonder netwerk te testen is.

Nieuw ten opzichte van YOAssist: **een test die een melding echt ontcijfert**,
precies zoals een browser het doet (RFC 8291). YOAssist keek enkel de vorm na
(lengte van het kopstuk, recordgrootte). Een melding die niet exact klopt,
gooit de browser stil weg — dus de vorm is niet genoeg.

## Niet in dit pakket

- **Een mededeling** gaat nog enkel per mail en als banner, niet als
  melding. Push naar honderden toestellen tegelijk vraagt evenveel uitgaande
  oproepen, en een Worker mag er per aanroep maar een beperkt aantal doen.
- **Het overzicht 'wie krijgt meldingen'** bij Beheer: komt mee met de
  gebruikersschermen van de module Officials.
- **Push echt getest op een toestel**: kan niet vanuit de ontwikkelomgeving.
  Headless Chromium meldt meldingen altijd als geblokkeerd, en een echte
  pushdienst is er niet bereikbaar. Bekeken: het scherm, en het openen van
  Mijn berichten via `/?open=berichten`. De eerste echte test is dus aan jou —
  dat is meteen V32.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `schema.sql` | tabel `push_abonnementen` |
| `migratie-0.29.0.sql` | nieuw |
| `schema-alles-in-een.sql`, `schema-kaal.sql`, `schema-controle.sql` | opnieuw gegenereerd |
| `src/lib/push.js` | nieuw, uit YOAssist; fetch injecteerbaar |
| `src/lib/verwittigen.js` | `verwittig()` volgt `kanaal_voorkeur`, met terugval op mail; `pushNaarToestellen()`, `verwittigTest()` |
| `src/lib/opkuis.js` | toestellen gaan mee bij het verwijderen van een persoon |
| `src/routes/push.js` | nieuw: inschrijven, afmelden, mijn toestellen, testmelding |
| `src/index.js` | vier routes; `vapid_publiek` in `/api/config` |
| `public/sw.js` | nieuw: de service worker |
| `public/manifest.json`, `public/icoon/` | nieuw: manifest en icoon |
| `public/index.html` | manifest en icoon in de kop; *Meldingen op dit toestel* in Mijn voorkeuren |
| `public/js/schermen/meldingen.js` | nieuw |
| `public/js/schermen/voorkeuren.js` | toont de status van dit toestel |
| `public/js/app.js` | knoppen, `?open=berichten`, boodschappen van de service worker |
| `tools/maak-vapid.mjs` | nieuw: een VAPID-sleutelpaar maken |
| `test/push.test.mjs` | nieuw: 16 tests |
| `test/verwittigen.test.mjs` | één test hernoemd (de terugval bestaat nog, de reden is nu 'geen toestel') |
| `test/frontend.test.mjs` | 8 tests erbij |
| `test/routes.test.mjs` | de vier routes over jezelf |
| `README.md` | de VAPID-secrets |
| `src/versie.js` | 0.28.0 → 0.29.0 |
| `.claude/BACKLOG.md` | 0.29.0; fase 1 van I1 af |

## Tests

810, allemaal groen. Ter controle telkens een fout ingebouwd: een verkeerd
scheidingsteken in de versleuteling (1 rood — de ontcijfertest), geen
terugval op mail bij een falend toestel (3 rood), push ook in de modus
*omleiden* (1 rood), en in de browser eerst uitschrijven en dan pas afmelden
bij de server (1 rood).

## API-vorm

`/api/config` krijgt `vapid_publiek` erbij; vier nieuwe routes. Niets
hernoemd of weg.
