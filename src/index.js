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
import { brusselUur } from './lib/klok.js';
import { voerPingUit } from './lib/ping.js';
import { logSchrijf } from './lib/logboek.js';
import { mij } from './routes/mij.js';
import { opgaveZetten, mijnOpgaven } from './routes/aanwezigheid-opgave.js';
import { aanmeldlink } from './routes/aanmeldlink.js';
import { vblDiagnose } from './routes/admin/vbl-diagnose.js';
import { teamsLijst, teamsSync, teamGevolgd } from './routes/admin/teams.js';
import { ledenSync } from './routes/admin/leden.js';
import { teamLeden, personenZoeken } from './routes/admin/bekijken.js';
import { persoonTonen, persoonBewaren, persoonActief } from './routes/admin/persoon.js';
import { instellingenTonen, instellingBewaren, instellingLezen } from './routes/admin/instellingen.js';
import {
  zalenTonen, zaalAanmaken, blokAanmaken, blokVerwijderen, vrijeBlokken, sluitingAanmaken,
} from './routes/admin/zalen.js';
import {
  reeksenTonen, reeksAanmaken, reeksStoppen, reeksGenereren, trainingenTonen,
} from './routes/admin/trainingsreeksen.js';
import { periodesTonen, periodeAanmaken, periodeVerwijderen, vakantiesSync } from './routes/admin/periodes.js';
import { wedstrijdenSync, wedstrijdenTonen } from './routes/admin/wedstrijden.js';
import { sjabloonExporteren, sjabloonImporteren } from './routes/admin/sjabloon.js';
import {
  aanwezigheidTonen, vaststellen, uitsluiten, selectieZetten, selectiePubliceren,
} from './routes/admin/aanwezigheid-beheer.js';
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

  { methode: 'GET', pad: '/api/admin/instellingen', recht: 'systeem.beheren', doe: instellingenTonen },
  { methode: 'POST', pad: '/api/admin/instellingen', recht: 'systeem.beheren', doe: instellingBewaren },

  // Zalen: clubbrede infrastructuur, dus enkel wie het systeem beheert.
  { methode: 'GET', pad: '/api/admin/zalen', recht: 'systeem.beheren', doe: zalenTonen },
  { methode: 'POST', pad: '/api/admin/zalen', recht: 'systeem.beheren', doe: zaalAanmaken },
  { methode: 'POST', pad: '/api/admin/zalen/blok', recht: 'systeem.beheren', doe: blokAanmaken },
  { methode: 'POST', pad: '/api/admin/zalen/blok/verwijderen', recht: 'systeem.beheren', doe: blokVerwijderen },
  { methode: 'GET', pad: '/api/admin/zalen/vrij', recht: 'systeem.beheren', doe: vrijeBlokken },
  // Sluitingen mag ook een coördinator melden.
  { methode: 'POST', pad: '/api/admin/zalen/sluiting', recht: 'team.configureren', doe: sluitingAanmaken },

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

  // Aanwezigheid beheren. Ook hier geen route.recht: het team wordt afgeleid
  // uit de opgevraagde activiteit, wat een databankoproep vraagt vóór de
  // rechtencontrole kan gebeuren — de routes doen dit zelf, met dezelfde
  // rechten.mag() die de rest van de app gebruikt.
  { methode: 'GET', pad: '/api/admin/aanwezigheid', doe: aanwezigheidTonen },
  { methode: 'POST', pad: '/api/admin/aanwezigheid/vaststellen', doe: vaststellen },
  { methode: 'POST', pad: '/api/admin/aanwezigheid/uitsluiten', doe: uitsluiten },
  { methode: 'POST', pad: '/api/admin/selectie', doe: selectieZetten },
  { methode: 'POST', pad: '/api/admin/selectie/publiceren', doe: selectiePubliceren },

  // Clubkleur en logo: enkel een voorstel, nooit rechtstreeks bewaard.
  { methode: 'GET', pad: '/api/admin/branding-voorstel', recht: 'systeem.beheren', doe: brandingVoorstel },
];

function zoekRoute(methode, pad) {
  return ROUTES.find((r) => r.methode === methode && r.pad === pad) ?? null;
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

  // Eén cron per uur; de planner beslist wat er op dit Brusselse uur moet
  // gebeuren. Zie klok.js voor waarom het zo en niet met zeven cron-expressies.
  async scheduled(event, env, ctx) {
    const uur = brusselUur(new Date(event.scheduledTime));

    if (uur === 4) {
      ctx.waitUntil(voerPingUit(env.DB, env));
    }
  },
};
