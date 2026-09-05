# TeamAssist 0.18.0 — Communicatie, eerste laag: mail + wedstrijdwijzigingen

Vorige versie: 0.17.0. Start van fase 5.

## Databank

E�n nieuwe tabel, geen `ALTER` op bestaande tabellen:

```sql
CREATE TABLE berichten (...)
```

Plus één nieuwe instelling, `mail_afzender`. Beide staan in
`migratie-berichten.sql`, met `IF NOT EXISTS`/`OR IGNORE` — veilig om per
ongeluk twee keer te draaien. **Getoetst tegen een nagemaakte bestaande
databank**: bestaande personen en logboekregels blijven ongewijzigd, de
nieuwe instelling komt er precies één keer bij ook na herhaalde migratie, en
`schema-controle.sql` bevestigt `ALLES OK`.

## Configuratie

Niets nieuws in te vullen — `bericht_modus` en `bericht_omleidadres` bestonden
al sinds 0.1.0 en staan bewust op `omleiden`. `mail_afzender` heeft een
werkende standaardwaarde. Wel nodig vóór er ooit een echte mail vertrekt: de
Worker-secret `RESEND_API_KEY`.

## Aanleiding

Fase 5 is het grootste resterende blok, en raakt het datamodel op meerdere
plekken tegelijk — dus eerst uitgeklaard vóór er gebouwd werd. Afgesproken:

- **HOE**: mail eerst (dit pakket), push als aparte, latere stap — die vraagt
  eigen infrastructuur (VAPID-secrets, een service worker) die nog niet
  bestaat.
- **WANNEER**: niet in één keer voor elke gebeurtenis vastleggen. Eerst één
  concrete trigger die al het langst wacht: de wedstrijdwijziging uit 0.9.0,
  die tot nu toe enkel onafgehandeld in het logboek belandde.
- **Logging**: dezelfde tweedeling als YOAssist. Het bestaande `logboek`
  blijft het beheerdersgerichte spoor (alles, inclusief mislukkingen); de
  nieuwe `berichten`-tabel is enkel voor wat een persoon zelf echt ontving.
- **Voorkeur per persoon** (mail/push/beide) verhuisd naar backlogpunt T6 —
  geen scherm daarvoor vandaag, dus `verwittigen.js` gebruikt voorlopig
  gewoon mail voor iedereen.

## Wat er wijzigt

### `src/lib/verwittigen.js` — de enige plaats die iets echt verstuurt

Al vastgelegd in de projectinstructies sinds het begin ("Berichten gaan altijd
via verwittigen.js, nooit rechtstreeks naar mailer.js of push.js"), nooit
ingevuld tot nu. Drie modi:

- **`'uit'`** — niets versturen. Wel volledig opbouwen en loggen, zodat
  zichtbaar is wat er verstuurd zou zijn. Precies zoals gevraagd: een beheerder
  kan dit aanzetten zonder dat er ooit een echte mail vertrekt.
- **`'omleiden'`** — echt versturen, maar naar één testadres. Komt bewust
  **niet** in `berichten` terecht: de echte persoon kreeg dit bericht niet, en
  'Mijn berichten' zou anders iets tonen dat nooit aankwam.
- **`'normaal'`** — echt versturen naar de echte ontvanger. Enkel deze modus
  vult `berichten`; een mislukking komt altijd in het logboek, nooit in
  `berichten` alsof het aankwam.

### `src/lib/mailer.js` — Resend, puur en zonder databanktoegang

Een dunne HTTP-client, met een eigen `fetcher`-parameter zodat hij zonder
netwerk te testen is — hetzelfde patroon als overal elders in dit project waar
een externe dienst wordt aangeroepen.

### De eerste echte trigger: wedstrijdwijzigingen

`src/routes/admin/wedstrijden.js` roept nu `verwittig()` aan voor elke
COORD, COACH en PLOEGV van de betrokken ploeg, bij elke meldbare wijziging
(dezelfde `meldbaar`-berekening als sinds 0.9.0 — de uitslag zelf blijft geen
wijziging, en de stille periodes rond het begin van het seizoen gelden nog
steeds). De bestaande logboekregel blijft bestaan, maar toont nu ook hoeveel
mensen verwittigd zijn, en is enkel nog onafgehandeld wanneer er niemand was
om te verwittigen.

**Bijvangst tijdens het testen:** een rolfilter in de begeleiding-opzoekquery
bleek defensief/zelfdocumenterend te zijn — het schema garandeert al dat een
`rollen`-rij met een `team_guid` nooit iets anders dan COORD/COACH/PLOEGV kan
zijn (ADMIN/FINADM vragen een lege `team_guid`, afgedwongen door een CHECK).
Vastgelegd in het commentaar in plaats van tijd te verspillen aan een fout die
door het datamodel zelf al onmogelijk gemaakt wordt.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `schema.sql`, `schema-alles-in-een.sql`, `schema-kaal.sql`, `schema-controle.sql` | tabel `berichten`, instelling `mail_afzender` |
| `migratie-berichten.sql` | nieuw: veilig herhaalbare migratie voor een bestaande installatie |
| `src/lib/mailer.js` | nieuw |
| `src/lib/verwittigen.js` | nieuw |
| `src/routes/admin/instellingen.js` | `mail_afzender` toegevoegd aan `INSTELBAAR` |
| `src/routes/admin/wedstrijden.js` | roept `verwittig()` aan bij een meldbare wijziging |
| `test/mailer.test.mjs`, `test/verwittigen.test.mjs` | nieuw |
| `test/wedstrijden-routes.test.mjs` | drie nieuwe end-to-end tests |
| `src/versie.js` | 0.17.0 → 0.18.0 |

## Tests

594, allemaal groen. Vier fouten ingebouwd ter controle: bij omleiden toch in
`berichten` schrijven (1 rood), modus `uit` toch versturen (1 rood), de
begeleiding-query niet op rol filteren (0 rood — zie hierboven, structureel
onmogelijk gegeven het schema), `meldWijziging` niet aanroepen bij een
wijziging (1 rood).

## Daarna

Volgende triggers voor dezelfde `verwittig()`-functie: selectie gepubliceerd
(0.13.0), welkomstmail, herinneringen. Daarna push als tweede kanaal, wat een
service worker en VAPID-secrets vraagt. T6 (Mijn voorkeuren) zal uiteindelijk
bepalen via welk kanaal iemand precies verwittigd wil worden.
