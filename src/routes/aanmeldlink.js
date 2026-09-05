// Een aanmeldlink aanvragen.
//
// De frontend vraagt de link niet meer rechtstreeks bij Supabase. Zou hij dat
// doen, dan kan iedereen via onze app mails laten sturen naar willekeurige
// adressen, op ons quota, en loopt de wachtrij vol met mensen die niets met de
// club te maken hebben.
//
// Deze route kijkt eerst of het adres bij een actieve persoon hoort. Alleen dan
// wordt er iets verstuurd.
//
// Het antwoord is altijd hetzelfde, of het adres nu bekend is of niet. Anders
// wordt dit een manier om uit te zoeken wie er lid is van de club — met namen
// van minderjarigen erachter.

import { json, leesJson } from '../lib/http.js';
import { logSchrijf } from '../lib/logboek.js';

// Eén link per minuut per persoon. Wie de knop twee keer aantikt omdat de mail
// niet meteen aankomt, hoort geen tweede mail te krijgen die de eerste ongeldig
// maakt.
export const WACHTTIJD_SECONDEN = 60;

const ANTWOORD = {
  boodschap:
    'Is dat adres bij ons bekend, dan is er een link onderweg. ' +
    'Ze blijft een uur geldig.',
};

export function normaliseerEmail(waarde) {
  return String(waarde ?? '').trim().toLowerCase();
}

/** Vraagt de link aan bij Supabase. Faalt luid; de route vangt dat op. */
export async function vraagLinkAan(env, email, herkomst, fetcher = fetch) {
  const basis = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  // redirect_to hoort als queryparameter mee; in de body wordt het genegeerd en
  // valt Supabase terug op de Site URL van het project.
  const url = `${basis}/auth/v1/otp?redirect_to=${encodeURIComponent(herkomst)}`;
  const antwoord = await fetcher(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!antwoord.ok) {
    throw new Error(`supabase gaf status ${antwoord.status}`);
  }
}

export async function aanmeldlink(ctx) {
  const { db, env, request } = ctx;
  const body = await leesJson(request);
  const email = normaliseerEmail(body?.email);

  // Een adres zonder apenstaartje is geen adres. Hier stoppen scheelt een
  // nutteloze oproep naar Supabase.
  if (!email || !email.includes('@')) return json(ANTWOORD);

  const persoon = await db
    .prepare(
      `SELECT id, laatste_aanmeldlink FROM personen
        WHERE email = ? AND actief = 1`
    )
    .bind(email)
    .first();

  if (!persoon) {
    // Het adres bewust niet meelogboeken: dat zou gegevens bijhouden van mensen
    // die niets met de club te maken hebben. Het signaal volstaat.
    await logSchrijf(db, { soort: 'aanmelding', wat: 'aanvraag voor een onbekend adres' });
    return json(ANTWOORD);
  }

  const teVroeg = await db
    .prepare(
      `SELECT 1 AS ja FROM personen
        WHERE id = ?
          AND laatste_aanmeldlink IS NOT NULL
          AND laatste_aanmeldlink > datetime('now', ?)`
    )
    .bind(persoon.id, `-${WACHTTIJD_SECONDEN} seconds`)
    .first();

  if (teVroeg) {
    // Hetzelfde antwoord als anders. Zeggen dat er net al een link vertrok,
    // verklapt dat het adres bestaat.
    return json(ANTWOORD);
  }

  try {
    await vraagLinkAan(env, email, new URL(request.url).origin);
    await db
      .prepare(`UPDATE personen SET laatste_aanmeldlink = datetime('now') WHERE id = ?`)
      .bind(persoon.id)
      .run();
    await logSchrijf(db, { soort: 'aanmelding', wie: persoon.id, wat: 'aanmeldlink verstuurd' });
  } catch (e) {
    // Naar buiten blijft het antwoord gelijk: dat er iets misging bij Supabase,
    // zegt niets over dit adres en hoort niet als hint te dienen.
    await logSchrijf(db, {
      soort: 'fout',
      wie: persoon.id,
      wat: 'aanmeldlink niet verstuurd',
      details: String(e.message || e),
      afgehandeld: 0,
    });
  }

  return json(ANTWOORD);
}
