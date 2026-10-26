# Backlog — TeamAssist en YOAssist

**Eén backlog voor beide apps.** YOAssist gaat op in TeamAssist (zie I1);
vanaf nu staat elk punt hier, en nergens anders. `YOASSIST-BACKLOG.md` in de
YOAssist-repo verwijst enkel nog hierheen.

Nummering blijft zoals ze was, zodat oude verwijzingen in code en
WIJZIGINGEN-bestanden blijven kloppen:
- **I1** — de integratie zelf
- **V** + nummer — de module Officials (het vroegere YOAssist); YOAssist's
  punt *U* (Microsoft 365) heet hier **VU**, want TeamAssist heeft al een *U*
- **T** + nummer, en de letters **A–AB** — TeamAssist

Stand: YOAssist **v1.17.0**, TeamAssist **0.31.0**

---

## Overzicht

Bijgewerkt bij elke versie. Voor de volledige tekst: zoek de kop verderop
(`### T7`, `### V43`, `## I1`, ...).

### Wacht op een actie van Jurgen
- **AA** — een droogloop op de echte Worker (`POST /api/admin/periodes/sync`)
  om de OpenHolidays-fix te bevestigen.
- **AB** — `{{ .Token }}` in de Magic Link-mailsjabloon van Supabase.
- **V32** — op een echte telefoon testen of tikken op een pushmelding naar
  Mijn berichten gaat.
- **I1** — `clubassist.org` bij Resend als afzenderdomein verifiëren (de
  standaardafzender is sinds 0.28.0 `noreply@clubassist.org`), en de Worker
  als eigen domein aan `teamassist.clubassist.org` hangen.
- **I1** — de VAPID-secrets bij de Worker zetten (`node tools/maak-vapid.mjs`,
  zie README); zonder blijft alles per mail.

### Klaar om te bouwen
- **I1, fase 3** — de backend van YOAssist overzetten, in zes pakketten
  (3a–3f, zie I1). Wacht op bevestiging van die opdeling en van *Ouder en
  kind*.
- **T7** — tabblad Mijn club.
- **T12** — aanmelden als.
- **T18, T19** — twee kleine gaten uit de code-audit.

### Nog uit te klaren vóór er gebouwd kan worden
- **T2** — financiële module (FINADM). Hangt na I1 samen met de vergoedingen
  van de officials.
- **T3** en **V29** — evaluatie van spelers en van officials.
- **T5** en **V30** — een tweede omgeving / demo-omgeving.
- **V43** — eigen VBL-aanduidingen: eerst uitzoeken, dan bouwen; na I1.

---

## I1 — YOAssist en TeamAssist worden één app

**Beslist, nog niet gebouwd.** Eén Worker, één D1-databank, één aanmelding.

### Beslist

- **TeamAssist is de basis**, YOAssist wordt er een module in: *Officials*.
  Reden: het datamodel van TeamAssist kan elk clublid voorstellen (`personen`
  los van `accounts`, `rollen` per ploeg en seizoen, één rechtenfunctie);
  dat van YOAssist enkel wie zich aanmeldt (`users` met `email` als sleutel,
  `profiel IN ('YO','YO+')`).
- **De kopbalk en de menu's komen van YOAssist.** Topbalk met app en club,
  naam met rol(len) eronder, het meldingenbolletje dat rechtstreeks naar Mijn
  berichten gaat, het naammenu opgesplitst in Beheer en een persoonlijk deel,
  tabbladen die per stuk uit te zetten zijn. De schermen van TeamAssist
  krijgen die schil; welke tabbladen en menu-items iemand ziet, blijft volgen
  uit de rechten die de backend teruggeeft.
- **Aanmelden via Supabase** (magic link + cijfercode), voor iedereen, ook
  beheerders. Cloudflare Access verdwijnt, en daarmee het handmatig gelijk
  houden van de Access-policy en de gebruikerslijst.
- **TeamAssist draait nog niet met echte gegevens.** Het TeamAssist-schema mag
  dus vrij gedropt en herbouwd worden; enkel de YOAssist-gegevens moeten
  gemigreerd worden.
- **Eén backlog** — dit bestand.
- **Wat een module is.** Geen aparte app, maar een afgebakend onderwerp
  binnen de ene app, met eigen tabellen, code (bv. `src/officials/`),
  rechten (bv. `officials.aanduiden`) en schermen. Wat iedereen deelt —
  aanmelding, kopbalk, `personen`, `wedstrijden`, logboek — zit in geen
  enkele module. TeamAssist heeft er al: ploegen en personen, trainingen en
  zalen, aanwezigheden, wedstrijdtaken, communicatie. YOAssist wordt er één
  bij. Zo ziet een speler of ouder niets van de officials (volgt uit de
  rechten), raakt een wijziging aan de aanwezigheden de woensdagregel niet,
  en kan YOAssist stuk voor stuk overgezet worden.
  Niet te verwarren met de JavaScript-modules van TeamAssist 0.7.0: dat is
  het opsplitsen van de frontend in bestanden, geen onderwerp.
- **De module heeft geen naam in de app.** Een gebruiker ziet enkel
  tabbladen, en die houden hun YOAssist-namen: *Aanduidingen*,
  *Cluboverzicht*, *Regio*, *Vergoedingen club*. Enkel in de code heet ze
  `officials`. Een naam is pas nodig als er ooit een schakelaar komt om het
  hele onderdeel uit te zetten (een club zonder Youth Officials).

### Domein

**`clubassist.org`** (gekocht; `teamassist.org` was niet beschikbaar). De app
blijft **TeamAssist** heten.

**Beslist:** de app draait op **één adres, `teamassist.clubassist.org`**. Niet
op twee subdomeinen tegelijk (bv. ook `yoassist.clubassist.org`): voor de
browser zijn dat twee aparte sites, met elk een eigen aanmelding, eigen
pushabonnementen en een eigen icoon op het beginscherm. Wie coach én official
is, zou zich dan twee keer moeten aanmelden.
- `clubassist.org` zelf stuurt door (301) naar `teamassist.clubassist.org`.
- `yoassist.clubassist.org` is niet nodig; komt het er toch, dan enkel als
  doorverwijzing, nooit als tweede ingang tot de app.
- Andere subdomeinen voor wat echt apart draait: `demo.clubassist.org` (V30).
- Afzender van de mail: `noreply@clubassist.org`.
- `yoassist.org` blijft als tweede eigen domein aan dezelfde Worker hangen en
  stuurt door (301) naar `teamassist.clubassist.org` — **behalve** `/api/kalender/` en
  `/api/extern/`, die het rechtstreeks blijft bedienen. Een agenda-abonnement
  van een official staat al in zijn agenda, en niet elke agenda-app volgt een
  doorverwijzing.
- Pushmeldingen hangen vast aan het domein van de service worker: officials
  zetten ze na de overstap één keer opnieuw aan. De oude abonnementen worden
  bij de migratie niet overgenomen.
- In Supabase moeten beide adressen bij de Redirect URLs.

### Datamodel — **beslist, schema gebouwd in 0.30.0**

**Rollen.** Drie clubbrede rollen erbij: `YO` (Youth Official, U10/U12),
`YOPLUS` (YO+, ook vanaf U14) en `YOADM`. YOADM beheert de officials —
aanduiden, woensdagregel, Regio, vergoedingen — zonder beheerder van de hele
club te zijn (beslist: een nieuwe rol, niet enkel ADMIN). ADMIN mag het ook;
FINADM ziet de vergoedingen. Vier rechten: `officials.opgeven` (YO, YO+),
`officials.vanaf_u14` (YO+), `officials.beheren` (YOADM, ADMIN),
`officials.vergoedingen` (YOADM, ADMIN, FINADM).

**Voor welke ploegen.** Beslist: *hetzelfde als vandaag in YOAssist*. Een eigen
vlag `teams.officials` (standaard 1, zoals `volgen` in YOAssist), los van
`teams.gevolgd` — dat zegt of de club de ploeg in TeamAssist beheert. Een ploeg
kan officials krijgen zonder dat ze in TeamAssist beheerd wordt.

**De tabellen.** Gedeeld: `personen` (+ `agenda_sleutel`), `teams` (+
`officials`), `wedstrijden` (+ `bron`: 'vbl' of 'handmatig'), `berichten`,
`mededelingen`, `push_abonnementen`, `ouder_kind`, `logboek`, `instellingen`
(+ `facturatie_ontvangers`, `forfait_aanduiding`, `extern_namen`). Van de
module, met voorvoegsel `officials_`: `categorieen` (tarieven),
`wedstrijd` (scope, scheidsrechters van de bond, forfait — één rij per
thuiswedstrijd, naast `wedstrijden`), `beschikbaarheid`, `aanduidingen`,
`problemen`, `maanden`, `vergoeding_regels`, `vergoeding_verwerkt`,
`voorkeuren` (herinneringen, gsm delen), `volg_clubs`, `volg_wedstrijden`,
`vbl_lijsten`. In de vergoedingstabellen is `persoon_id` bewust geen foreign
key: een uitbetaald bedrag blijft staan nadat iemand vertrokken is.

**Wat niet meekomt.** `clubs` (één club), `sync_runs` (TeamAssist heeft
`taak_runs`), `ploeg_pv`/`ploeg_coaches` (worden rollen `PLOEGV`/`COACH`),
`push_abonnementen` (hangen aan het oude domein), `users.verborgen_tabs` (komt
met de schermen in fase 4).

**De migratie (0.31.0) — beslist.** Leest een YOAssist-backup én een
TeamAssist-backup, en maakt SQL plus een rapport; altijd eerst dat rapport
(droogloop). Een YOAssist-gebruiker wordt gekoppeld aan een bestaande persoon
**op e-mailadres, anders op voornaam + achternaam als er precies één kandidaat
is**; twijfel of geen treffer wordt een nieuwe persoon, en staat in het
rapport. Verder:
- `profiel` YO/YO+ → rol `YO`/`YOPLUS`; `is_admin` → rol `YOADM`.
- `kanaal_mail`/`kanaal_push` → `kanaal_voorkeur` (beide aan = 'beide', enkel
  push = 'push', anders 'mail' — nooit 'niets').
- `agenda_sleutel` ongewijzigd overgenomen: de agenda-abonnementen blijven
  werken (via `yoassist.org/api/kalender/…`, zie *Domein*).
- `matches` → `wedstrijden` (thuis, op de ploeg van de thuisploeg, in het
  actieve seizoen; ploegen die nog ontbreken, komen erbij met `gevolgd` = 0)
  + `officials_wedstrijd`. 'verdwenen' → `bij_bond` = 0.
- `ploeg_pv`/`ploeg_coaches` → rollen `PLOEGV`/`COACH` met bron 'club'; wie
  nog geen persoon is, wordt er een, zonder account.
- `berichten` gaan mee (Mijn berichten blijft gevuld); het logboek enkel wat
  nog openstaat — de rest blijft in de YOAssist-backup als archief.

### Fases — één pakket per fase, telkens met zip en delta-zip

1. **Schil en fundament**, in drie pakketten:
   - **1a — 0.27.0, afgewerkt**: de kopbalk en het naammenu van YOAssist;
     Dagelijks beheer, Configuratie en Zaalbeheer enkel nog onder Beheer in
     het naammenu; *Kijken als …* in het naammenu. Een ingestelde
     topbalkkleur wint van de donkere strook.
   - **1b — 0.28.0, afgewerkt**: Mijn berichten, belangrijk nieuws (met een
     doelgroep: iedereen, de begeleiding of één ploeg) en het
     meldingenbolletje.
   - **1c — 0.29.0, afgewerkt**: push (VAPID, `public/sw.js`, toestellen),
     meldingen aan/uit per toestel in Mijn voorkeuren, manifest en icoon voor
     'Zet op beginscherm'. `kanaal_voorkeur` wordt nu echt gevolgd; wie push
     koos zonder werkend toestel, krijgt mail.
   Tabbladen per stuk uitzetten (YOAssist's `verborgen_tabs`) komt pas
   wanneer de schermen van de module Officials erbij komen; met drie
   tabbladen heeft het nog geen zin.
2. **Schema en migratie**, in twee pakketten:
   - **2a — 0.30.0, afgewerkt**: het schema van de module Officials, de
     rollen YO/YOPLUS/YOADM en hun rechten. Zie *Datamodel* hierboven.
   - **2b — 0.31.0, afgewerkt**: `tools/migreer-yoassist.mjs`, dat een
     YOAssist-backup en een TeamAssist-backup leest en er een rapport plus
     SQL van maakt (in delen voor de D1-console, opnieuw uit te voeren
     zonder dubbels). Getoetst tegen de echte backups van 26 oktober 2026.
     **Nog niet uitvoeren:** het script hoort bij de overschakeling (fase 5),
     met een verse backup van dat moment — YOAssist blijft tot dan live, en
     wat nu overgezet wordt, is dan verouderd.
3. **Backend overzetten**, in zes pakketten — **voorstel, nog te
   bevestigen**. Elk pakket enkel backend en tests; de schermen komen in
   fase 4. De tests van YOAssist verhuizen mee naar `node:sqlite`.
   - **3a — 0.32.0: ouder en kind duidelijk.** Zie *Ouder en kind* hieronder.
     Eerst, omdat aanduidingen, berichten en de migratie erop steunen.
   - **3b — 0.33.0: de kern.** De wedstrijdsync vult ook
     `officials_wedstrijd` (scope U10/U12 automatisch, scheidsrechters van de
     bond, forfait); hoeveel officials nodig, botsingen, beschikbaarheid
     opgeven (ook namens een kind), aanduiden en vrijgeven, een probleem
     melden.
   - **3c — 0.34.0: de woensdagregel.** Met de API, de woensdaglijst
     (`email()`-handler, mime, xlsx), de terugval om 20 uur en de
     avondcontrole.
   - **3d — 0.35.0: automatisch aanvullen en herinneringen.** Avond en
     ochtend, wie nog niet invulde, het maandagoverzicht voor de beheerders.
   - **3e — 0.36.0: facturatie.** Tarieven, een maand afsluiten met
     momentopname en correcties, de maandmail.
   - **3f — 0.37.0: de rest.** Regio (volgsync), forfait-afhandeling,
     agendafeed en externe API (met `yoassist.org/api/kalender/` en
     `/api/extern/`), en de mail aan PV's en coaches bij te weinig
     scheidsrechters — nu via de rollen PLOEGV en COACH.
4. **Frontend overzetten**, scherm per scherm, als modules.
5. **Parallel draaien** op een testadres, daarna overschakelen: migratie
   uitvoeren, officials uitnodigen via Supabase, `yoassist.org` laten
   doorverwijzen.

Tot de overstap blijft YOAssist live en krijgt het enkel bugfixes.

### Ouder en kind — **voorstel, nog te bevestigen**

Waarom nu: een deel van de officials is minderjarig, en in YOAssist vult een
ouder vaak in voor zijn kind. De migratie toonde het al: Max Cuyvers staat in
YOAssist met `ruudcuyvers@…`, vermoedelijk het adres van zijn vader.

**Hoe het vandaag zit.**
- *YOAssist*: het kind is een gewone gebruiker met een eigen, uniek
  e-mailadres — vaak dat van een ouder, een plusadres of een fictief adres
  op het eigen domein, want `email` is de sleutel. `ouder_kind` laat een
  ouder invullen namens het kind (`namens.js`), maar die tabel bestaat niet
  in de echte databank: er is nooit een koppeling gemaakt.
- *TeamAssist*: een persoon hoeft geen e-mailadres te hebben. `ouder_kind`
  koppelt twee personen; een ouder krijgt daardoor de rol OUVO in de ploegen
  van zijn kind en geeft aanwezigheden op namens hem (gecontroleerd tegen
  `ouder_kind`). Koppelingen ontstaan enkel via het personensjabloon (kolom
  *E-mail ouder/voogd*); het persoonsscherm toont ze niet en kan ze niet
  maken. En `verwittig()` naar een kind zonder adres verstuurt niets — enkel
  een foutregel in het logboek.

**Voorstel (3a):**
1. **De official is altijd het kind zelf.** De rol YO/YOPLUS, de
   beschikbaarheden, aanduidingen en de vergoeding staan op de persoon van
   het kind, nooit op de ouder.
2. **Een ouder handelt namens zijn kind, met de rechten van het kind.** Zoals
   bij aanwezigheden: `namens` in het verzoek, altijd gecontroleerd tegen
   `ouder_kind`, anders 403. De ouder hoeft zelf geen rol YO te hebben. Eén
   gedeelde controle (`src/lib/namens.js`) voor aanwezigheden en officials.
3. **Een kind heeft geen fictief adres meer nodig.** Zonder eigen adres meldt
   het kind zich niet aan; de ouder doet alles. Met een eigen adres kunnen
   kind en ouder allebei.
4. **Berichten aan een kind zonder adres gaan naar zijn ouders** (elke ouder
   met een adres). Mijn berichten bewaart ze bij het kind; de ouder ziet ze
   als hij namens het kind kijkt. Heeft het kind een eigen adres, dan enkel
   naar het kind. Dit geldt voor de hele app, niet enkel de officials — het
   dicht ook het gat bij een gepubliceerde selectie.
5. **Het persoonsscherm toont ouders en kinderen**, en een beheerder kan er
   een koppeling maken of weghalen. Niet enkel via het sjabloon: een official
   die geen speler is, staat niet in een ploegsjabloon.
6. **De migratie krijgt een keuzebestand.** Per YOAssist-adres dat van een
   ouder is: wie die ouder is. Dan komt het adres bij de ouder (een bestaande
   persoon, of een nieuwe zonder rol), het kind blijft zonder adres, en de
   koppeling wordt gelegd. Zonder keuze blijft het zoals nu (adres bij het
   kind) en staat het in het rapport.

### Nog te bepalen

- **Volgorde tegenover T7, T12, T18 en T19.** Voorstel: I1 eerst. T12 raakt
  `personen` en `berichten` (`is_testpersoon`, `is_test`), en die tabellen
  krijgen bij I1 hun definitieve vorm; T12 erna bouwen vermijdt dubbel werk.
  T18 en T19 zijn klein en botsen nergens mee — die kunnen tussendoor.

---

## TeamAssist — afgewerkt

| Versie | Wat |
|---|---|
| 0.1.0 | Fundament: schema, aanmelden via Supabase, de rechtenlaag met haar testreeks, de uurplanner met de dagelijkse `supabase-ping`, en één scherm dat toont wie je bent en wat daaruit volgt. Plus `schema-controle.sql`, gegenereerd uit het schema, die in de D1-console zegt of alles werkelijk is aangemaakt. 85 tests, zonder netwerk en zonder dependencies. |
| 0.2.x | Aanmeldlink via de eigen route: `/api/aanmeldlink` kijkt eerst of het adres bij een actieve persoon hoort en antwoordt altijd hetzelfde, zodat de route niet te gebruiken is om de ledenlijst af te tasten. Wachttijd van een minuut per persoon. Plus de installatiedocumentatie: de eerste beheerder, de redirect-instellingen, en Resend als SMTP-server. 103 tests. |
| 0.3.x | `src/lib/vbl.js`: de client voor Basketbal Vlaanderen, met de diagnoseroute `/api/admin/vbl-diagnose` om echte antwoorden te bekijken vanuit de Worker — nodig omdat een kantoornetwerk en de ontwikkelomgeving `vblcb.wisseq.eu` niet bereiken. Bevindingen over `sGebDat`, `sAanslDat`, `ma` en `tvNr` vastgelegd in de architectuur. |
| 0.4.0 | Ploegen laden bij de bond: `/api/admin/teams/sync`, standaard een droogloop. Categorie uit de GUID, niet uit de naam. Een nieuwe ploeg start op niet-volgen. Een leeg of sterk geslonken antwoord zet niets weg (veiligheidsrem op een derde). 149 tests. |
| 0.5.x | Spelers en staf laden: `/api/admin/leden/sync`. Matchen op relatie-GUID, met naam-en-geboortedatum als terugval en twijfelgevallen die niemand automatisch samenvoegt. De bron-vlag beschermt handmatige correcties. Dezelfde veiligheidsrem als bij de ploegen. Bugfix: het aanvinken van een ploeg gebruikte een kale `fetch` die een verlopen token niet vernieuwde. 183 tests. |
| 0.6.x | Bekijken wat er binnengehaald is: een ledenlijst per ploeg en een zoekscherm over alle personen, met persoonsgegevens enkel voor wie `persoonsgegevens.bekijken` heeft. Een persoon aanpassen, waar de bron-vlag zich moet bewijzen: enkel wat werkelijk verandert zet een vlag op 'club'. Verwijderen is nooit onmiddellijk. 218 tests. |
| 0.7.x | Navigatie op basis van rechten in plaats van rolnamen. De frontend opgesplitst in modules (afgesproken in de architectuur, tot dan niet uitgevoerd) — daarbij een ontsmettingsfunctie toegevoegd die ontbrak. De testrol: een beheerder kan met een andere rol kijken, met de rechten als doorsnede zodat de schakelaar enkel kan wegnemen. `magTestrolGebruiken` als apart geteste functie in plaats van een tekstvergelijking op de broncode. 246 tests. |
| 0.8.0 | Zalen met blokken, zaalsluitingen, periodes (vakanties/examens), trainingsreeksen en de generator die ze uitschrijft naar concrete trainingen. Een handmatig gewijzigde training wordt nooit overschreven; een gesloten zaal levert een zichtbare status op in plaats van een verdwenen rij. Trainingen en wedstrijden blijven bewust twee tabellen. |
| 0.9.0 | Wedstrijden ophalen bij de bond, thuis en uit. Wijzigingshash die de uitslag bewust niet meetelt, en de stille periodes (nieuw seizoen, tweede ronde) waarbinnen een wijziging niet als meldbaar geldt. |
| 0.10.x | Huisstijl: clubkleur en logo instelbaar, met een voorstel uit de bond dat nooit automatisch wordt overgenomen. Contrastcontrole die een te lichte kleur weigert in plaats van ze te verdonkeren. Het logo wordt getoond als afbeelding in het voorstel, niet enkel als link. |
| 0.11.x | Een aparte topbalkkleur naast de accentkleur, met een eigen leesbaarheidsregel — een felle merkkleur faalt vaak als accent maar werkt als achtergrond met de juiste tekstkleur erop. Bugfix: de OpenHolidays-integratie stuurde een niet-bestaande subdivisiecode voor België (`BE-VLG` in plaats van de echte groepscode `BE-NL`), rechtstreeks tegen de API bevestigd en gecorrigeerd. |
| 0.12.0 | Het personensjabloon: per ploeg een vooraf ingevuld CSV-bestand downloaden, aanvullen met e-mail, telefoon en adres, en met een droogloop terug inlezen. Nooit een nieuwe speler aanmaken bij een onbekende id; een ouderkoppeling die uit het bestand verdwijnt wordt gesignaleerd, nooit stil verwijderd. Eigen RFC4180 CSV-module. De bron-vlag-logica uit het persoonsscherm verplaatst naar een gedeelde module. Rondt fase 2 af. |
| 0.13.0 | Aanwezigheden: opgave door speler of ouder met een harde termijn, vaststelling door de coach, uitsluiting met verplichte reden (altijd gelogd), en een klad-selectie die pas zichtbaar wordt voor de ploeg na publicatie. Tijdens het bouwen ontdekt en rechtgezet: de eerste versie van 'mijn opgaven' kon bij twee kinderen in dezelfde ploeg niet zeggen van wie welke opgave was. Rondt fase 4 af. |
| 0.13.1 | Bugfix, punt AA deel twee: een groepscode zoals `BE-NL` gaat bij OpenHolidays via een eigen parameter, `groupCode`, niet via `subdivisionCode` — bevestigd via de officiële OpenAPI-specificatie, rechtstreeks opgehaald. Corrigeert een eerdere, foute aanname in de backlog zelf dat `subdivisionCode` voor beide zou volstaan. |
| 0.13.2 | Vijf backend-routes die sinds 0.8.0 bestonden en getest waren, maar nooit een scherm hadden gekregen: een periode handmatig toevoegen (de enige weg voor examenperiodes), een periode verwijderen, een zaalblok verwijderen, en een zaalsluiting melden. Gevonden via een systematische vergelijking van elke route tegen wat de frontend werkelijk aanriep. Onderweg ook een dubbele HTML-id gecorrigeerd. |
| 0.14.0 | Twee nieuwe sjablonen naast het personensjabloon: zaaluren (afwerking van punt Z) en trainingsuren (nieuw, koppelt team aan zaal/dag/uur). Kernregel: een onbekend team laat de import nooit mislukken, wordt gerapporteerd en overgeslagen. Geleverd met de twee echte CSV's uit een aangeleverd zaalrooster (zeven zalen, 77 team-tijdslotcombinaties), getoetst tegen de echte planfuncties. |
| 0.14.1 | Bugfix, ontdekt bij het gebruiken van 0.14.0: `teams.naam` is de volledige naam van de bond (`AB InBev Leuven Bears G12 A`), niet de interne verkorte vorm (`U12 A`) waarmee het trainingsuren-sjabloon matchte. Nieuwe kolom `teams.naam_kort`, berekend bij synchronisatie (G/J→U, M blijft M, HSE/DSE ongewijzigd). Bijkomend: `categorie.js` bleek nooit een testbestand gehad te hebben — 18 tests toegevoegd. |
| 0.14.2 | Het trainingsuren-sjabloon matcht een teamnaam nu ook als de spatie tussen categoriecode en letter ontbreekt (`U21A` naast `U21 A`) — een algemene matchfix in plaats van een eenmalige correctie in de brongegevens. |
| 0.14.3 | Het versienummer staat nu ook in de topbalk, naast de bestaande footer (punt T8). |
| 0.15.0 | Belgische feestdagen: een eigen `soort` in `periodes`, los van vakanties. Een zaal kan zelf op `open_op_feestdagen` gezet worden, standaard uit — los van `vakantie_doorlopen` van het team. Vroeg een echte schema-heropbouw (`CHECK`-wijziging), niet enkel een `ALTER`; getoetst tegen een nagemaakte bestaande databank. |
| 0.16.0 | T9 en T10 samen: zalen, blokken, sluitingen, `open_op_feestdagen`, beide sjablonen en periodes samengebracht onder een nieuw tabblad Zaalbeheer. Elke sectie in Configuratie en Zaalbeheer samenvouwbaar met `<details>`/`<summary>` — een pijltje, native, geen eigen JavaScript. |
| 0.17.0 | Punt Y afgesloten: handmatig een persoon aan een team koppelen (`bron 'club'`), nodig omdat geen van de twee oorspronkelijke opties uitvoerbaar bleek zonder deze schakel. Onderweg een echte fout gevonden: `ledensync.js` beschermde een handmatig toegevoegde coach al tegen wegsynchronisatie, maar een speler niet — hersteld, met de ontbrekende `bron`-kolom die de query zelfs niet ophaalde. |
| 0.18.0 | Start van fase 5 (communicatie). `verwittigen.js` ingevuld — al vastgelegd in de projectinstructies, nooit gebouwd — met de drie berichtmodi (`uit`/`omleiden`/`normaal`) en een nieuwe `berichten`-tabel (enkel wat echt aankwam, zoals bij YOAssist). Eerste trigger: een wedstrijdwijziging verwittigt nu echt COORD/COACH/PLOEGV via mail, in plaats van enkel een onafgehandelde logboekregel. |
| 0.18.1 | Aanmelden met een zescijferige code als alternatief voor de link — nodig op een iPhone waar de app op het beginscherm staat, want die deelt geen sessie-opslag met Safari. Vraagt een handmatige stap in het Supabase-dashboard (`{{ .Token }}` aan de mailsjabloon toevoegen) zonder dewelke de wijziging niets doet. |
| 0.19.0 | T6 afgewerkt: een naammenu opgedeeld in Persoonlijk en Algemeen zoals bij YOAssist, met Mijn voorkeuren (dark mode + communicatiekanaal) en de topbalk-alignatie gecorrigeerd. Onderweg een eigen ontwerpfout gevonden en teruggedraaid: een strengere kleurcontrole zou de al lang actieve clubkleur met terugwerkende kracht hebben afgekeurd — opgelost in de CSS zelf in plaats van in de validatie. |
| 0.20.0 | T11 afgewerkt: handmatig een rol (ADMIN/FINADM/COORD/COACH/PLOEGV) aan een persoon koppelen, met `bron 'club'` — hetzelfde patroon als de team-koppeling uit 0.17.0. Een ADMIN kan zijn eigen ADMIN-rol niet verwijderen. Ontdekt en gedicht: dit gat was groter dan bij team_spelers, want zelfs de gedeeltelijke automatische weg (VBL-synchronisatie) bestond hier enkel voor COACH. |
| 0.21.0 | Fase 5, tweede trigger: bij het publiceren van een selectie krijgt elke speler van de ploeg nu een mail — een andere boodschap naargelang wel of niet geselecteerd. Bevestigt dat een nieuwe trigger geen nieuwe infrastructuur vraagt. Onderweg vastgesteld dat de bestaande tests de nieuwe verstuurlogica niet echt raakten (personen zonder e-mailadres in de fixture) — drie volwaardige end-to-end tests toegevoegd. |
| 0.22.0 | T13 afgewerkt: de uurcron voert nu echt automatisch wedstrijden (4x/dag), ploegen/leden (dagelijks) en periodes (wekelijks) uit, met dezelfde fout-opvang als de bestaande ping. Sluit het grootste vastgestelde gat: de meldingen uit 0.18.0/0.21.0 hingen tot nu toe af van een toevallige handmatige klik. Onderweg gevonden: een eerste versie van de uitvoeringslaag zou een intern opgevangen ploegmislukking gemist hebben omdat `wedstrijdenSync` altijd status 200 teruggeeft. |
| 0.23.0 | T14 afgewerkt: een volledige backup van de databank als JSON. Beter dan aanvankelijk voorgesteld — geen hardcoded tabellenlijst met een test die drift moet vangen (de YOAssist-aanpak), maar tabellen rechtstreeks uit `sqlite_master` gehaald, wat de hele bugklasse structureel onmogelijk maakt. De kerntest bewijst dat letterlijk: een tabel die pas ná het schrijven van de route wordt aangemaakt, zit er toch in. |
| 0.24.0 | T16 en T17 afgewerkt. `verwittig()` heeft geen `kanaal`-parameter meer en leest voortaan `kanaal_voorkeur` — mail blijft de terugval zolang push niet bestaat, met een aparte logregel voor wie 'push' koos. Blokken bij Zaalbeheer staan nu gegroepeerd per weekdag als losse blokjes, met bewust neutrale kleuren in plaats van de accentkleur. |
| 0.25.0 | T15 afgewerkt: opruiming van `logboek` (365 dagen), `taak_runs` (30 dagen), `berichten` (120 dagen), en het definitief verwijderen van een inactieve persoon na 180 dagen. Twee tabellen extra gevonden tijdens het bouwen (`accounts`, `ouder_kind`) die niet in het oorspronkelijke overzicht stonden. Enkel `aanwezigheden` wordt geanonimiseerd in plaats van verwijderd — de enige tabel waar dat structureel kon — wat een schema-heropbouw vroeg, grondig getoetst tegen een nagemaakte bestaande databank. |
| 0.31.0 | I1 fase 2b: `tools/migreer-yoassist.mjs`. Leest een YOAssist- en een TeamAssist-backup en maakt een rapport (wie bij wie terechtkomt, per tabel wat meegaat en waarom niet, aandachtspunten zoals een mogelijk ouderadres) plus SQL, in delen voor de D1-console, op een grens tussen opdrachten. Personen op e-mail, anders op naam bij precies één kandidaat zonder ander adres; wedstrijden via (guid, ploeg), niet via id; alles opnieuw uit te voeren zonder dubbels. Getoetst tegen de echte backups: 9 officials, 210 wedstrijden, alle rijen terecht, geen foreign-keyfout. Geen schemawijziging. 853 tests. |
| 0.30.1 | Bugfixes uit het logboek van de echte Worker. *Backup downloaden* gaf een 500 op de interne D1-tabel `_cf_KV`; die wordt overgeslagen, en een onleesbare tabel houdt de rest niet meer tegen (`problemen`). De Supabase-ping faalde een maand ongemerkt (project gepauzeerd): bij de tweede mislukking na elkaar van elke geplande taak nu een bericht aan de ADMINs, daarna wekelijks; de laatste geslaagde run per taak blijft bij de opruiming. De wedstrijdsync faalde op een wedstrijd tussen twee eigen ploegen (nu één rij per ploeg) en op een gekende wedstrijd zonder uur (oud moment blijft); de tegenstander bleef leeg bij elke thuiswedstrijd (`uTNaam` i.p.v. `tUNaam`). Schema: heropbouw van `wedstrijden` (UNIQUE op guid + ploeg), met de zes verwijzende tabellen apart gezet en teruggezet. 843 tests. |
| 0.30.0 | I1 fase 2a: het schema van de module Officials. Rollen `YO`, `YOPLUS` en `YOADM` (clubbreed) met vier rechten `officials.*`; YOADM beheert de officials zonder beheerder van de hele club te zijn. `teams.officials` (los van `gevolgd`, standaard aan zoals in YOAssist), `wedstrijden.bron`, `personen.agenda_sleutel`, en twaalf tabellen `officials_*`. Een test legt de rollen op vijf plaatsen naast elkaar (rechtenlaag, CHECK, koppelroute, twee schermen). Schema: heropbouw van `rollen` (CHECK), drie ALTER's, twaalf CREATE's. 824 tests. |
| 0.29.0 | I1 fase 1c: pushmeldingen. `verwittig()` volgt `kanaal_voorkeur` echt: mail, push, of beide; wie push koos maar op geen enkel toestel bereikbaar is, krijgt toch mail. Push enkel in de modus *normaal*. Meldingen aan/uit per toestel in Mijn voorkeuren, gemeten op het abonnement van dat toestel, met een testmelding en de iPhone-uitleg. Tikken op een melding opent Mijn berichten. Manifest en een voorlopig icoon, nodig voor 'Zet op beginscherm' en dus voor push op een iPhone. Push-code uit YOAssist overgenomen, nu met een test die een melding echt ontcijfert zoals een browser. Schema: tabel `push_abonnementen` (CREATE). 810 tests. |
| 0.28.0 | I1 fase 1b: Mijn berichten (ongelezen tot je een bericht aantikt, 'lees meer' met klikbare links, alles gelezen, verwijderen) en het meldingenbolletje op de naam, dat rechtstreeks naar Mijn berichten gaat en zichzelf om de drie minuten ververst. Belangrijk nieuws: één banner tegelijk, met een doelgroep (iedereen, de begeleiding, of één ploeg met spelers, ouders en begeleiding); wie erin zit en een account heeft, krijgt ze ook als bericht — via het batch-endpoint van Resend, honderd per oproep. Onderweg gevonden: een persoon met een wedstrijdtaak (0.26.0) kon nooit verwijderd worden; nu een test die elke foreign key naar `personen` naloopt. `schema-alles-in-een.sql` en `schema-kaal.sql` worden voortaan gegenereerd. Standaardafzender naar `clubassist.org`. Schema: drie kolommen in `berichten` (ALTER), tabellen `mededelingen` en `mededeling_gezien`. 786 tests. |
| 0.27.0 | I1 fase 1a: de kopbalk en het naammenu van YOAssist. Donkere strook die bovenaan blijft staan, een ingestelde topbalkkleur wint. Dagelijks beheer, Configuratie en Zaalbeheer uit de tabbalk, enkel nog onder Beheer in het naammenu, gebouwd uit dezelfde rechten als de tabbalk. *Kijken als …* in het naammenu, en enkel nog aangeboden als `testrol_toegelaten` aanstaat (`/api/mij` → `testrol_mogelijk`) — tot nu toe beweerde de testbalk soms iets wat de backend stil negeerde. Ook: een test die sinds oktober altijd faalde door een vaste septemberdatum. 746 tests. |
| 0.26.0 | T1 afgewerkt: taken bij een wedstrijd (klok, 24 seconden, tablet, ploegafgevaardigde). Taakslots ontstaan automatisch bij de synchronisatie, toewijzen mag wie de selectie beheert, elk actief clublid komt in aanmerking, en een toewijzing verwittigt — de derde fase 5-trigger, opnieuw zonder aanpassing aan `verwittigen.js`. Onderweg bleek `/api/admin/personen` niet bruikbaar als kandidatenlijst (vraagt `personen.beheren`, en weigert bewust een volledige lijst), dus een eigen smalle route die enkel id en naam teruggeeft. |

Zolang er punten onder 'Nog uit te klaren' staan, wordt er niet gebouwd: het
zijn punten die het datamodel of de rechtenstructuur raken, en die achteraf
rechtzetten kost een veelvoud.

---

## TeamAssist — beslist

Deze punten liggen vast en zijn verwerkt in `TEAMASSIST-ARCHITECTUUR.md`.

**A — Het sjabloon.** Naam, voornaam, geboortedatum en lidnummer komen van de
bond en hoeven niet ingetypt te worden; het sjabloon wordt per ploeg vooraf
ingevuld geëxporteerd. Wat de beheerder aanvult: `E-mail speler` (optioneel),
`E-mail ouder/voogd` (verplicht zolang de speler minderjarig is, meerdere
adressen gescheiden door een puntkomma), telefoon vast, gsm, straat, nummer,
bus, postcode, gemeente. `relGuid` staat er als verborgen sleutel in, met naam en
lidnummer als leesbare controle.

**B — Herkomst.** De ledenlijst komt van Basketbal Vlaanderen zelf:
`TeamDetailByGuid` geeft spelers en staf per ploeg, `RelatiesByOrgGuid` de leden
van de hele club. Daarmee is de bond de bron voor lidnummer, naam, voornaam en
ploegsamenstelling; het sjabloon levert nog wat de bond niet heeft — e-mail,
telefoon, adres en de ouder-kindkoppeling. Het adres blijft enkel zichtbaar voor
ADMIN.

**C — Matchingregel.** Lidnummer is de harde sleutel, en wordt door de
VBL-synchronisatie de gewone weg in plaats van de uitzondering. Blijft er toch
een regel zonder lidnummer over: geboortedatum plus naam plus voornaam,
genormaliseerd, geeft een UPDATE; geboortedatum plus één van beide namen geeft
twijfel en komt in een conflictenlijst waar de ADMIN per regel kiest. De rest is
een INSERT. Altijd eerst een droogloop.

**D — Verwijderen.** Markeren maakt inactief en enkel zichtbaar voor ADMIN; na
drie maanden wist een geplande taak de persoonsgegevens en blijft de rij als
'verwijderde speler' staan, zodat de aanwezigheidsgeschiedenis van een team geen
gaten krijgt. Een ouder zonder actieve kinderen en zonder rol verdwijnt wel
volledig.

**E — COORD.** Bekijkt alles van zijn teams, configureert trainingen en
teamsamenstelling, én stelt aanwezigheden vast. Op dat laatste punt staat hij
dus gelijk met de coach. PLOEGV configureert wel mee, maar stelt geen
aanwezigheden vast.

**F — Wat spelers en ouders zien.** De aanwezigheden van het team zijn
begeleidingsinformatie: enkel ADMIN, COORD, COACH en PLOEGV. Een speler ziet zijn
eigen aanwezigheid, een ouder die van zijn kind, en verder van de ploeggenoten
enkel de namen. Gsm-nummers zijn standaard zichtbaar voor ADMIN, COORD, COACH en
PLOEGV, met een instelling per persoon om ze breder te delen met iedereen van het
team; bij een minderjarige zet zijn ouder die instelling.

**G — Mail.** Er wordt uitgegaan van een betalend abonnement bij Resend. Het
volume is dus geen ontwerpbeperking meer.

**H — Supabase.** Enkel Auth, met magic link. De gegevens blijven in D1, geen
RLS, geen client-side queries.

**I — Domein.** Een eigen domein voor TeamAssist, niet als subdomein onder
YOAssist. Het werd `clubassist.org` (zie I1); `teamassist.org` was niet
beschikbaar.

**N — Ledenlijst van de bond: aanvaard voor de testfase.** De
gebruiksvoorwaarden in de spec spreken over kalenders, uitslagen en
rangschikkingen; een ledenlijst met minderjarigen valt daar niet vanzelf onder.
Voor het bouwen en testen wordt dat aanvaard. **Vóór de app in gebruik gaat bij
de club hoort dit alsnog bevestigd te worden** met één mail aan
`info@basketbal.vlaanderen`. Het gaat enkel om de eigen ploegen —
`RelatiesByOrgGuid` wordt niet gebruikt — wat de vraag een stuk eenvoudiger maakt.

**O — Verschil tussen de bond en de club.** Per gegeven een `bron`-vlag. Een
handmatige wijziging zet dat gegeven op 'club' en de synchronisatie laat het dan
met rust, met een regel in het logboek. Geldt ook voor de ploegtoewijzing en voor
handmatig toegevoegde coaches.

**K — Supabase op het gratis plan, ook voor productie.** Met als gevolg dat een
project na een week zonder databankactiviteit gepauzeerd wordt en niemand meer
binnen raakt. Opgevangen door een dagelijkse `supabase-ping` in de bestaande
uurcron, met een test, een logboekregel en een bericht aan de beheerders bij twee
opeenvolgende mislukkingen. Het betalende plan van 25 dollar per maand blijft de
uitweg als dat niet volstaat.

Nog te doen bij het aanmaken, en niet later te corrigeren: **de regio op EU
zetten** — de auth-databank bevat e-mailadressen van ouders en spelers. En te
beslissen: komt het account op een clubadres of op een persoonlijk adres, en wie
is de tweede persoon met toegang? Bij YOAssist staat alles op één persoonlijke
mailbox; dat is precies wat hoofdstuk 12 van die documentatie als risico
benoemt.

**P — Voornaam apart.** Voornaam en achternaam zijn aparte velden. De VBL-naam
wordt gesplitst op de eerste spatie — eerste woord is de voornaam — en de
volledige VBL-string blijft als `naam_vbl` bewaard. De afgeleide splitsing draagt
bron `afgeleid`; een handmatige correctie zet ze op `club` en dan blijft ze
staan. Het vooraf ingevulde sjabloon toont beide kolommen naast de VBL-naam, en
is daarmee de plek waar een dubbele voornaam met een spatie rechtgezet wordt.

**L — Voorlopig geen tweede omgeving.** In de plaats komt een clubbrede
instelling voor uitgaande berichten met drie standen — niets versturen, omleiden
naar één adres, normaal versturen — die bij een nieuwe installatie op 'omleiden'
staat. Ontwikkelen gebeurt lokaal met `wrangler dev` en een lokale D1, en bij de
eerste ingebruikname staan alleen beheerders in de personenlijst.

**V — Uitnodigen.** De uitnodiging is een eigen mail via Resend met een gewone
link naar de app, geen aanmeldlink: die laatste vervalt na een uur en is aan een
uurlimiet gebonden. De ontvanger vraagt zelf zijn aanmeldlink aan.

Uitwerking:

- **Droogloop of automatisch is instelbaar.** Standaard droogloop: tonen wie er
  een uitnodiging zou krijgen, pas na bevestiging versturen.
- **Een minderjarige speler krijgt zelf een uitnodiging** wanneer daar een
  instelling voor aanstaat, en die instelling zet zijn ouder. Dat is meteen het
  signaal dat het kind zijn eigen zaken beheert. Staat ze uit, dan gaat de
  uitnodiging enkel naar de ouder.
- **Wanneer iemand uitgenodigd werd, wordt altijd bijgehouden.** Bij een tweede
  import wordt zo iemand overgeslagen — maar dat overslaan hoort gemeld te
  worden, zodat een beheerder ziet dat er niets vertrok en zich niet afvraagt
  waarom.

Vraagt twee kolommen bij `personen`, allebei met een `ALTER TABLE`:
`uitgenodigd_op` en een vlag voor het zelf aanmelden van een kind.

**W — De ouder-kindkoppeling.** De kolom `E-mail ouder/voogd` in het sjabloon
maakt de ouder aan en legt de koppeling. Twee kinderen bij één ouder werkt
vanzelf; gescheiden ouders krijgen allebei dezelfde rechten. Wisselt een ouder
van e-mailadres, dan wordt een onbekend ouderadres bij een kind dat al een ouder
heeft een twijfelgeval in de conflictenlijst: vervangen of toevoegen, de
beheerder kiest.

**M — De VBL-velden.** Beantwoord via `/api/admin/vbl-diagnose` (0.3.0) op een
echt antwoord. `sGebDat` is `dd-mm-jjjj`, `sAanslDat` is `dd-mm-jjjj uu:mm` en
slaat op het samenstellen van de ploeg — niet op het lidmaatschap. `ma` is het
medisch attest, dat niet meer verplicht is; blijft leeg en wordt niet ingelezen.
`tvNr` is een samengestelde sleutel, geen volgnummer. Vastgelegd in hoofdstuk 7
van de architectuur. Enige rest: `tvCaC` gaf tot nu toe enkel 'Coach'; een
seniorenploeg opvragen zou tonen of er meer codes bestaan. Blokkeert niets.

**Q — Personen zonder aansluiting.** Niet iedereen is lid van Basketbal
Vlaanderen — een deel van de ouders wel, een deel niet, en PLOEGV en COORD
meestal niet. Handmatig aanmaken blijft dus een gewone weg. De sleutel van een
persoon is een eigen interne id; `relGuid` en `lidNr` zijn optionele velden.

**R — De synchronisatie mag nooit schade doen.** Toevoegen mag altijd, wegnemen
markeert alleen. Een lege of sterk geslonken spelerslijst wordt genegeerd: de
ronde krijgt status `deels`. Voorgestelde grens, nog te bevestigen: geen enkele
speler, of meer dan een derde van de ploeg tegelijk weg.

**J — Aanwezigheid bij een wedstrijd.** Uitgewerkt in hoofdstuk 8 van de
architectuur. Drie velden bij een wedstrijd — opgave, selectie, vaststelling —
tegen twee bij een training. Of er geselecteerd wordt, is een instelling per
ploeg en per seizoen, gezet door de coach, COORD of ADMIN, standaard op
'iedereen die kan'. Een
selectie is een klad tot ze bekendgemaakt wordt; eenmaal bekendgemaakt ziet de
hele ploeg de namen, maar nooit de redenen van wie er niet bij is. Niet
geselecteerd telt nergens als afwezig. Een tussenstand 'reserve' komt er niet in
een eerste versie.

De coach kan een speler ook vooraf op afwezig zetten, waarna die zichzelf niet
meer beschikbaar kan stellen — met verplichte reden, zichtbaar voor de speler en
zijn ouder, en altijd in het logboek. Werkt zowel bij trainingen als bij
wedstrijden, en telt als een eigen soort afwezigheid naast ziek en gekwetst.

**S — De staf van de bond wordt gevolgd.** De rol COACH wordt automatisch
toegekend vanuit `tvlijst`, met bron 'vbl'. Een beheerder kan een bijkomende of
andere coach aanduiden; die krijgt bron 'club' en wordt nooit weggesynchroniseerd.

### U — Trainingen, zalen en vakanties — **beslist**

Groter dan aanvankelijk gedacht: het gaat niet enkel over een terugkerend uur,
maar over de verdeling van schaarse zaaluren over de ploegen van de club.

#### De zalen zijn de kern

Een zaal is niet altijd beschikbaar. Ze heeft **blokken**: op maandag van 18 tot
20 uur, op woensdag van 14 tot 16 uur. De club verdeelt die blokken over haar
ploegen. Dat maakt het model:

```
zalen            id, naam, adres, vbl_acc_guid (indien de bond ze kent)
zaal_blokken     zaal, seizoen, weekdag, begin, einde
                 -- de uren waarover de club beschikt
zaal_sluitingen  zaal, van, tot, reden
                 -- een dag of een periode dat de zaal niet bruikbaar is
trainingsreeksen team, seizoen, blok, begin, einde, opmerking
                 -- welke ploeg welk blok gebruikt
trainingen       de concrete rijen die daaruit voortkomen
```

Het voordeel van blokken als aparte tabel: de app weet welke blokken **niet**
toegewezen zijn. Valt een zaal weg, dan kan ze de vrije blokken van die week
tonen in plaats van de coach zelf te laten zoeken. Zonder die tabel is dat
onmogelijk en blijft er enkel een melding over.

Een ploeg die in een schoolzaal traint waar de club geen blokken van beheert,
moet ook kunnen: dan draagt de reeks een vrije tekst als locatie in plaats van
een blok.

#### Wat er gebeurt bij een sluiting

De trainingen in die periode gaan niet weg maar krijgen de toestand *zaal niet
beschikbaar*. De betrokkenen krijgen bericht, en het scherm toont welke blokken
die week vrij zijn. Verplaatsen blijft een handeling van een mens: alleen die
weet of het alternatief voor de ploeg haalbaar is.

Een sluiting raakt ook thuiswedstrijden — de bond kent de zaal via `accGUID`.
Verplaatsen doet de bond, niet wij, maar het signaleren hoort er wel bij.

#### Vakanties

Een lijst vakantieperiodes per seizoen, clubbreed ingevuld door een beheerder.
Een handvol rijen per jaar.

Per ploeg staat ingesteld of de trainingen doorlopen, te zetten door COACH,
PLOEGV, COORD en ADMIN. Dat is de standaard voor de hele vakantie; één losse
training toevoegen of afzeggen blijft daarnaast mogelijk, want in de praktijk
traint een ploeg wel de eerste week van de paasvakantie en niet de tweede.

Voorstel voor de standaardstand: **niet doorlopen**. Een training die niet
plaatsvindt maar wel in de agenda staat, kost iemand een verplaatsing; andersom
staat er een training niet in de agenda die wel doorgaat, en dat merkt de coach
bij het instellen.

#### Beslist

**U1 — Wie beheert de zalen en de blokken.** ADMIN. Het is clubbrede
infrastructuur, en een blok verplaatsen raakt andere ploegen. Sluitingen mogen
ook door COORD, want die hoort het meestal het eerst.

**U2 — Wie wijst een blok toe aan een ploeg.** ADMIN en COORD, niet de coach. Zou een coach zelf een vrij blok kunnen nemen, dan ontstaat er een race
tussen ploegen om de goede uren. Binnen zijn toegewezen blok mag de coach het uur
verfijnen — een blok van 18 tot 20 uur kan een training van 18u30 tot 19u45
dragen.

**U3 — Waar de vakantiedata vandaan komen.** De OpenHolidays API
(`openholidaysapi.org`), een open-dataproject dat Belgische schoolvakanties
dekt vanaf 2020, in JSON, zonder sleutel. Voor België gebruikt ze *groups* voor
de taalgrens in plaats van gewone subdivisies; welke code Vlaanderen precies
draagt, moet tegen de echte API bepaald worden — dat lukt niet vanuit de
ontwikkelomgeving, net als bij VBL, dus gebeurt het met een diagnoseroute in de
Worker.

Twee regels die daarbij horen:

- **Eén keer per seizoen ophalen en wegschrijven**, niet live bevragen bij het
  genereren van trainingen. Een externe dienst die wegvalt mag nooit de agenda
  van de club platleggen.
- **Altijd te corrigeren.** Wat opgehaald wordt is een voorstel. Een club wijkt
  af — een facultatieve verlofdag, een schoolvakantie die voor de eigen leden
  niet telt — en de opgehaalde datum mag die keuze niet overschrijven. Dezelfde
  `bron`-vlag als elders: gaat een periode op 'club', dan blijft ze staan.

Valt de API weg, dan blijft handmatig invullen mogelijk. Het zijn een stuk of
vijf periodes per jaar.

#### Nog te bepalen bij U3

**Trainingsperiode per ploeg.** ADMIN, COORD en COACH stellen in wanneer de
trainingen beginnen en eindigen. Dat staat op de reeks (`van`, `tot`), niet op
het seizoen: de U8 begint vaak later dan de senioren.

**Grenzen van het seizoen.** Ten vroegste 1 augustus, ten laatste 30 juni. Dat
wordt gecontroleerd bij het invoeren, niet enkel in het scherm — een reeks die
buiten het seizoen loopt, genereert trainingen die nergens bij horen.

**Examenperiodes.** Voor U14 tot U18 gelden die van het secundair onderwijs;
voor U21 die van het hoger onderwijs, en die vallen anders. Het model behandelt
ze als een tweede soort periode naast de vakanties:

```
periodes   seizoen, naam, van, tot,
           soort ('vakantie' | 'examens'),
           doelgroep ('iedereen' | 'secundair' | 'hoger'),
           bron ('openholidays' | 'club')
```

Elke ploeg draagt een `onderwijsgroep`, standaard afgeleid uit de categorie —
U14 tot U19 secundair, U21 en senioren hoger, U10 en U12 geen examens — en per
ploeg te overschrijven, want in een U19 zitten vaak al studenten.

Wat er tijdens zo'n periode gebeurt, staat per ploeg ingesteld, net als bij de
vakanties: doorlopen of niet. 'Specifieke regelingen' zoals één training per
week in plaats van twee komen neer op losse trainingen toevoegen binnen een
periode die verder niet doorloopt — dat kan al, en het spaart een derde
instelling met eigen regels uit.

---

## TeamAssist — gefaseerde opbouw

Volgorde, nog niet in versienummers gegoten. Elke fase is af wanneer ze getest
is en werkt; pas dan begint de volgende.

### Fase 1 — Fundament — **afgewerkt in 0.1.0**
Aanmelden via Supabase, `personen`, `accounts`, `rollen`, `teams`, seizoenen, de
rechtenlaag met haar tests, het logboek, en één scherm dat toont wie je bent en
wat je mag.

Twee keuzes die tijdens het bouwen zijn gemaakt en die blijven gelden:

- **De tests draaien op `node:sqlite`**, dat sinds Node 22 in de
  standaardbibliotheek zit. Daardoor heeft de testreeks geen enkele dependency en
  is er geen `npm install` nodig. Dat neemt de valkuil weg die in YOAssist staat
  aangetekend, waar `better-sqlite3` een native build vraagt die niet overal
  lukt. Node 22 of nieuwer is wel vereist.
- **De frontend haalt geen code van buitenaf.** Het aanmelden praat rechtstreeks
  met de REST-API van Supabase Auth in plaats van via een bibliotheek van een
  CDN, zodat er geen derde partij op het scherm staat waar iemand zijn
  e-mailadres invult. Een test bewaakt dat.

### Fase 2 — Teams en mensen erin — **afgewerkt in 0.12.0**
Teams, spelers en staf laden bij Basketbal Vlaanderen (0.4.0, 0.5.x), bekijken
en aanpassen (0.6.x), en het personensjabloon (0.12.0) dat het laatste stuk
afrondde: e-mail, telefoon, adres en ouderkoppelingen vooraf ingevuld per
ploeg, met droogloop bij het inlezen.

### Fase 3 — Kalender — **afgewerkt in 0.8.0/0.9.0**
Zalen met blokken en sluitingen, periodes (vakanties en examens, met de
OpenHolidays-koppeling), trainingsreeksen met de generator die ze uitschrijft
naar concrete trainingen, en de wedstrijdsynchronisatie met wijzigingsdetectie
en de stille periodes. Trainingen en wedstrijden bleven, zoals in de
architectuur vastgelegd, twee tabellen.

### Fase 4 — Aanwezigheden — **afgewerkt in 0.13.0**
Opgeven door speler of ouder tot de opgavetermijn van de ploeg verstrijkt,
vaststellen door de coach, uitsluiten met een verplichte reden, en een
klad-selectie die pas zichtbaar wordt voor de ploeg na publicatie.

### Y — Testrol en aanwezigheid opgeven — **afgewerkt in 0.17.0**
Bij het bouwen van 0.13.0 bleek dit niet op te lossen zonder eerst iets anders
te bouwen: een beheerder die als SPELER of OUVO kijkt, heeft zelf geen
SPELER/OUVO-rechten, en de doorsnede uit `beperkTot()` kan enkel wegnemen,
nooit toevoegen — de opgaveknop bleef dood. Van de twee oorspronkelijk
voorgestelde wegen (zelf als speler in een ploeg, of een aparte testpersoon)
was geen enkele uitvoerbaar: er bestond geen manier om iemand handmatig aan
een team te koppelen, `team_spelers` werd uitsluitend door de
VBL-synchronisatie geschreven.

Opgelost met `POST /api/admin/persoon/team-koppelen`/`.../team-ontkoppelen` —
een bestaande persoon handmatig aan een team koppelen met `bron: 'club'`. Dat
maakt beide oorspronkelijke opties nu mogelijk, ongeacht welke gekozen wordt.
Onderweg gevonden: `ledensync.js` beschermde een handmatig toegevoegde coach
al tegen wegsynchronisatie, maar een speler niet — hersteld.

### Fase 5 — Communicatie — **gestart in 0.18.0**
Welkomstmail, meldingen, voorkeuren per persoon, herinneringen aan wie nog niet
invulde, bericht bij een kalenderwijziging.

**Uitgeklaard vóór het bouwen (bevestigd door Jurgen):**
- **HOE**: mail eerst, push als aparte, latere stap — die vraagt eigen
  infrastructuur (VAPID-secrets, een service worker) die nog niet bestaat.
- **WANNEER**: niet in één keer voor elke gebeurtenis vastgelegd. Eén trigger
  per keer, te beginnen met de langst wachtende.
- **Logging**: dezelfde tweedeling als YOAssist — het bestaande `logboek`
  blijft beheerdersgericht (alles, inclusief mislukkingen); een nieuwe
  `berichten`-tabel is enkel voor wat een persoon zelf echt ontving.
- **Voorkeur per persoon** (mail/push/beide) hoort bij T6, niet bij fase 5
  zelf — zonder dat scherm gebruikt `verwittigen.js` voorlopig mail voor
  iedereen.

**0.18.0 leverde het fundament**: `src/lib/verwittigen.js` (de enige plaats
die iets echt verstuurt, met de drie modi `uit`/`omleiden`/`normaal`),
`src/lib/mailer.js` (Resend), de `berichten`-tabel, en de eerste trigger — een
wedstrijdwijziging (0.9.0) verwittigt nu echt COORD/COACH/PLOEGV, in plaats
van enkel een onafgehandelde logboekregel.

**0.21.0 voegde de tweede trigger toe**: selectie gepubliceerd (0.13.0). Elke
speler van de ploeg krijgt bericht — een andere boodschap naargelang hij wel
of niet geselecteerd is — niet enkel de begeleiding, die het al wist. Bevestigt
het patroon: een nieuwe trigger vraagt geen nieuwe infrastructuur, enkel een
aanroep van dezelfde `verwittig()`-functie op de juiste plek.

**Mijn berichten en belangrijk nieuws — 0.28.0.** Elk bericht draagt een
`soort` ('wedstrijd', 'selectie', 'taak', 'nieuws'), en `gelezen_op`. Een
mededeling gaat naar veel mensen tegelijk via `verwittigVelen()`, met het
batch-endpoint van Resend.

**Een derde trigger staat al in de code, nog niet uitgebracht**: een
toegewezen wedstrijdtaak (T1, `src/routes/admin/wedstrijdtaken.js`) verwittigt
de betrokken persoon, en een gemeld probleem verwittigt de begeleiding van dat
team. Opnieuw zonder enige aanpassing aan `verwittigen.js` zelf.

**Nog open, dezelfde `verwittig()`-functie hergebruikend:**
- Welkomstmail voor een nieuw aangemaakte persoon.
- Herinneringen aan wie nog niet invulde.
- ~~Push als tweede kanaal~~ — **afgewerkt in 0.29.0** (I1 fase 1c), en
  daarmee ook de keuze uit T6: `kanaal_voorkeur` wordt nu echt gevolgd.
  Een mededeling (`verwittigVelen`) gaat nog enkel per mail en banner: push
  naar honderden toestellen tegelijk vraagt evenveel uitgaande oproepen.

**Restpunt uit de huisstijl (0.10.0/0.11.0):** of het clublogo ook in mails
komt. Dat vraagt een publiek bereikbare URL — voor het VBL-afgeleide logo is
dat al zo, voor een eigen upload nog niet, want die bestaat nog niet (D1 is
geen plaats voor afbeeldingen). Nog niet opgepakt, ook niet in 0.18.0.

---

## TeamAssist — openstaand

### AA — Bug: de OpenHolidays-integratie haalt niets op — **fix geleverd in 0.13.1, wacht op bevestiging via de Worker**

Twee opeenvolgende fouten, elk apart gevonden en apart gecorrigeerd.

**Eerste fout (0.11.1): de verkeerde waarde.** De code stuurde
`subdivisionCode=BE-VLG`. `BE-VLG` bestond niet — bevestigd via
`GET /Groups?countryIsoCode=BE`, die `BE-NL` (Vlaamse gemeenschap), `BE-FR` en
`BE-DE` teruggeeft. Dit stond bij U3 al als onbevestigde aanname genoteerd en
werd toen voor het eerst getoetst. De waarde werd vervangen door `BE-NL`.

**Tweede fout (0.13.1, na een nieuwe melding dat het nog steeds niet werkte):
de verkeerde parameter.** `BE-NL` bleef via `subdivisionCode` gaan. **Een
eerdere aantekening hier beweerde dat `subdivisionCode` de juiste parameter
was, gebaseerd op vier voorbeelden van derde partijen (Power Automate, TapHome,
C#) — dat was fout.** De officiële OpenAPI-specificatie van OpenHolidays
(`openholidaysapi.org/swagger/v1/swagger.json`), rechtstreeks opgehaald en
nagekeken, toont dat `/SchoolHolidays` twee aparte parameters heeft:
`subdivisionCode` voor een gewone ISO-subdivisie, en `groupCode` voor een
groepscode zoals bij een land met taalgrenzen — België is het eigen voorbeeld
in de documentatie. Geen van de vier eerdere bronnen testte ooit een land dat
`groups` gebruikt in plaats van gewone subdivisies, dus geen ervan kon dit
verschil aan het licht brengen. `BE-NL` gaat sinds 0.13.1 via `groepscode`.

**Twee bronnen rechtstreeks en écht bevestigd** (de `destination_url` van
beide fetches kwam exact overeen met wat gevraagd werd, geen gecachete
substitutie): de `/Groups`-lijst, en de OpenAPI-specificatie zelf.

**Wat nog steeds niet rechtstreeks getoetst kon worden:** de werkelijke
combinatie `SchoolHolidays?countryIsoCode=BE&groupCode=BE-NL` zelf uitvoeren
en het antwoord zien. Elke poging daartoe leidde het zoekhulpmiddel terug naar
een eerder gezien Oostenrijks voorbeeld — een beperking van het hulpmiddel
binnen de sandbox bij deze specifieke combinatie, niet bij losse oproepen.
De indirecte bevestiging (de juiste groepscode, plus de juiste parameter, elk
apart écht getoetst) is sterk, maar geen vervanging voor de echte proef.

**Draai een droogloop op de echte Worker om het definitief af te sluiten:**
`POST /api/admin/periodes/sync` zonder `uitvoeren=1`. Komt `gevonden` boven 0
uit, dan is dit punt na twee pogingen eindelijk volledig gesloten.

### AB — Aanmeldcode ontbreekt nog in de Supabase-mail — **code geleverd in 0.18.1, wacht op de mailsjabloon**
De code zelf (`verifieerCode()`, het uitklapbare veld bij het aanmeldscherm)
staat sinds 0.18.1 volledig klaar en getest — maar zonder een aanpassing aan
de kant van Supabase blijft de mail tonen wat hij al toonde: enkel de link,
geen cijfercode. Dat stond destijds al zo in `WIJZIGINGEN-0.18.1.md`, maar
had geen eigen, traceerbaar punt in de backlog — bevestigd dat dit nog niet
gebeurd is.

**Actie, bij Jurgen:** in het Supabase-dashboard, **Authentication → Email
Templates → Magic Link**, `{{ .Token }}` toevoegen aan de mailtekst, bijvoorbeeld:

```
Je kan aanmelden via de link hieronder, of deze code intypen in de app:

{{ .Token }}

{{ .ConfirmationURL }}
```

Zonder deze stap blijft het codeveld in de app onbruikbaar — niet omdat de
code stuk is, maar omdat er nooit een code in de mail staat om in te typen.
Dit is dus geen bugmelding, enkel een openstaande operationele stap die
buiten de code om moet gebeuren.

### Z — Zaaluren laden via een CSV-bestand — **afgewerkt in 0.14.0**
Geleverd zoals hier voorgesteld: vooraf ingevuld sjabloon, kolommen
zaal/weekdag/begin/einde, altijd een droogloop, een onbekende zaalnaam wordt
als nieuwe zaal behandeld. CSV, geen xlsx — geen aanleiding gebleken om dat te
heroverwegen. Bij dezelfde gelegenheid kwam er ook een trainingsuren-sjabloon
bij (koppelt een team aan zaal/dag/uur), iets ruimer dan hier oorspronkelijk
gevraagd.

### T1 — Taken bij een wedstrijd (tafel, tablet, ploegafgevaardigde) — **afgewerkt in 0.26.0**
Geleverd zoals uitgeklaard. De taakslots ontstaan automatisch bij de
wedstrijdsynchronisatie, het scherm zit bij Ploegen onder de selectie, en een
toewijzing verwittigt de betrokken persoon.

**Onderweg gevonden:** `/api/admin/personen` (`personenZoeken`) was niet
bruikbaar als kandidatenlijst — ze vraagt `personen.beheren` (wat een COACH
niet heeft) en weigert bewust een volledige lijst zonder zoekterm. Daarom een
eigen, smalle route `/api/admin/wedstrijdtaken/kandidaten` die enkel id,
voornaam en achternaam teruggeeft, met dezelfde rechtencontrole als de rest
van T1.

**Nog open binnen dit punt:** eerlijke verdeling/rotatie over het seizoen,
bewust buiten scope gehouden — zoals bij YOAssist's automatische aanvulling
voor scheidsrechters, een eigen, later te bouwen uitbreiding.

Uit de oorspronkelijke tekst, uitdrukkelijk voor later. Wat al vastligt: bij
thuiswedstrijden tot U12 is er één ouder nodig voor de klok; vanaf U14 iemand
voor de klok en iemand voor de 24 seconden; bij uitwedstrijden telkens iemand
voor de tablet; en er is altijd een ploegafgevaardigde nodig.

**Datamodel: een tabel `wedstrijdtaken`** (`wedstrijd_id`, `taak` —
`klok`/`24seconden`/`tablet`/`ploegafgevaardigde` —, `persoon_id`). Past naast
`aanwezigheden` zonder die te verstoren; hangt enkel aan wedstrijden, niet aan
trainingen. `persoon_id` is **nullable tot iemand is toegewezen** — de rijen
zelf ontstaan automatisch bij de wedstrijdsynchronisatie, afhankelijk van
categorie en thuis/uit, als open slots die een beheerder vult. Eerst de
behoefte, dan de invulling — hetzelfde patroon als aanduidingen bij YOAssist.

**Beslist (bevestigd door Jurgen):**

- **Wie mag toewijzen**: dezelfde kring als de selectie
  (`team.selectie.beheren` — COACH, COORD, PLOEGV). Geen apart, nieuw recht.
- **Wie komt in aanmerking**: om het even welk actief clublid, geen beperking
  tot ouders van spelers in dat team.
- **Een toewijzing verwittigt** via `verwittig()`, hetzelfde patroon als een
  gepubliceerde selectie.
- **Een probleem melden na toewijzing**: hetzelfde patroon als aanwezigheid —
  een toegewezen persoon kan zijn toewijzing niet meer zelf wijzigen, wel een
  probleem melden dat naar de beheerders gaat.
- **Eerlijke verdeling/rotatie over het seizoen is bewust buiten scope voor
  deze eerste versie.** Zoals bij YOAssist's automatische aanvulling voor
  scheidsrechters, een eigen, later te bouwen uitbreiding — T1 zelf bouwt
  enkel handmatige toewijzing.

Nog te bepalen bij het bouwen, geen blokkerende vraag: door "om het even welk
actief clublid" als kandidaat toe te laten, kan de kandidatenlijst bij een
grote club lang worden. Vermoedelijk hetzelfde soort zoeken-op-naam-patroon
als bij T12's testpersoon-keuzescherm, mogelijk met leden van dat team of hun
ouders vooraan gesorteerd — een bouwdetail, geen ontwerpvraag.

Met deze beslissingen is T1 volledig uitgeklaard.

### T5 — Alsnog een tweede omgeving
**Na I1 samen met V30 (demo-omgeving) te bekijken**: dezelfde vraag, en één
antwoord voor de samengevoegde app.

Bewust uitgesteld, niet afgevoerd. De reden om er later op terug te komen: bij
YOAssist is dezelfde keuze gemaakt en daar staat ze nog altijd open, met als
gevolg dat er nooit veilig geoefend kon worden. Zodra TeamAssist echt in gebruik
is en er nog aan gebouwd wordt, verschuift de afweging — dan raak je met elke
wijziging aan een systeem waar honderden mensen op rekenen.

Het gratis plan van Supabase staat twee actieve projecten toe, dus de ruimte
ervoor blijft bestaan.

### T2 — Financiële module
FINADM bestaat als rol maar heeft nog geen scherm. Nog volledig te bepalen wat
eronder valt: lidgeld, boetes, onkosten?

### T3 — Evaluatie en opvolging van spelers
Verwant met V29 (evaluatie van officials); bij het uitklaren samen bekijken.

Niet gevraagd, wel voorspelbaar zodra aanwezigheden bestaan: wie traint weinig,
wie is lang geblesseerd. Voorlopig enkel als aantekening dat de
aanwezigheidsgegevens dat later moeten kunnen dragen.

### T4 — Uitwisseling met YOAssist — **achterhaald door I1**
YOAssist gaat op in TeamAssist; er valt niets meer uit te wisselen. De
oorspronkelijke tekst:

Beide applicaties kennen dezelfde club, dezelfde teams en deels dezelfde mensen.
Openstaande vraag voor later, niet nu: is er een reden om gegevens te delen, of
blijven ze bewust gescheiden? YOAssist heeft al een externe, alleen-lezen API
met een sleutel in de header — als er ooit iets moet, gaat het via die weg.

### T6 — Naammenu met Mijn voorkeuren, zoals bij YOAssist — **afgewerkt in 0.19.0**
Van de naam een knop gemaakt die een uitklapmenu opent, opgedeeld zoals bij
YOAssist: **Persoonlijk** (Mijn voorkeuren, Afmelden — verhuisd van
Overzicht) en **Algemeen**, enkel zichtbaar voor wie `systeem.beheren` heeft
(snelkoppelingen naar Zaalbeheer, Configuratie, Dagelijks beheer).

**Bewust opengelaten:** die drie tabbladen zijn niet uit de tabbalk
verwijderd — de snelkoppeling staat er gewoon naast. **Beslist in I1, gebouwd
in 0.27.0:** ze staan enkel nog in het naammenu, onder Beheer.

**Mijn voorkeuren**, twee schakelaars:
- **Dark mode**: kolom op `personen` (`donkere_modus`: systeem/licht/donker),
  niet in `instellingen` — een voorkeur van de persoon, geen instelling van de
  club. Systeeminstelling volgen is de standaard (`prefers-color-scheme`),
  een handmatige keuze overschrijft dat. Bewaard in de databank, met
  `localStorage` enkel als snel eerste beeld vóór `/api/mij` binnenkomt.
- **Communicatiekanaal** (`kanaal_voorkeur`: mail/push/beide) — ligt al klaar
  sinds fase 5 werd uitgeklaard. Zolang er geen push-kanaal bestaat, gebruikt
  `verwittigen.js` gewoon mail, ongeacht deze keuze; het scherm zegt dat er
  ook expliciet bij.

**De clubaccentkleur blijft ongewijzigd in het donkere thema** — bewust niet
via een strengere `keurAccentkleurGoed()`. Dat was de eerste aanpak, tot bleek
dat de eigen, al lang actieve clubkleur (`#a4232b`) een strengere toets tegen
een donkere achtergrond niet haalt (contrast 2,39, onder zelfs de lossere
grens van 3 voor niet-tekstuele elementen) — dat zou de bestaande kleur met
terugwerkende kracht afgekeurd hebben. De oplossing zit in de CSS: de
accentkleur wordt in donkere modus enkel als achtergrond gebruikt, met een
apart berekende leesbare tekstkleur (`kleur_accent_op_vlak_tekst`, dezelfde
aanpak die de topbalkkleur al had sinds 0.11.0), nooit als tekst- of
randkleur op de donkere pagina zelf.

**Bijvangst: de alignatiefout in de topbalk**, ook expliciet gemeld bij dit
punt. `align-items: flex-start` liet naam/rollen (twee regels) bovenaan hangen
tegenover logo/titel/clubnaam/versie (intussen drie regels sinds 0.14.3, niet
gecentreerd). Nu `align-items: center`.

### T7 — Tabblad "Mijn club": alle wedstrijden van de club op één plek
**Nog uit te werken, bouwt voort op 0.9.0 en op T6.** Een tabblad dat, anders
dan Ploegen, niet per team maar over alle gevolgde teams heen toont wat er
speelt: wedstrijden mét uitslag, een link naar het wedstrijdblad, en een link
naar de statistieken.

**Standaardvenster: het voorbije weekend tot en met het komende weekend.**
Een rollend venster in datums, geen strikte zaterdag/zondag-filter — een
doordeweekse wedstrijd binnen die periode hoort er ook bij te staan. Of een
wedstrijd van bijvoorbeeld donderdag nog als 'komend weekend' geldt of net
buiten het venster valt, is een detail dat bij het bouwen vastgelegd moet
worden.

**Welke teams: een voorkeur, met drie standen.** Alle teams van de club, enkel
mijn eigen teams, of een handmatige selectie. Dat is een persoonlijke voorkeur
en hoort dus bij dezelfde voorzieningen als T6 — niet een aparte tabel ernaast,
maar hetzelfde mechanisme voor 'wat een persoon zelf instelde' waar ook
dark mode in komt te staan.

**Een aparte vlag per team: 'op de hoogte houden'.** Dit is iets anders dan
welke teams er in het tabblad getoond worden — iemand kan een team willen
volgen zonder het in de standaardweergave te zien, of net andersom. Staat de
vlag aan, dan gaat er bij elke wijziging een mail of melding naar die persoon.

**Dit hergebruikt het bestaande wijzigingsmechanisme, maar niet zomaar
één-op-één.** Sinds 0.9.0 berekent `wedstrijdsync.js` al welke wijzigingen
'meldbaar' zijn (`maakWedstrijdplan`), en die berekening is gebouwd voor
begeleiders: een nieuwe uitslag telt daar bewust niet als wijziging, om
COORD, COACH en PLOEGV niet te overspoelen bij elke gespeelde wedstrijd. Voor
iemand die een team als supporter of ouder volgt, is een nieuwe uitslag
juist wél interessant. De twee doelgroepen willen dus niet hetzelfde
gemeld krijgen, en dit vraagt een eigen definitie van 'meldenswaardig' naast
de bestaande, niet een hergebruik ervan.

**Was geblokkeerd op fase 5, deels opgelost sinds 0.18.0.** `mailer.js` en
`verwittigen.js` bestaan nu, met mail als werkend kanaal — de meldingsvlag zou
dus technisch al een mail kunnen versturen zodra deze functie gebouwd wordt.
Push bestaat nog niet (`public/sw.js`, VAPID-secrets, toestelregistratie) en
evenmin de eigen 'meldenswaardig'-definitie hierboven; dat blijft nog te
bouwen, maar niet langer op een volledig lege basis.

**Het wedstrijdblad-patroon is al bekend, uit YOAssist:**
`https://vblweb.wisseq.eu/Home/MatchDetail?wedguid={guid}`. Die link kan dus
meteen gebouwd worden zodra de `wedstrijd_guid` beschikbaar is — geen nieuwe
uitzoekopdracht.

**De link naar de statistieken is niet bevestigd.** In tegenstelling tot het
wedstrijdblad is er geen bekend URL-patroon voor een statistiekenpagina per
wedstrijd. Dat wordt, zoals bij het logo eerder, niet verondersteld maar
nagekeken via de diagnoseroute of een gerichte zoekopdracht vóór het gebouwd
wordt.

**Beslist (bevestigd door Jurgen) — de drie open vragen zijn nu allemaal
beantwoord:**

- **'Meldenswaardig' voor een volger**: enkel datum, uur, locatie en de
  uitslag. Geen scheidsrechterbezetting — dat blijft, zoals vandaag al bij
  begeleiders, buiten deze definitie.
- **Geldt ook voor uitwedstrijden.** Geen beperking tot enkel thuiswedstrijden
  van het gevolgde team.
- **De weergavevoorkeur mag afwijken van de bestaande zichtbaarheidsregel**
  (punt F). Een speler of ouder mag in dit tabblad dus ook wedstrijden van
  ándere teams zien, niet enkel de eigen ploeg — wedstrijdgegevens (datum,
  uur, uitslag) zijn geen aanwezigheidsgegevens en zijn minder gevoelig. Dat
  is hier expliciet vastgelegd als bewuste afwijking, niet iets dat er
  stilzwijgend bij hoort te sluipen: elke andere plek in de app blijft de
  bestaande, strengere regel volgen.

Met deze drie beslissingen is T7 inhoudelijk uitgeklaard. Wat nog rest, is
gewoon bouwwerk: het `wedstrijdtaken`-achtige datamodel voor de meldingsvlag
zelf, de eigen 'meldenswaardig'-berekening naast `maakWedstrijdplan()` (niet
erbovenop, zoals hierboven al uitgelegd), en de link naar de statistieken
alsnog bevestigen vóór die gebouwd wordt.

### T8 — Het versienummer in de topbalk in plaats van enkel de footer — **afgewerkt in 0.14.3**
Het versienummer stond enkel onderaan in de footer (`#versieregel`, gevuld
vanuit `/api/config`). Staat sinds 0.14.3 ook klein, gedempt, onder de
clubnaam in de topbalk. De footer bleef gewoon staan.

### T9 — Herorganisatie van de schermen: een apart tabblad voor zaalbeheer — **afgewerkt in 0.16.0**
Alles wat met een zaal te maken had, stond verspreid over twee tabbladen:
zalen en de twee sjablonen bij Configuratie, periodes bij Dagelijks beheer —
terwijl vakanties, examens en feestdagen rechtstreeks sturen wat een
zaal-gebonden trainingsreeks genereert. Nu samen onder een nieuw tabblad
**Zaalbeheer**: zalen, blokken, sluitingen, `open_op_feestdagen`, beide
sjablonen, en de periodes met hun sync-knoppen.

**Configuratie** houdt over: huisstijl, instellingen, de testrol — wat zelden
wijzigt. **Dagelijks beheer** houdt over: enkel nog de VBL-diagnose.

**Het trainingsuren-sjabloon bleef bewust in Zaalbeheer staan**, niet
verplaatst naar Ploegen — de vraag stond open (het koppelt een team aan een
zaal, hoort dus evenzeer bij beide), maar er was geen aanleiding om van de
bestaande plek af te wijken. Kan later alsnog verhuizen als dat ooit wringt.

Rechten ongewijzigd — zuiver een verplaatsing in de navigatie.
### T10 — Secties samenvouwbaar maken met een pijltje — **afgewerkt in 0.16.0**
Elke sectie in Configuratie en Zaalbeheer staat nu in een `<details>`/
`<summary>`-element — native HTML, geen eigen JavaScript nodig, met de
pijltje-interactie gratis mee (de browser tekent die zelf). Instellingen en
Zalen (de kern van hun tabblad) staan standaard open; de rest (huisstijl, de
testrol, de sluitingsmelding, beide sjablonen, het handmatige
periodeformulier) staat standaard dicht — geen onthouden per bezoek, telkens
dezelfde standaardstand.

**Niet toegepast op de per-ploeg-panelen bij Ploegen** (reeksen, wedstrijden,
aanwezigheid) — die worden al dynamisch getoond of verborgen via JavaScript,
en dat door elkaar laten lopen met `<details>` se eigen open/dicht-status zou
een aparte, foutgevoelige synchronisatie tussen twee mechanismen vragen.
Blijft een aandachtspunt voor een volgende ronde als dat ooit gewenst is.

### T11 — Handmatig een rol aan een persoon koppelen — **afgewerkt in 0.20.0**
Geleverd zoals hier voorgesteld: `POST /api/admin/persoon/rol-koppelen` en
`.../rol-ontkoppelen`, met `bron: 'club'`. Dezelfde bescherming die COACH al
had (`ledensync.js`, `rollenWeg` gefilterd op `bron === 'vbl'`) beschermt nu
ook een handmatig gekoppelde COORD, PLOEGV of tweede ADMIN/FINADM tegen
wegsynchronisatie — die bescherming stond er al sinds het begin, maar was tot
nu toe onbereikbaar omdat er nergens een `bron: 'club'`-rol kon ontstaan.

**De drie open vragen, beantwoord:**
- **Mag een ADMIN zichzelf ontkoppelen?** Nee voor de eigen ADMIN-rol —
  dezelfde bescherming als bij `persoonActief`. Wel voor iemand anders zijn
  ADMIN-rol, en voor elke andere rol, ook de eigen.
- **Wie mag dit gebruiken?** `personen.beheren`, zoals de team-koppeling —
  geen apart, zwaarder recht.
- **Waar?** Bij het persoonsscherm, naast de ploegenlijst — geen apart
  overzicht per rol.

### T12 — Als ADMIN met verschillende profielen kunnen aanmelden om te testen
**Nog uit te werken.** De bestaande testrol (`beperkTot()`, sinds 0.7.x)
lost dit niet op, en dat is nu expliciet vastgesteld, niet enkel vermoed: ze
berekent de **doorsnede** van de echte rechten van de beheerder en een
gesimuleerde rol (`nagebootst.mag(...) && echteRechten.mag(...)`). Daardoor
blijft het altijd dezelfde persoon — de beheerder zelf, met zijn eigen
onderliggende rijen in `team_spelers`/`rollen` — nooit een werkelijk andere
persoon met zijn eigen gegevens, voorkeuren of geschiedenis.

Concreet wat daardoor misloopt:

- **Vraagt voorafgaande, handmatige opzet.** Om als SPELER te testen, moet de
  beheerder zichzelf eerst echt aan een team koppelen (0.17.0); om als COORD
  te testen, zichzelf echt die rol geven (0.20.0). Dat is geen "even
  aanmelden als", dat is "mezelf eerst ombouwen om er daarna een versmalde
  versie van te bekijken".
- **Eén profiel tegelijk, via een schakelaar.** Twee verschillende spelers
  vergelijken (bijvoorbeeld om te zien hoe een ouder met twee kinderen bij
  dezelfde ploeg dat ervaart) kan niet naast elkaar, enkel na elkaar
  omschakelen.
- **Echte neveneffecten blijven aan de echte beheerder hangen.** Een test
  onder de testrol die een bericht zou moeten triggeren (`verwittig()`, fase
  5) verstuurt dat bericht naar het echte e-mailadres van de beheerder, met
  zijn eigen `persoon_id` in `berichten` — niet naar of onder een aparte
  testidentiteit. Test- en echte activiteit lopen door elkaar.

Voorstel, nog niet uitgewerkt: een echte "aanmelden als"-functie voor ADMIN,
die de sessie tijdelijk aan een **specifieke andere persoon** koppelt (diens
werkelijke `persoon_id`, dus zijn eigen `team_spelers`/`rollen`/voorkeuren),
in plaats van de eigen rechten te versmallen. Zou de bestaande testrol niet
per se vervangen — beide kunnen naast elkaar bestaan, voor een ander doel.

**Beslist (bevestigd door Jurgen):**

- **Loggen: ja.** Elke "aanmelden als"-sessie hoort in het logboek, met wie de
  echte beheerder was en wie hij tijdelijk was.
- **Berichten mogen vertrekken tijdens zo'n sessie**, maar met twee harde
  voorwaarden: **enkel naar de aangemelde persoon zelf** (nooit naar de rest
  van een ploeg — een testselectie publiceren mag geen twintig echte mails
  veroorzaken), én **zichtbaar gemarkeerd als test**. Raakt rechtstreeks
  `verwittigen.js`: dat wordt een derde soort begrenzing naast `bericht_modus`,
  en die twee moeten samen kloppen (staat `bericht_modus` op `uit`, dan blijft
  ook een testbericht achterwege).
- **In-/uitschakelen gebeurt per ADMIN, voor zichzelf** — niet clubbreed.
  Belangrijk verschil met de bestaande `testrol_toegelaten`, die wél een
  clubbrede rij in `instellingen` is: dit wordt dus een kolom op `personen`,
  net als `donkere_modus` (T6). Twee beheerders kunnen elk hun eigen stand
  hebben.
- **De keuze komt ná het aanmelden**, als een keuzescherm met profielen, en
  geldt enkel voor die sessie: na afmelden en opnieuw aanmelden moet de keuze
  opnieuw gemaakt worden. Zo kan een vergeten sessie nooit stil blijven
  hangen.
- **Terug naar zichzelf**: de ADMIN meldt zich als ADMIN aan (dus kiest
  zichzelf in dat keuzescherm) en zet 'aanmelden als' weer uit; daarna logt
  hij automatisch gewoon als zichzelf aan, zonder keuzescherm.
- **Een aparte, permanente testpersoon mag ook** — naast het kunnen kiezen van
  een bestaande persoon.

**De vier resterende punten, nu ook bevestigd:**

- **Waar de schakelaar staat**: bij Mijn voorkeuren (T6), enkel zichtbaar voor
  wie `systeem.beheren` heeft.
- **"Gemarkeerd als test" betekent beide**: een `[TEST]`-voorvoegsel in het
  onderwerp (zichtbaar zelfs in een meldingsvoorbeeld op een telefoon) én een
  regel in de tekst zelf. In `berichten` een eigen kolom `is_test`, niet enkel
  herkenbaar aan het onderwerp — anders moet iemand die later `berichten`
  bekijkt zelf tekst gaan parsen om test van echt te onderscheiden.
- **Profiel kiezen: zoeken op naam**, met de permanente testpersoon standaard
  vastgepind bovenaan — elke echte persoon blijft kiesbaar (handig om een
  concreet gemeld probleem na te bootsen), de testpersoon zit meteen bij de
  hand zonder te typen.
- **De permanente testpersoon: een kolom `personen.is_testpersoon`**, en elke
  bestaande query die "echte" personen oplijst (ploeglijsten, selecties,
  vergoedingsoverzichten, de ledensync-vergelijking, de backup) krijgt die
  uitsluiting erbij. Dit kan niet zo structureel dichtgetimmerd worden als bij
  de backup (T14) — er is geen centraal punt zoals `sqlite_master` hiervoor.
  Geborgd met een gerichte regressietest: een testpersoon aanmaken en
  expliciet bevestigen dat hij in geen van die schermen opduikt. Dit is het
  grootste, risicovolste deelstuk van T12 — makkelijk om ergens een query te
  vergeten.

Met deze vier beslissingen is T12 volledig uitgeklaard.

### T13 — Automatische synchronisatie in de uurcron — **afgewerkt in 0.22.0**
Geleverd zoals hier voorgesteld: `src/lib/planner.js` (`takenVoorUur()`,
zuiver en apart getest) beslist welke taak op welk Brussels uur loopt,
`src/lib/geplandetaken.js` voert ze uit met dezelfde fout-opvang als de
bestaande ping. Wedstrijden vier keer per dag (0, 6, 12, 18 uur), ploegen en
leden dagelijks om 3 uur, periodes wekelijks op maandag om 5 uur.

**De drie open vragen, beantwoord:**
- **Frequentie**: exact het YOAssist-ritme voor wedstrijden; ploegen/leden
  dagelijks, periodes wekelijks — geen aanleiding gevonden om vaker te doen.
- **Mislukte run**: het bestaande pingpatroon hergebruikt, ongewijzigd — elke
  mislukking gelogd, twee na elkaar onafgehandeld.
- **Mag een automatische run verwittigen?** Ja, bewust — dat was het hele punt
  van dit pakket. Dezelfde functies als een handmatige synchronisatie, dus
  dezelfde weg naar `verwittig()`. Veilig bij een nieuwe installatie omdat
  `bericht_modus` daar op `'omleiden'` staat; expliciet vermeld in de
  release-uitleg als aandachtspunt vóór het uitrollen.

Onderweg gevonden: `wedstrijdenSync` geeft altijd status 200, ook bij een
mislukte ploeg (die zit gemarkeerd in het antwoord zelf) — een eerste versie
van de uitvoeringslaag die enkel op HTTP-status controleerde, zou zo'n
mislukking gemist hebben. Rechtgezet vóór levering.

### T14 — Backup van de databank — **afgewerkt in 0.23.0**
Niet zoals hier voorgesteld — beter. In plaats van YOAssist's aanpak te
kopiëren (een hardcoded lijst, met een test die controleert of ze nog klopt),
maakt `GET /api/admin/backup` de hele bugklasse onmogelijk: de tabellen komen
rechtstreeks uit `sqlite_master` van de echte databank, op het moment van de
backup zelf. Er is geen lijst die kán achterblijven, dus geen test nodig die
drift moet opvangen.

De kerntest bewijst dat letterlijk: een tabel wordt pas aangemaakt ná het
schrijven van `backup.js`, en zit toch in het resultaat. Ter controle de
exacte YOAssist-fout gesimuleerd (teruggezet naar een hardcoded lijst) — 3
tests rood, waaronder die kerntest.

### T15 — Opruiming van logboek, taak_runs, berichten — en het definitief verwijderen van inactieve personen — **afgewerkt in 0.25.0**
Geleverd zoals uitgeklaard: `kuisLogboekOp()` (365 dagen, enkel
`afgehandeld = 1`), `kuisTaakRunsOp()` (30 dagen), `kuisBerichtenOp()` (120
dagen), `verwijderInactievePersonenOp()` (180 dagen inactief). Een vijfde
geplande taak, `opkuis`, elke dag om 2 uur.

**Twee tabellen extra gevonden tijdens het bouwen**, niet in het
oorspronkelijke overzicht: `accounts` (de aanmeldkoppeling — zonder die te
verwijderen zou een gewiste persoon in theorie nog via zijn oude account
kunnen aanmelden) en `ouder_kind` (`persoon_id` zit hier, net als bij
`team_spelers`, letterlijk in de primary key, als `ouder_id` én als
`kind_id`). Beide volgens dezelfde, al afgesproken regel volledig
verwijderd — geen nieuwe beslissing, enkel het correct doorvoeren ervan.

**Bij `aanwezigheden`**, de enige tabel waar anonimiseren structureel kon:
niet enkel `persoon_id` zelf, ook `opgave_door`, `uitgesloten_door` en
`vaststelling_door` worden losgekoppeld waar ze naar de verwijderde persoon
verwijzen — ook op ándermans aanwezigheidsrij. Geen van die drie heeft een
eigen FK-afdwinging, maar zonder ze los te koppelen zou de identiteit daar
alsnog blijven staan. `logboek.wie` wordt bewust **niet** losgekoppeld: een
verantwoordingsspoor hoort te blijven staan, ook nadat iemand vertrokken is.

De schema-heropbouw voor `aanwezigheden.persoon_id` (nullable maken) is
grondig getoetst tegen een nagemaakte bestaande databank — data blijft
intact, anonimiseren werkt, en twee anonieme rijen voor dezelfde activiteit
botsen niet met de bestaande unieke index.

### T16 — `verwittigen.js` gebruikt `kanaal_voorkeur` nu wel — **afgewerkt in 0.24.0**
`verwittig()` heeft geen `kanaal`-parameter meer — de functie zelf bepaalt hoe,
aan de hand van `personen.kanaal_voorkeur`. Zolang push niet bestaat blijft
mail het enige werkelijke kanaal; wie 'push' koos krijgt voorlopig toch mail,
met een aparte, niet-alarmerende logregel die zichtbaar houdt wie een keuze
maakte die nog niet gehonoreerd kan worden. `berichten.kanaal` registreert
altijd het kanaal dat écht gebruikt is.

### T17 — Blokken bij Zaalbeheer als nette blokken tonen — **afgewerkt in 0.24.0**
Geleverd zoals hier voorgesteld, met de twee open vragen beantwoord:
gegroepeerd per weekdag, en enkel het tijdstip in een blokje (de dag staat al
als label boven de groep, niet herhaald per blokje). Hergebruikt bewust géén
accentkleur zoals `.rollen li` — dit is roosterinformatie, geen rolbadge — en
gebruikt daarom `--vlak`/`--lijn`, die al zonder extra werk donker-veilig zijn.

### T18 — `GET /api/admin/zalen/vrij` heeft geen enkel scherm
**Nog uit te werken, gevonden bij een systematische route-vs-frontend
vergelijking** (dezelfde controle die in 0.13.2 vijf ontbrekende schermen
opleverde). De route bestaat, werkt, heeft rechten (`systeem.beheren`) en een
zinvolle functie: `vrijeBlokken()` in `src/routes/admin/zalen.js` geeft terug
welke blokken van een zaal nog niet aan een actieve trainingsreeks hangen.

Maar er is geen enkele verwijzing naar `/api/admin/zalen/vrij` in `public/` —
de functie is volledig onbereikbaar voor een gebruiker. Voor wie zaaluren
beheert is dat net nuttige informatie: welke uren staan er nog leeg?

Voorstel: een klein paneel bij Zaalbeheer → Zalen, per zaal, dat de vrije
blokken toont — in dezelfde blokjes-stijl als T17 (0.24.0), maar visueel
onderscheiden van de gewone blokken zodat 'vrij' niet met 'bestaat' verward
wordt.

Nog te bepalen:
- **Waar precies**: als aparte uitklapsectie bij Zaalbeheer, of per zaalrij
  meteen zichtbaar naast de bestaande blokken?
- **Of de bestaande blokkenweergave (T17) dit gewoon kan opnemen** — een blok
  dat vrij is een andere kleur of een label geven, in plaats van een tweede
  lijst ernaast. Dat zou minder scherm kosten, maar vraagt dat
  `zalenTonen()` de vrij/bezet-informatie meegeeft, wat ze vandaag niet doet.

### T19 — De instelling `clublogo_bron` wordt geschreven maar nergens gelezen
**Nog uit te werken, klein.** `clublogo_bron` staat als keuzeveld
(`vbl`/`eigen`) in `INSTELBAAR` (`src/routes/admin/instellingen.js`) en wordt
op `'vbl'` gezet wanneer een beheerder het VBL-logo overneemt
(`public/js/schermen/instellingen.js`). Maar geen enkele plek in `src/` leest
die waarde ooit uit — nagekeken, geen enkele treffer buiten het schrijven
zelf.

Gevolg: een beheerder ziet bij Configuratie een instelbaar veld dat geen
enkel effect heeft. Dat is verwarrender dan het niet te tonen.

Twee wegen, nog te kiezen:
- **Gebruiken waarvoor het bedoeld was**: bij het synchroniseren van de
  huisstijl niet overschrijven wanneer `clublogo_bron = 'eigen'`, zodat een
  zelf gekozen logo niet verdwijnt zodra de bond een ander logo publiceert.
  Dat lijkt de oorspronkelijke bedoeling.
- **Schrappen**, als er geen eigen-logo-upload komt (die bestaat vandaag niet;
  zie het restpunt bij fase 5 over het clublogo in mails, dat op dezelfde
  ontbrekende upload wacht).

---

## Officials (YOAssist) — afgewerkt

| Versie | Wat |
|---|---|
| 0.1 – 0.3 | Access-authenticatie, gebruikersbeheer, categorieherkenning, cluboverzicht |
| 0.4 | Scope per wedstrijd, handmatige toewijzing, woensdagregel, uurplanner |
| 0.5 | Automatische toewijzing met droogloop |
| 0.6 | Communicatiemodule (mail) |
| 0.7 | Weekendvenster, klikbare filters, groepering, refs op het YO-scherm |
| 0.8 | Gebruikers per rol, verwijderen, CSV-bulkupload |
| 0.9 | Eigen wedstrijden, CSV-import, overwrite-regel, sessieverloop |
| 0.10 | Vrijgeven per maand |
| 0.11 | Logboek |
| 0.12 | Push-notificaties en persoonlijke voorkeuren |
| 0.13 | Rondleiding |
| 0.14 | Reset per onderdeel, D1-parametergrens opgelost |
| 0.15 | Samenvouwbare secties |
| 0.16 | Backup-export |
| 0.17 | Naammenu in plaats van twee icoontjes |
| 0.18 | Facturatie met momentopnames en correcties |
| 0.19 | Zeven verbeteringen aan beide schermen |
| 0.20 | Verversen bij tabwissel, Vergoeding naar het naammenu, instelbare tabbladen, vlag voor refs buiten VBL |
| 0.20.1 | "Nog te beantwoorden" beperkt tot deze en volgende maand |
| 0.21 | Tekst bij beschikbaren, kaartpositie rondleiding, facturatie naar het menu, Over YOAssist met EUPL |
| 0.22 | Twee aparte rondleidingen, inhoudelijk herwerkt |
| 0.22.1 | Uitleg over meldingen aanzetten, met de iOS-stap, in mail en scherm |
| 0.23 | Kijken als official, met schakelaar in het naammenu |
| 0.24 | App-icoon, manifest, 'Zet op beginscherm' |
| **1.0** | Eerste volwaardige versie: eigen domein, werkende mail, EUPL v1.2 |
| 1.1 – 1.5 | Handleiding in de app, welkomstmail, telefoonnummers met bellen en WhatsApp, kaartlinks, kleuren per toestand |
| 1.6 | Mijn berichten, belangrijk nieuws, documenten |
| 1.7 | Beschikbaarheid namens een kind |
| 1.8 | Meldingenschakelaar per toestel, berichtopties, externe API, agendafeed |
| 1.9 | Uitslag bij gespeelde wedstrijden, herinnering wie nog niet invulde, Beheer gesplitst |
| 1.10 | Regio-pagina bij gevolgde clubs (aparte synchronisatie, vanaf U14), backup uitgebreid naar alle tabellen |
| 1.10.7 | Meldingenbolletje rechtstreeks naar Mijn berichten, teller ververst live terwijl het tabblad open staat, topbalk herzien (club onder YOAssist, rol(len) onder de eigen naam) |
| 1.10.8 | REF-balk op het aanduidingenscherm smaller (max-breedte i.p.v. volledige kaartbreedte), herinnering om het eigen gsm-nummer in te vullen bij een eigen aanduiding, naammenu opgesplitst in Beheer en persoonlijk deel |
| 1.10.9 | Welkomstmail: "Sign in with Cloudflare" vermeld vóór Google/Apple, uitleg over welke wedstrijden de app dekt (U10/U12, en vanaf U14 zonder VBL-scheidsrechters); Regio-pagina toont thuis- en uitploeg nu als aparte, afbrekende velden i.p.v. één te brede regel |
| 1.11.0 | V36: Vergoedingen club toont per official de wedstrijden zelf (datum, ploegen, categorie), ook bij een afgesloten maand; in een open maand kan een wedstrijd weggehaald worden (= aanduiding vrijgeven); vrijgave op een voorbije wedstrijd stuurt geen bericht meer. Tests rekenen hun datums voortaan relatief tegenover vandaag |
| 1.12.0 | V35: cluboverzicht kan voorbije wedstrijden tonen (vanaf de eerste van de vorige maand, eigen groep onderaan, enkel voor beheerders) om achteraf aanduidingen recht te zetten; aanduiden op een voorbije wedstrijd stuurt geen bericht; voorbije wedstrijden tellen nooit mee in de cijfers |
| 1.12.1 | V37: Mijn vergoeding en de maandmail tonen ook de wedstrijden zelf (datum, ploegen, categorie, correcties met teken); een afgesloten maand toont wat er toen meetelde |
| 1.12.2 | V38: lange berichten in Mijn berichten zijn open te klappen ('lees meer'), met de volledige tekst zoals verstuurd en klikbare links; samenvatting van lang nieuws eindigt op '…' i.p.v. midden in een zin. Schema: kolom `berichten.volledig` (ALTER) |
| 1.13.0 | V40: forfait herkennen (`AFOR`/`BFOR` in de uitslag van de bond, vaak al weken op voorhand); woensdagregel, herinneringen, automatisch aanvullen en 'nog te beantwoorden' slaan forfaitwedstrijden over; officials zien 'gaat niet door'; eigen aanduidingen automatisch vrijgegeven als het forfait vóór de wedstrijddag gekend is (instelbaar: of enkel melden); forfait gemarkeerd in de vergoedingen. Ook: keuzelijst 'Extern lezen' toonde na herladen altijd 'initialen'. Schema: kolom `matches.forfait` en instelling `forfait_aanduiding` |
| 1.14.0 | V39: de woensdaglijst van Basketbal Vlaanderen is de bron van de woensdagregel. De app ontvangt de mail zelf (Cloudflare Email Routing, rechtstreeks of doorgestuurd vanuit Gmail), haalt het Excel-bestand op en leest het uit, koppelt de eigen thuiswedstrijden, en verwerkt om 14 uur; geen lijst om 14 uur = waarschuwing, om 20 uur terugval op de API. Afwijkingen en niet te koppelen ploegen naar de beheerders; status bij Beheer. 'Nog nodig' volgt de lijst. Ook: de backup miste 9 van de 21 tabellen (o.a. de facturatie); nu alle 22, met een test tegen het schema. Schema: kolom `matches.bond_officials`, tabel `vbl_lijsten`. Samen met v1.13.0 uitgerold, met één SQL-script |
| 1.14.1 | V41: Regio toonde ook G08-wedstrijden, waar nooit een scheidsrechter voor komt. De filter is nu een toelatingslijst vanaf U14 (G14 t.e.m. HSE/DSE) in plaats van een uitsluitingslijst van U10/U12; G08, ROL en onbekende categorieën vallen eruit, bestaande rijen verdwijnen bij de volgende Regio-synchronisatie. Geen schemawijziging |
| 1.14.2 | V33: dagelijkse opruiming om 4 uur, naast die van de berichten: afgehandelde logregels ouder dan een jaar en syncrondes ouder dan 60 dagen. Wat in het logboek nog openstaat, blijft altijd; de laatste backup-regel en de laatste syncronde ook, zodat het beheerscherm na een lange stilte niet 'nooit' toont. Geen schemawijziging |
| 1.15.0 | V26: bij Beheer → Gebruikers staat per persoon of die pushmeldingen krijgt, op welke toestellen en wanneer er het laatst een aankwam; een toestel waar de laatste melding mislukte staat apart als 'werkt niet meer'. Onderaan een teller over de actieve gebruikers. Gemeten op de toestellen, niet op de voorkeur. Enkel voor beheerders. Geen schemawijziging |
| 1.16.0 | V42: Regio volgt de woensdaglijst van de bond. Wat er niet in staat, heeft volgens de bond twee officials en verdwijnt uit Regio, ook als de API nog niemand toont; het aantal is het hoogste van API en lijst. Per dag staat erbij of de cijfers uit de lijst komen of nog uit de API (meestal het tweede weekend). Ploegen van gevolgde clubs die in de lijst staan maar niet te koppelen zijn, komen mee in de mail naar de beheerders. Schema: kolommen `volg_wedstrijden.bond_officials` en `vbl_lijsten.volg` (ALTER) |
| 1.17.0 | V34: ploegverantwoordelijken en coaches krijgen woensdag 20 uur een mail als er voor hun thuiswedstrijd van het weekend te weinig scheidsrechters zijn (bond + club < 2), en donderdag 20 uur opnieuw als het dan nog niet gelukt is, met de vraag om mee te zoeken. Twee aparte lijsten bij Configuratie, bijgehouden met een sjabloon dat al ingevuld is met elke gevolgde ploeg; inlezen vervangt per ploeg in het bestand, altijd eerst een droogloop. Schema: tabellen `ploeg_pv` en `ploeg_coaches` (CREATE) |

---

## Officials (YOAssist) — openstaand

### V32 — Pushmelding tikken op smartphone: uitzoeken of het echt naar Mijn berichten gaat
**Nog uit te zoeken, geen bug bevestigd.** Ontstaan uit een vraag of tikken op
een pushmelding op de telefoon meteen naar Mijn berichten gaat. De code in
`public/sw.js` (`notificationclick`) doet dat al, in twee gevallen:

- App staat nog niet open → `self.clients.openWindow('/?open=berichten')`;
  `index.html` leest die parameter bij het laden en opent het paneel.
- App staat al open (voor- of achtergrond) → het venster wordt naar voren
  gehaald met `.focus()` en krijgt een boodschap (`{type: 'open-berichten'}`)
  waarop het paneel opent zonder herlaad.

Dat mechanisme bestond al vóór v0.24 en is dus niet nieuw gebouwd. Op basis van
de code alleen kon niet bevestigd worden of het op een echt toestel ook zo
voelt — dat vraagt een test met een echte melding op een echte telefoon
(Android én iPhone apart, telkens met de app op het beginscherm én gewoon in
de browser).

Nog te bepalen bij het testen:
- Gaat het inderdaad naar Mijn berichten, of blijft de telefoon op het
  aanduidingenscherm staan?
- Verschil tussen Android en iPhone, en tussen 'op het beginscherm gezet' en
  'gewoon in de browser'?
- Als het niet werkt: gebeurt er dan niets, of gaat het naar de verkeerde
  plek?

Hangt samen met het bredere punt onderaan CONTEXT.md: de app is nog nooit met
echte officials op echte toestellen getest.

### V43 — Eigen aanduidingen bij Basketbal Vlaanderen in het aanduidingenscherm
**Beslist, eerst uit te zoeken, dan te bouwen.** **Na I1**: de zoeknaam wordt dan
`personen.naam_vbl` in plaats van een nieuwe kolom `users.vbl_naam`. Officials die ook door de
bond worden aangeduid, zien die wedstrijden nu niet in YOAssist. Voorbeeld:
zondag 11/10 om 10u, GSG Aarschot G14C — een aanduiding van Basketbal
Vlaanderen bij een andere club. Die wedstrijden moeten in het
aanduidingenscherm komen, met een eigen tag en achtergrondkleur die duidelijk
maakt dat het een aanduiding van de bond is, geen aanduiding van de club.

**Beslist:**
- **Zoekgebied: heel Vlaanderen**, niet enkel de eigen en gevolgde clubs.
- **Telt niet mee voor de vergoeding** — de bond betaalt die zelf.
- **Agendafeed en herinneringen: aan/uit in Mijn voorkeuren, standaard
  aan.** Eén schakelaar die beide regelt (agenda én herinneringen dag
  ervoor / dag zelf); de bestaande schakelaars `herinner_avond` en
  `herinner_ochtend` blijven daarbovenop gelden.
- **De zoeknaam staat in Mijn voorkeuren**, zichtbaar en aanpasbaar door de
  official zelf (en door de beheerder). De naam bij de bond kan licht
  afwijken van die in YOAssist. Leeg = zoeken op de gewone naam.
- **Waar een beheerder de zoeknaam aanpast** (voorstel): bij Beheer →
  Gebruikers, met een knopje **vbl** in de rij, naast *welkom*, *ouder* en
  *aan/uit* — zelfde patroon als *ouder*. Het toont de huidige zoeknaam
  (of de gewone naam als die leeg is) en laat ze aanpassen of leegmaken.
  Wijkt de zoeknaam af van de gewone naam, dan staat ze onder de naam in de
  rij ('VBL: …'), zoals 'vult in voor …'. Backend: een extra veld `vblNaam`
  in de bestaande `PATCH /api/admin/users`; leeg = NULL. Een ouder past de
  zoeknaam van zijn kind aan via Mijn voorkeuren met de keuzelijst 'namens'.

**Eerst uitzoeken.** De API heeft geen endpoint 'alle wedstrijden van een
scheidsrechter'. Het enige spoor is `wedOff`, een lijst met namen bij elke
wedstrijd, en die is enkel per club (`OrgMatchesByGuid`) of per ploeg op te
vragen. Heel Vlaanderen doorzoeken betekent dus: elke club apart ophalen.
Na te gaan:
- **Hoe aan de lijst van alle clubs te komen.** Er is geen endpoint 'alle
  clubs'. Opties: de clubnummers `BVBL0001`–`BVBL9999` één keer aftasten en
  de bestaande bewaren (per seizoen herhalen), of de clubs afleiden uit de
  tegenstanders in de wedstrijden (`tTGUID`/`tUGUID`) en zo uitbreiden tot er
  niets nieuws meer bijkomt.
- **Hoeveel calls de Worker per run mag doen.** Cloudflare beperkt het
  aantal subrequests per aanroep (50 op het gratis plan). Met een paar
  honderd clubs moet de ophaling dus over meerdere uren gespreid worden —
  bv. een deel van de clubs per uur, in een vaste rotatie, zodat elke club
  minstens één keer per dag aan bod komt.
- **Bestaat er toch een endpoint per persoon** (de verkenning en de spec van
  2015 toonden er geen)?
- **In welke vorm staat een naam in `wedOff`** ('Voornaam Naam', 'NAAM
  Voornaam', met of zonder licentienummer)?

**Voorstel voor de bouw:**
- **Koppelen op naam, losjes maar niet te los**: hoofdletters, accenten,
  dubbele spaties en de volgorde voornaam/naam niet laten meetellen. Wat
  daarbuiten afwijkt, lost de official op door zijn zoeknaam aan te passen.
- **Bewaren** in een nieuwe tabel `vbl_aanduidingen` (wedstrijd-guid, user,
  datum, uur, ploegen, categorie, zaal, laatst gezien), gevuld door een
  aparte synchronisatie naar het voorbeeld van `volgsync.js`. Enkel wat bij
  een eigen gebruiker hoort; de andere namen uit `wedOff` zijn
  persoonsgegevens en worden niet bewaard. Niet in `matches`: daar zouden ze
  in woensdagregel, facturatie of eigen herinneringen belanden.
- **Tonen** tussen de eigen aanduidingen, met label 'VBL' en een eigen
  achtergrondkleur; alleen-lezen, geen knoppen.
- **Botsingscontrole**: een clubaanduiding die botst met een VBL-aanduiding
  van dezelfde persoon, melden bij het aanduiden (zelfde regels: twee uur
  zelfde zaal, tweeënhalf uur anders).

**Schema:** in `users` twee kolommen erbij — `vbl_naam TEXT` (NULL = de
gewone naam) en `vbl_aanduidingen INTEGER NOT NULL DEFAULT 1` — met
`ALTER TABLE ... ADD COLUMN`. Nieuwe tabel `vbl_aanduidingen` (en eventueel
`vbl_clubs` voor de clublijst en de rotatie) met een gewone `CREATE TABLE`.
Geen DROP nodig. Beide nieuwe tabellen ook in de backup (`TABELLEN`).

Nog te bepalen:
- Zien beheerders de VBL-aanduidingen van een official ook (cluboverzicht,
  bij het aanduiden), of enkel de official zelf? Voorstel: beheerders zien
  ze bij het aanduiden als reden voor een botsing, niet als aparte lijst.
- Hoe snel na een aanduiding door de bond moet ze in YOAssist staan? Bepaalt
  de rotatie (één keer per dag lijkt genoeg).

### V29 — Evaluatiemodule
**Nog uit te werken, zeer open.** Een manier om Youth Officials te evalueren
na een wedstrijd. Nog geheel te bepalen: wie evalueert (een beheerder, een
mede-official, de club), welke criteria, op welk moment, en of de official
zelf de evaluatie te zien krijgt. Raakt vermoedelijk het datamodel met een
nieuwe tabel gekoppeld aan `assignments`.

### V30 — Een aparte demo-omgeving
**Aanpak gekozen, verder uit te werken.** Na I1 op een subdomein, bv.
`demo.clubassist.org`. Dient voor twee dingen tegelijk: aan
andere clubs laten zien wat de app kan, én zelf nieuwe functies uitproberen
zonder de echte club te raken.

**Gekozen: optie A, een volledig aparte Worker met eigen D1-databank**, op een
eigen (sub)domein, bijvoorbeeld `demo.yoassist.org`. Volledig gescheiden van de
echte club — geen risico dat demo-gegevens en echte gegevens door elkaar lopen.

Overwogen en verworpen: één demomodus binnen dezelfde Worker (een vlag die
demo-gegevens markeert). Minder onderhoud, maar te veel risico: elke plek waar
de app 'alle clubs' of 'alle gebruikers' doorloopt (synchronisatie, facturatie,
het beheerscherm) zou de filter correct moeten toepassen, en mail versturen zou
voor demo-gebruikers apart onmogelijk gemaakt moeten worden. Eén gemiste plek
betekent dat een nepofficial een echte mail krijgt, of omgekeerd.

**Wat dit kost, expliciet meegenomen in de keuze:** een tweede installatie om
te onderhouden. Elke nieuwe versie en elke schemawijziging moet twee keer
gedeployed worden — eenmaal voor de echte club, eenmaal voor de demo. Zonder
dat bewust bij te houden, loopt de demo op termijn een paar versies achter.

Nog te bepalen:
- Realistische naamgeving (club, teams, officials) die overtuigend oogt voor
  wie de demo bezoekt, zonder dat het op echte namen lijkt.
- Een manier om de demo makkelijk terug te zetten naar een schone staat, voor
  het tweede doel (zelf experimenteren zonder rommel te laten liggen).
- Wie toegang krijgt tot de demo-Worker, en of daar een eigen, simpelere
  aanmelding voor komt (een demo hoeft niet achter dezelfde Access-policy te
  zitten als de echte club).

### V8b — Supabase in plaats van Cloudflare Access
**Achterhaald door I1: Supabase wordt de aanmelding voor de samengevoegde app.**
De afweging hieronder gold voor YOAssist alleen.

**Toen: afgeraden, tenzij er een reden opduikt.** Zou Access vervangen als eerste
laag, met een eigen JWT dat de Worker moet verifiëren. Voegt een derde partij
toe naast Cloudflare en Resend, en bij "alleen voor niet-admins" zouden er twee
parallelle inlogsystemen ontstaan. Als de aanleiding is dat de PIN-per-mail
omslachtig aanvoelt, lost punt VU hetzelfde op zonder extra partij.

### VU — Microsoft 365 als identity provider
**Gesloten, geen actie.** Niet iedereen heeft een Microsoft-account van de club
— sommigen wel, de meesten niet. Zonder volledige dekking moet de PIN-per-mail
sowieso blijven bestaan als terugvalmogelijkheid, dus dit vervangt niets en voegt
enkel een tweede aanmeldmethode toe zonder een probleem op te lossen.

Verandert de situatie ooit — krijgt iedereen een clubaccount — dan is dit zonder
veel werk alsnog toe te voegen: Cloudflare Access ondersteunt Microsoft Entra ID
als standaardintegratie, en de code van YOAssist verandert er niet door.
