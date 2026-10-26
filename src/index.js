// TeamAssist — routetabel, authenticatie en de uurplanner.
//
// Elke route zegt expliciet welk recht ze vraagt. Staat er geen recht bij, dan
// volstaat een geldige identiteit; staat er `publiek: true`, dan is er geen
// identiteit nodig. Die drie standen zijn de enige; een route die het niet
// zegt, komt er niet in.

import { fout, json } from './lib/http.js';
import { tokenUitVerzoek, verifieerToken } from './lib/supabase.js';
import { identiteitVoor } from './lib/identiteit.js';
import { rechtenVoor } from './lib/rechten-db.js';
import { beperkTot, magTestrolGebruiken } from './lib/rechten.js';
import { seizoenUitVerzoek } from './lib/seizoen.js';
import { voerPingUit } from './lib/ping.js';
import { brusselUur, brusselWeekdag } from './lib/klok.js';
import { takenVoorUur } from './lib/planner.js';
import { voerGeplandeTakenUit } from './lib/geplandetaken.js';
import { logSchrijf } from './lib/logboek.js';
import { mij } from './routes/mij.js';
import { voorkeurenBewaren } from './routes/voorkeuren.js';
import { meelezenTonen, meelezenZetten, meelezenAntwoord } from './routes/meelezen.js';
import {
  officialsWedstrijden, beschikbaarheidZetten, probleemMelden, kandidatenTonen, aanduiden, vrijgeven,
  scopeZetten, refsBevestigen, problemenTonen, probleemAfhandelen,
} from './officials/routes.js';
import { officialsSync } from './officials/sync-route.js';
import { woensdaglijstTonen } from './officials/woensdaglijst-route.js';
import { automatischAanvullen } from './officials/aanvullen.js';
import { vulNogIn } from './officials/herinneringen.js';
import {
  facturatieOverzicht, facturatieVoorbeeld, facturatieAfsluiten, facturatieStaat, ontvangersZetten,
  facturatiePerOfficial, tarievenTonen, tariefZetten, mijnVergoeding,
} from './officials/facturatie.js';
import {
  volgClubsTonen, volgClubToevoegen, volgClubWeg, regioTonen, regioSync, regioLeegmaken,
} from './officials/regio.js';
import { externeAanduidingen, kalender, agendaLink } from './officials/extern.js';
import { officialsVoorkeurenTonen, officialsVoorkeurenBewaren } from './officials/voorkeuren.js';
import { ontvangMail } from './officials/woensdaglijst.js';
import {
  berichtenTonen, berichtenOngelezen, berichtGelezen, berichtVerwijderen, mededelingTonen, mededelingWegklikken,
} from './routes/berichten.js';
import { mededelingHuidige, mededelingPlaatsen, mededelingIntrekken } from './routes/admin/mededeling.js';
import { pushAbonneer, pushAfmelden, pushToestellen, pushTest } from './routes/push.js';
import { opgaveZetten, mijnOpgaven } from './routes/aanwezigheid-opgave.js';
import { aanmeldlink } from './routes/aanmeldlink.js';
import { vblDiagnose } from './routes/admin/vbl-diagnose.js';
import { teamsLijst, teamsSync, teamGevolgd } from './routes/admin/teams.js';
import { ledenSync } from './routes/admin/leden.js';
import { teamLeden, personenZoeken } from './routes/admin/bekijken.js';
import {
  persoonTonen, persoonBewaren, persoonActief, teamKoppelen, teamOntkoppelen, rolKoppelen, rolOntkoppelen,
  ouderKoppelen, ouderOntkoppelen,
} from './routes/admin/persoon.js';
import { instellingenTonen, instellingBewaren, instellingLezen } from './routes/admin/instellingen.js';
import { backupExporteren } from './routes/admin/backup.js';
import {
  zalenTonen, zaalAanmaken, blokAanmaken, blokVerwijderen, vrijeBlokken, sluitingAanmaken, zetOpenOpFeestdagen,
} from './routes/admin/zalen.js';
import {
  reeksenTonen, reeksAanmaken, reeksStoppen, reeksGenereren, trainingenTonen,
} from './routes/admin/trainingsreeksen.js';
import { periodesTonen, periodeAanmaken, periodeVerwijderen, vakantiesSync, feestdagenSync } from './routes/admin/periodes.js';
import { wedstrijdenSync, wedstrijdenTonen } from './routes/admin/wedstrijden.js';
import { sjabloonExporteren, sjabloonImporteren } from './routes/admin/sjabloon.js';
import { zaalsjabloonExporteren, zaalsjabloonImporteren } from './routes/admin/zaalsjabloon.js';
import { reeksensjabloonExporteren, reeksensjabloonImporteren } from './routes/admin/reeksensjabloon.js';
import {
  aanwezigheidTonen, vaststellen, uitsluiten, selectieZetten, selectiePubliceren,
} from './routes/admin/aanwezigheid-beheer.js';
import { wedstrijdtakenTonen, wedstrijdtaakToewijzen, wedstrijdtaakProbleemMelden, taakKandidaten } from './routes/admin/wedstrijdtaken.js';
import { brandingVoorstel, brandingTonen } from './routes/admin/branding.js';
import { VERSIE } from './versie.js';

export const ROUTES = [
  { methode: 'GET', pad: '/api/versie', publiek: true, doe: () => json({ versie: VERSIE }) },

  // De frontend moet weten waar hij zich moet aanmelden. Het adres van het
  // project en de anon-sleutel zijn publieke gegevens — de anon-sleutel geeft op
  // zichzelf geen toegang tot iets, hij benoemt enkel het project. Ze hier
  // opvragen in plaats van in de HTML zetten, houdt de configuratie op één plek.
  {
    methode: 'GET',
    pad: '/api/config',
    publiek: true,
    doe: ({ env }) =>
      json({
        supabase_url: env.SUPABASE_URL ?? '',
        supabase_publishable_key: env.SUPABASE_PUBLISHABLE_KEY ?? '',
        // De publieke VAPID-sleutel: de browser heeft ze nodig om zich in te
        // schrijven. Publiek van aard; de private sleutel blijft een secret.
        vapid_publiek: env.VAPID_PUBLIEK ?? '',
        versie: VERSIE,
      }),
  },

  // Publiek, net als /api/config: het aanmeldscherm mag de huisstijl al kennen
  // vóór iemand ingelogd is. Enkel wat op het scherm komt, nooit gevoelige
  // gegevens.
  { methode: 'GET', pad: '/api/branding', publiek: true, doe: brandingTonen },

  // Publiek, want wie een link vraagt is per definitie nog niet aangemeld. De
  // route verstuurt enkel iets naar een adres dat bij een actieve persoon hoort,
  // en antwoordt altijd hetzelfde zodat ze niet te gebruiken is om uit te zoeken
  // wie er lid is.
  { methode: 'POST', pad: '/api/aanmeldlink', publiek: true, doe: aanmeldlink },

  { methode: 'GET', pad: '/api/mij', doe: mij },
  { methode: 'POST', pad: '/api/mij/voorkeuren', doe: voorkeurenBewaren },
  // Berichten ook naar de ouders (0.32.0): over jezelf of een eigen kind;
  // dat het een eigen kind is, controleert de route tegen ouder_kind.
  { methode: 'GET', pad: '/api/meelezen', doe: meelezenTonen },
  { methode: 'POST', pad: '/api/meelezen', doe: meelezenZetten },
  { methode: 'POST', pad: '/api/meelezen/antwoord', doe: meelezenAntwoord },
  // Module Officials (0.33.0). Voor de official zelf of namens een kind: de
  // route rekent de rechten van wie het gaat om (officials/routes.js).
  { methode: 'GET', pad: '/api/officials/wedstrijden', doe: officialsWedstrijden },
  { methode: 'POST', pad: '/api/officials/beschikbaarheid', doe: beschikbaarheidZetten },
  { methode: 'POST', pad: '/api/officials/probleem', doe: probleemMelden },
  { methode: 'POST', pad: '/api/admin/officials/sync', recht: 'officials.beheren', doe: officialsSync },
  { methode: 'GET', pad: '/api/admin/officials/kandidaten', recht: 'officials.beheren', doe: kandidatenTonen },
  { methode: 'POST', pad: '/api/admin/officials/aanduiden', recht: 'officials.beheren', doe: aanduiden },
  { methode: 'POST', pad: '/api/admin/officials/vrijgeven', recht: 'officials.beheren', doe: vrijgeven },
  { methode: 'POST', pad: '/api/admin/officials/scope', recht: 'officials.beheren', doe: scopeZetten },
  { methode: 'POST', pad: '/api/admin/officials/refs-bevestigd', recht: 'officials.beheren', doe: refsBevestigen },
  { methode: 'GET', pad: '/api/admin/officials/problemen', recht: 'officials.beheren', doe: problemenTonen },
  { methode: 'POST', pad: '/api/admin/officials/probleem-afhandelen', recht: 'officials.beheren', doe: probleemAfhandelen },
  { methode: 'GET', pad: '/api/admin/officials/woensdaglijst', recht: 'officials.beheren', doe: woensdaglijstTonen },
  { methode: 'POST', pad: '/api/admin/officials/automatisch', recht: 'officials.beheren', doe: automatischAanvullen },
  { methode: 'POST', pad: '/api/admin/officials/vul-nog-in', recht: 'officials.beheren', doe: vulNogIn },
  // De vergoedingen (0.36.0): YOADM, ADMIN en FINADM — de penningmeester
  // beheert de officials niet, maar sluit wel de maand af.
  { methode: 'GET', pad: '/api/admin/officials/facturatie', recht: 'officials.vergoedingen', doe: facturatieOverzicht },
  { methode: 'GET', pad: '/api/admin/officials/facturatie/voorbeeld', recht: 'officials.vergoedingen', doe: facturatieVoorbeeld },
  { methode: 'POST', pad: '/api/admin/officials/facturatie/afsluiten', recht: 'officials.vergoedingen', doe: facturatieAfsluiten },
  { methode: 'GET', pad: '/api/admin/officials/facturatie/staat', recht: 'officials.vergoedingen', doe: facturatieStaat },
  { methode: 'GET', pad: '/api/admin/officials/facturatie/officials', recht: 'officials.vergoedingen', doe: facturatiePerOfficial },
  { methode: 'POST', pad: '/api/admin/officials/facturatie/ontvangers', recht: 'officials.vergoedingen', doe: ontvangersZetten },
  { methode: 'GET', pad: '/api/admin/officials/tarieven', recht: 'officials.vergoedingen', doe: tarievenTonen },
  { methode: 'POST', pad: '/api/admin/officials/tarieven', recht: 'officials.vergoedingen', doe: tariefZetten },
  // Mijn vergoeding: wie iets verdiende, ook als hij intussen geen rol meer heeft.
  { methode: 'GET', pad: '/api/officials/vergoeding', doe: mijnVergoeding },
  // Regio (0.37.0).
  { methode: 'GET', pad: '/api/admin/officials/volg-clubs', recht: 'officials.beheren', doe: volgClubsTonen },
  { methode: 'POST', pad: '/api/admin/officials/volg-clubs', recht: 'officials.beheren', doe: volgClubToevoegen },
  { methode: 'POST', pad: '/api/admin/officials/volg-clubs/weg', recht: 'officials.beheren', doe: volgClubWeg },
  { methode: 'GET', pad: '/api/admin/officials/regio', recht: 'officials.beheren', doe: regioTonen },
  { methode: 'POST', pad: '/api/admin/officials/regio/sync', recht: 'officials.beheren', doe: regioSync },
  { methode: 'POST', pad: '/api/admin/officials/regio/leegmaken', recht: 'officials.beheren', doe: regioLeegmaken },
  // Van buitenaf lezen (0.37.0). Publiek, maar met een eigen sleutel: in de
  // header (extern) of in de URL (kalender, want een agenda-app kan geen
  // header meesturen). Het pad van de kalender bevat de sleutel: een prefix.
  { methode: 'GET', pad: '/api/extern/aanduidingen', publiek: true, doe: externeAanduidingen },
  { methode: 'GET', pad: '/api/kalender/', prefix: true, publiek: true, doe: kalender },
  { methode: 'POST', pad: '/api/officials/agenda', doe: agendaLink },
  { methode: 'GET', pad: '/api/officials/voorkeuren', doe: officialsVoorkeurenTonen },
  { methode: 'POST', pad: '/api/officials/voorkeuren', doe: officialsVoorkeurenBewaren },
  // Mijn berichten en de banner: over jezelf, zoals /api/mij. Elke query
  // filtert op de persoon uit het token.
  { methode: 'GET', pad: '/api/berichten', doe: berichtenTonen },
  { methode: 'GET', pad: '/api/berichten/ongelezen', doe: berichtenOngelezen },
  { methode: 'POST', pad: '/api/berichten/gelezen', doe: berichtGelezen },
  { methode: 'POST', pad: '/api/berichten/verwijderen', doe: berichtVerwijderen },
  { methode: 'GET', pad: '/api/mededeling', doe: mededelingTonen },
  { methode: 'POST', pad: '/api/mededeling/wegklikken', doe: mededelingWegklikken },
  // Meldingen op dit toestel: ook over jezelf.
  { methode: 'POST', pad: '/api/push/abonneer', doe: pushAbonneer },
  { methode: 'POST', pad: '/api/push/afmelden', doe: pushAfmelden },
  { methode: 'GET', pad: '/api/push/toestellen', doe: pushToestellen },
  { methode: 'POST', pad: '/api/push/test', doe: pushTest },
  // Een mededeling plaatsen: enkel wie het systeem beheert.
  { methode: 'GET', pad: '/api/admin/mededeling', recht: 'systeem.beheren', doe: mededelingHuidige },
  { methode: 'POST', pad: '/api/admin/mededeling', recht: 'systeem.beheren', doe: mededelingPlaatsen },
  { methode: 'POST', pad: '/api/admin/mededeling/intrekken', recht: 'systeem.beheren', doe: mededelingIntrekken },

  // Aanwezigheid opgeven. Geen route.recht: het team waar het over gaat komt
  // pas na een databankoproep boven water (via de activiteit), en of iemand
  // 'eigen' of 'namens een kind' invult, hangt af van de body — geen van
  // beide is uit de request-URL alleen af te leiden zoals bij de andere
  // routes. De route controleert dit zelf, met ctx.persoon als enige bron
  // voor wie de aanroeper is.
  { methode: 'POST', pad: '/api/aanwezigheid/opgave', doe: opgaveZetten },
  { methode: 'GET', pad: '/api/aanwezigheid/mijn', doe: mijnOpgaven },

  // Enkel voor wie het systeem beheert: het toont ruwe gegevens van de bond.
  {
    methode: 'GET',
    pad: '/api/admin/vbl-diagnose',
    recht: 'systeem.beheren',
    doe: vblDiagnose,
  },

  // Ploegen beheren. De synchronisatie is standaard een droogloop; uitvoeren
  // vraagt ?uitvoeren=1.
  { methode: 'GET', pad: '/api/admin/teams', recht: 'systeem.beheren', doe: teamsLijst },
  { methode: 'POST', pad: '/api/admin/teams/sync', recht: 'systeem.beheren', doe: teamsSync },
  { methode: 'POST', pad: '/api/admin/teams/gevolgd', recht: 'systeem.beheren', doe: teamGevolgd },

  // Spelers en staf van de gevolgde ploegen. Ook hier: standaard een droogloop.
  { methode: 'POST', pad: '/api/admin/leden/sync', recht: 'personen.beheren', doe: ledenSync },

  // Bekijken. De spelerslijst mag wie de ploeg begeleidt zien; of adres en
  // geboortedatum meekomen, beslist de route zelf — dat bepaalt niet óf je
  // binnen mag maar hoeveel je te zien krijgt.
  {
    methode: 'GET',
    pad: '/api/admin/team-leden',
    recht: 'team.spelers.bekijken',
    team: (request) => new URL(request.url).searchParams.get('team'),
    doe: teamLeden,
  },
  { methode: 'GET', pad: '/api/admin/personen', recht: 'personen.beheren', doe: personenZoeken },

  // Eén persoon bekijken en aanpassen. Wat de bond levert, is zichtbaar maar
  // niet aanpasbaar; wat de club wijzigt, krijgt bron 'club'.
  { methode: 'GET', pad: '/api/admin/persoon', recht: 'personen.beheren', doe: persoonTonen },
  { methode: 'POST', pad: '/api/admin/persoon', recht: 'personen.beheren', doe: persoonBewaren },
  { methode: 'POST', pad: '/api/admin/persoon/actief', recht: 'personen.beheren', doe: persoonActief },
  { methode: 'POST', pad: '/api/admin/persoon/team-koppelen', recht: 'personen.beheren', doe: teamKoppelen },
  { methode: 'POST', pad: '/api/admin/persoon/team-ontkoppelen', recht: 'personen.beheren', doe: teamOntkoppelen },
  { methode: 'POST', pad: '/api/admin/persoon/rol-koppelen', recht: 'personen.beheren', doe: rolKoppelen },
  { methode: 'POST', pad: '/api/admin/persoon/rol-ontkoppelen', recht: 'personen.beheren', doe: rolOntkoppelen },
  { methode: 'POST', pad: '/api/admin/persoon/ouder-koppelen', recht: 'personen.beheren', doe: ouderKoppelen },
  { methode: 'POST', pad: '/api/admin/persoon/ouder-ontkoppelen', recht: 'personen.beheren', doe: ouderOntkoppelen },

  { methode: 'GET', pad: '/api/admin/instellingen', recht: 'systeem.beheren', doe: instellingenTonen },
  { methode: 'POST', pad: '/api/admin/instellingen', recht: 'systeem.beheren', doe: instellingBewaren },
  { methode: 'GET', pad: '/api/admin/backup', recht: 'systeem.beheren', doe: backupExporteren },

  // Zalen: clubbrede infrastructuur, dus enkel wie het systeem beheert.
  { methode: 'GET', pad: '/api/admin/zalen', recht: 'systeem.beheren', doe: zalenTonen },
  { methode: 'POST', pad: '/api/admin/zalen', recht: 'systeem.beheren', doe: zaalAanmaken },
  { methode: 'POST', pad: '/api/admin/zalen/blok', recht: 'systeem.beheren', doe: blokAanmaken },
  { methode: 'POST', pad: '/api/admin/zalen/blok/verwijderen', recht: 'systeem.beheren', doe: blokVerwijderen },
  { methode: 'GET', pad: '/api/admin/zalen/vrij', recht: 'systeem.beheren', doe: vrijeBlokken },
  // Sluitingen mag ook een coördinator melden.
  { methode: 'POST', pad: '/api/admin/zalen/sluiting', recht: 'team.configureren', doe: sluitingAanmaken },
  { methode: 'POST', pad: '/api/admin/zalen/feestdagen', recht: 'systeem.beheren', doe: zetOpenOpFeestdagen },

  // Trainingsreeksen: bekijken op de eigen ploeg, aanmaken enkel op club- of
  // coördinatieniveau — anders ontstaat er een race om de goede zaaluren.
  {
    methode: 'GET',
    pad: '/api/admin/trainingsreeksen',
    recht: 'team.configureren',
    team: (request) => new URL(request.url).searchParams.get('team'),
    doe: reeksenTonen,
  },
  { methode: 'POST', pad: '/api/admin/trainingsreeksen', recht: 'systeem.beheren', doe: reeksAanmaken },
  { methode: 'POST', pad: '/api/admin/trainingsreeksen/stoppen', recht: 'systeem.beheren', doe: reeksStoppen },
  {
    methode: 'POST',
    pad: '/api/admin/trainingsreeksen/genereren',
    recht: 'systeem.beheren',
    doe: reeksGenereren,
  },
  // Geen route.recht: trainingenTonen controleert zelf, want het gaat om
  // team.aanwezigheid.bekijken en niet om team.configureren zoals de reeksen.
  { methode: 'GET', pad: '/api/admin/trainingen', doe: trainingenTonen },

  { methode: 'GET', pad: '/api/admin/periodes', recht: 'systeem.beheren', doe: periodesTonen },
  { methode: 'POST', pad: '/api/admin/periodes', recht: 'systeem.beheren', doe: periodeAanmaken },
  { methode: 'POST', pad: '/api/admin/periodes/verwijderen', recht: 'systeem.beheren', doe: periodeVerwijderen },
  { methode: 'POST', pad: '/api/admin/periodes/sync', recht: 'systeem.beheren', doe: vakantiesSync },
  { methode: 'POST', pad: '/api/admin/periodes/feestdagen-sync', recht: 'systeem.beheren', doe: feestdagenSync },

  // Wedstrijden: bekijken op de eigen ploeg, synchroniseren enkel voor wie het
  // systeem beheert.
  {
    methode: 'GET',
    pad: '/api/admin/wedstrijden',
    recht: 'team.bekijken',
    team: (request) => new URL(request.url).searchParams.get('team'),
    doe: wedstrijdenTonen,
  },
  { methode: 'POST', pad: '/api/admin/wedstrijden/sync', recht: 'systeem.beheren', doe: wedstrijdenSync },

  // Het sjabloon voor wat de bond niet levert: e-mail, telefoon, adres, ouders.
  // Enkel wie personen mag beheren; het aanmaken van ouders die dit oplevert,
  // hoort bij hetzelfde recht als het aanpassen van een persoon zelf.
  { methode: 'GET', pad: '/api/admin/sjabloon', recht: 'personen.beheren', doe: sjabloonExporteren },
  { methode: 'POST', pad: '/api/admin/sjabloon', recht: 'personen.beheren', doe: sjabloonImporteren },

  // Zaaluren-sjabloon: hetzelfde recht als het aanmaken van een zaal.
  { methode: 'GET', pad: '/api/admin/zalen/sjabloon', recht: 'systeem.beheren', doe: zaalsjabloonExporteren },
  { methode: 'POST', pad: '/api/admin/zalen/sjabloon', recht: 'systeem.beheren', doe: zaalsjabloonImporteren },

  // Trainingsuren-sjabloon: hetzelfde recht als het aanmaken van een reeks.
  { methode: 'GET', pad: '/api/admin/trainingsreeksen/sjabloon', recht: 'systeem.beheren', doe: reeksensjabloonExporteren },
  { methode: 'POST', pad: '/api/admin/trainingsreeksen/sjabloon', recht: 'systeem.beheren', doe: reeksensjabloonImporteren },

  // Aanwezigheid beheren. Ook hier geen route.recht: het team wordt afgeleid
  // uit de opgevraagde activiteit, wat een databankoproep vraagt vóór de
  // rechtencontrole kan gebeuren — de routes doen dit zelf, met dezelfde
  // rechten.mag() die de rest van de app gebruikt.
  { methode: 'GET', pad: '/api/admin/aanwezigheid', doe: aanwezigheidTonen },
  { methode: 'POST', pad: '/api/admin/aanwezigheid/vaststellen', doe: vaststellen },
  { methode: 'POST', pad: '/api/admin/aanwezigheid/uitsluiten', doe: uitsluiten },
  { methode: 'POST', pad: '/api/admin/selectie', doe: selectieZetten },
  { methode: 'POST', pad: '/api/admin/selectie/publiceren', doe: selectiePubliceren },
  { methode: 'GET', pad: '/api/admin/wedstrijdtaken', doe: wedstrijdtakenTonen },
  { methode: 'GET', pad: '/api/admin/wedstrijdtaken/kandidaten', doe: taakKandidaten },
  { methode: 'POST', pad: '/api/admin/wedstrijdtaken/toewijzen', doe: wedstrijdtaakToewijzen },
  { methode: 'POST', pad: '/api/admin/wedstrijdtaken/probleem', doe: wedstrijdtaakProbleemMelden },

  // Clubkleur en logo: enkel een voorstel, nooit rechtstreeks bewaard.
  { methode: 'GET', pad: '/api/admin/branding-voorstel', recht: 'systeem.beheren', doe: brandingVoorstel },
];

/** Het adres waarheen yoassist.org doorverwijst, of null als het verzoek hier blijft. */
export function doorverwijzingVoor(url) {
  const host = url.hostname.toLowerCase();
  if (host !== 'yoassist.org' && host !== 'www.yoassist.org') return null;
  if (url.pathname.startsWith('/api/kalender/') || url.pathname.startsWith('/api/extern/')) return null;
  return `https://teamassist.clubassist.org${url.pathname}${url.search}`;
}

function zoekRoute(methode, pad) {
  return ROUTES.find((r) => r.methode === methode && (r.prefix ? pad.startsWith(r.pad) : r.pad === pad)) ?? null;
}

async function bouwContext(request, env, route) {
  const token = tokenUitVerzoek(request);
  if (!token) return { fout: fout(401, 'aanmelden vereist') };

  let identiteit;
  try {
    identiteit = await verifieerToken(token, env);
  } catch (e) {
    // Waarom het token niet deugt, hoort niet naar buiten: dat helpt enkel wie
    // aan het proberen is. Het staat wel in het logboek.
    await logSchrijf(env.DB, { soort: 'fout', wat: 'token geweigerd', details: String(e.message) });
    return { fout: fout(401, 'aanmelden vereist') };
  }

  const gevonden = await identiteitVoor(env.DB, identiteit);
  if (gevonden.status !== 'ok') {
    return {
      fout: fout(403, 'nog geen toegang', {
        reden: 'onbekend',
        email: gevonden.email,
      }),
    };
  }

  const seizoen = await seizoenUitVerzoek(env.DB, new URL(request.url));
  if (!seizoen) return { fout: fout(409, 'er is geen actief seizoen ingesteld') };

  let rechten = await rechtenVoor(env.DB, gevonden.persoon.id, seizoen.code);

  // De testrol. Drie voorwaarden, en alle drie moeten ze kloppen: de instelling
  // staat aan, de persoon is werkelijk beheerder, en er is een rol gevraagd.
  // De uitkomst is altijd de doorsnede met wat hij echt mag — de schakelaar kan
  // daardoor enkel wegnemen.
  const gevraagdeRol = request.headers.get('x-teamassist-rol');
  if (gevraagdeRol) {
    const toegelaten = await instellingLezen(env.DB, 'testrol_toegelaten', '0');
    if (magTestrolGebruiken(rechten, toegelaten, gevraagdeRol)) {
      rechten = beperkTot(rechten, gevraagdeRol, request.headers.get('x-teamassist-team'));
    }
  }

  // Een route die een recht vraagt, wordt hier gecontroleerd en nergens anders.
  // De frontend verbergt knoppen voor het gemak; dit weigert de actie.
  if (route.recht && !rechten.mag(route.recht, route.team ? route.team(request) : null)) {
    return { fout: fout(403, 'geen recht op deze actie') };
  }

  return { ctx: { db: env.DB, env, request, persoon: gevonden.persoon, rechten, seizoen } };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // yoassist.org stuurt door naar de app (I1, Domein), behalve de agendafeed
    // en de externe API: een agenda-abonnement staat al in iemands agenda, en
    // niet elke agenda-app volgt een doorverwijzing.
    const doorverwijzing = doorverwijzingVoor(url);
    if (doorverwijzing) return Response.redirect(doorverwijzing, 301);

    if (!url.pathname.startsWith('/api/')) {
      // Alles wat geen API is, is een statisch bestand.
      return env.ASSETS.fetch(request);
    }

    const route = zoekRoute(request.method, url.pathname);
    if (!route) return fout(404, 'onbekende route');

    try {
      if (route.publiek) return await route.doe({ db: env.DB, env, request });

      const uitkomst = await bouwContext(request, env, route);
      if (uitkomst.fout) return uitkomst.fout;
      return await route.doe(uitkomst.ctx);
    } catch (e) {
      await logSchrijf(env.DB, {
        soort: 'fout',
        wat: `onverwachte fout op ${url.pathname}`,
        details: String(e && e.stack ? e.stack : e),
      });
      return fout(500, 'er ging iets mis');
    }
  },

  // De woensdaglijst van de bond komt per mail binnen (Cloudflare Email
  // Routing, 0.34.0). Nooit gooien en nooit weigeren: een geweigerde mail
  // kaatst terug naar de bond of naar Gmail.
  async email(message, env) {
    try {
      const raw = await new Response(message.raw).text();
      await ontvangMail({ db: env.DB, env }, raw, { naar: message.to });
    } catch (e) {
      await logSchrijf(env.DB, {
        soort: 'fout',
        wat: 'woensdaglijst: mail niet verwerkt',
        details: `${message.from}: ${String(e?.message || e)}`,
      });
    }
  },

  // Eén cron per uur; de planner beslist wat er op dit Brusselse uur moet
  // gebeuren. Zie klok.js voor waarom het zo en niet met zeven cron-expressies.
  async scheduled(event, env, ctx) {
    const nu = new Date(event.scheduledTime);
    const uur = brusselUur(nu);
    const dag = brusselWeekdag(nu);
    const taken = takenVoorUur(uur, dag);

    if (taken.includes('ping')) {
      ctx.waitUntil(voerPingUit(env.DB, env));
    }
    const overige = taken.filter((t) => t !== 'ping');
    if (overige.length) {
      ctx.waitUntil(voerGeplandeTakenUit(overige, env.DB, env));
    }
  },
};
