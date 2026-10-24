# Backlog — TeamAssist en YOAssist

**Eén backlog voor beide apps.** YOAssist gaat op in TeamAssist (zie I1); vanaf
nu staat elk openstaand punt hier, en nergens anders. `YOASSIST-BACKLOG.md` in
de YOAssist-repo verwijst enkel nog hierheen.

Nummering blijft zoals ze was, zodat oude verwijzingen in code en
WIJZIGINGEN-bestanden blijven kloppen:
- **I** — de integratie zelf
- **V** — de module Officials (het vroegere YOAssist)
- **T** en **punt A–AA** — TeamAssist

Stand: YOAssist **v1.17.0**, TeamAssist **0.25.0**

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

### Domein

`teamassist.org` wordt nagevraagd; subdomeinen kunnen daaronder (bv.
`demo.teamassist.org` voor V30). Voorstel zolang niets anders beslist is:
- De app op `teamassist.org`.
- `yoassist.org` blijft als tweede eigen domein aan dezelfde Worker hangen en
  stuurt door (301) naar `teamassist.org` — **behalve** `/api/kalender/` en
  `/api/extern/`, die het rechtstreeks blijft bedienen. Een agenda-abonnement
  van een official staat al in zijn agenda, en niet elke agenda-app volgt een
  doorverwijzing.
- Pushmeldingen hangen vast aan het domein van de service worker: officials
  zetten ze na de overstap één keer opnieuw aan. De oude abonnementen worden
  bij de migratie niet overgenomen.
- In Supabase moeten beide adressen bij de Redirect URLs.

### Datamodel (voorstel)

- `users` → `personen`. Nieuwe rollen `YO` en `YOPLUS`, clubbreed zoals
  `ADMIN`; `is_admin` → `ADMIN`; de vergoedingen gaan naar `FINADM`. De CHECK
  op `rollen` wijzigt — omdat er nog geen echte gegevens zijn, gewoon in het
  schema.
- `matches` gaat op in `wedstrijden`. Wat enkel de officials aanbelangt, in
  een eigen tabel `wedstrijd_officials (wedstrijd_id, scope, scope_reden,
  scope_uit, refs_vbl, bond_officials, refs_bevestigd, forfait)`, zodat de
  kerntabel zuiver blijft en de CHECK op `scope_reden` in de module zit.
- Gaan mee als moduletabellen, met `persoon_id` in plaats van een e-mailadres:
  `availability`, `assignments`, `problemen`, `afgesloten_maanden`,
  `vergoeding_regels`, `vergoeding_verwerkt`, `categorieen` (tarieven),
  `volg_clubs`, `volg_wedstrijden`, `vbl_lijsten`.
- Samengevoegd met wat TeamAssist al heeft: `ouder_kind`, `logboek`,
  `berichten`, `teams`, instellingen. `push_abonnementen`, `mededelingen` en
  `mededeling_gezien` komen er van YOAssist bij.
- `ploeg_pv` en `ploeg_coaches` (V34) verdwijnen: die mail gaat naar wie de
  rol `PLOEGV` of `COACH` heeft. Een PV of coach hoeft daarvoor geen account
  te hebben.
- De VBL-zoeknaam van V43 wordt `personen.naam_vbl`, dat al bestaat.
- De backup (`TABELLEN`) en `schema-controle.sql` volgen het nieuwe schema;
  de test die backup en schema naast elkaar legt, gaat mee.

### Fases — één pakket per fase, telkens met zip en delta-zip

1. **Schil en fundament.** De kopbalk en menu's van YOAssist in TeamAssist;
   push (VAPID), `verwittigen.js`, berichten en mededelingen samengevoegd.
2. **Schema van de module Officials**, plus `tools/migreer-yoassist.mjs`: leest
   een YOAssist-backup (JSON, alle 22 tabellen) en maakt er SQL voor het nieuwe
   schema van. Getest tegen een echte backup.
3. **Backend overzetten**: woensdagregel en woensdaglijst (mail, xlsx),
   aanduiden en botsingen, autotoewijzing, facturatie, Regio, forfait,
   herinneringen, agendafeed en externe API. De tests verhuizen mee naar
   `node:sqlite` — dan draaien ze ook in een Claude-sandbox.
4. **Frontend overzetten**, scherm per scherm, als modules.
5. **Parallel draaien** op een testadres, daarna overschakelen: migratie
   uitvoeren, officials uitnodigen via Supabase, `yoassist.org` laten
   doorverwijzen.

Tot de overstap blijft YOAssist live en krijgt het enkel bugfixes.

### Nog te bepalen

- Of `teamassist.org` lukt; zo niet, welk domein.
- Of de module in de app *Officials* of *YOAssist* heet.

---

## TeamAssist — openstaand

**Nog over te nemen uit de TeamAssist-backlog in het Claude-project.** Die
stond niet in de repo. Uit de WIJZIGINGEN-bestanden blijkt dat o.a. T1, T6,
T8–T11, T13–T17 en de punten A, M, X, Y, AA geheel of gedeeltelijk gebouwd
zijn; T7 (tabblad Mijn club) en punt Z (zalensjabloon) worden er als
openstaand vermeld. De volledige lijst hoort hier.

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
`demo.teamassist.org`. Dient voor twee dingen tegelijk: aan
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
omslachtig aanvoelt, lost punt U hetzelfde op zonder extra partij.

### U — Microsoft 365 als identity provider
**Gesloten, geen actie.** Niet iedereen heeft een Microsoft-account van de club
— sommigen wel, de meesten niet. Zonder volledige dekking moet de PIN-per-mail
sowieso blijven bestaan als terugvalmogelijkheid, dus dit vervangt niets en voegt
enkel een tweede aanmeldmethode toe zonder een probleem op te lossen.

Verandert de situatie ooit — krijgt iedereen een clubaccount — dan is dit zonder
veel werk alsnog toe te voegen: Cloudflare Access ondersteunt Microsoft Entra ID
als standaardintegratie, en de code van YOAssist verandert er niet door.
