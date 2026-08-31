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
import { seizoenUitVerzoek } from './lib/seizoen.js';
import { brusselUur } from './lib/klok.js';
import { voerPingUit } from './lib/ping.js';
import { logSchrijf } from './lib/logboek.js';
import { mij } from './routes/mij.js';
import { aanmeldlink } from './routes/aanmeldlink.js';
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

  // Publiek, want wie een link vraagt is per definitie nog niet aangemeld. De
  // route verstuurt enkel iets naar een adres dat bij een actieve persoon hoort,
  // en antwoordt altijd hetzelfde zodat ze niet te gebruiken is om uit te zoeken
  // wie er lid is.
  { methode: 'POST', pad: '/api/aanmeldlink', publiek: true, doe: aanmeldlink },

  { methode: 'GET', pad: '/api/mij', doe: mij },
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

  const rechten = await rechtenVoor(env.DB, gevonden.persoon.id, seizoen.code);

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
