# TeamAssist 0.3.0 — de bond bekijken vanuit de Worker

Vorige versie: 0.2.6

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

Het uitzoeken van de VBL-velden verhuist van een script op een laptop naar de
Worker. De aanleiding: een kantoornetwerk achter een proxy raakt niet bij
`vblcb.wisseq.eu`, en de ontwikkelomgeving ook niet — maar Cloudflare wel. Het
script `tools/vbl-veldonderzoek.py` blijft staan voor wie een onbeperkte
verbinding heeft, maar is niet langer nodig.

**Nieuw: `GET /api/admin/vbl-diagnose`**, achter het recht `systeem.beheren`.
Zonder parameter geeft ze de ploegenlijst van de club; met `?team=<guid>` een
samenvatting van die ploeg.

Die samenvatting bevat **geen namen**: tellingen, de sleutelpaden die in het
antwoord voorkomen, en een paar voorbeeldwaarden van velden waarvan het formaat
nog niet vastligt. Dat volstaat om de drie openstaande vragen te beantwoorden —
het formaat van `sGebDat`, de waarden van `ma`, de codes in `tvCaC` — zonder een
ledenlijst van minderjarigen door een scherm te halen. Er staat een test op die
faalt zodra er toch een naam in terechtkomt.

Met `?ruw=1` komt het volledige antwoord mee. Dat wordt apart gelogd, met een
andere tekst dan een gewone opvraging.

In het scherm staat er voor een beheerder een sectie bij met een invoerveld en
twee knoppen. Dat is nodig omdat de route een token in de header vraagt: een URL
rechtstreeks in de browser openen werkt niet.

**Waarom dit ook fase 2 vooruithelpt:** `src/lib/vbl.js` is de client die de
synchronisatie straks gebruikt. De valkuil die er meteen in vastligt: de twee
spaties in een ploeg-GUID moeten als `%20%20` over de lijn. Een `+` wordt door
deze server niet als spatie gelezen, en dat levert een generieke WCF-fout op die
op een storing lijkt terwijl de GUID het probleem is.

## Gebruik

Meld je aan, en onderaan het scherm verschijnt **Gegevens van de bond bekijken**.
Laat het veld leeg voor de ploegenlijst, of vul een GUID in zoals
`BVBL1125J16  2` — met twee spaties.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/vbl.js` | nieuw: client, GUID-encodering, samenvatting zonder namen |
| `src/routes/admin/vbl-diagnose.js` | nieuw |
| `src/index.js` | de route ingehaakt achter `systeem.beheren` |
| `public/index.html` | diagnosescherm voor beheerders |
| `test/vbl.test.mjs` | nieuw, veertien tests |
| `test/vbl-diagnose.test.mjs` | nieuw, zes tests |
| `src/versie.js` | 0.2.6 → 0.3.0 |
| `schema-controle.sql` | enkel het versienummer in de kop |
| `README.md` | versienummer |

## Tests

123, allemaal groen. Twee fouten ingebouwd ter controle: een `+` in plaats van
`%20%20` in de GUID maakt 1 test rood, namen laten lekken in de samenvatting 2.
