// De sessie: het verversingstoken in een cookie die de Worker zelf zet (T20).
//
// Waarom niet in de browseropslag, zoals tot 0.39.1: Safari wist wat een
// pagina zelf bewaart na zeven dagen zonder bezoek, en een script in de pagina
// kan het daar lezen. Een HttpOnly-cookie die de server zet, valt onder geen
// van beide. Het toegangstoken (een uur geldig) blijft in het geheugen van de
// pagina; dit verversingstoken haalt telkens een nieuw.
//
// Deze routes zijn publiek: ze zijn de aanmelding zelf. SameSite=Strict houdt
// de cookie weg bij een verzoek vanaf een andere site, en zonder CORS kan zo'n
// site het antwoord toch niet lezen.

import { json, fout, leesJson } from '../lib/http.js';

export const COOKIE = 'ta_sessie';
const PAD = '/api/sessie/';
// De grens die Chrome aan een cookie oplegt; bij elke verversing begint ze
// opnieuw, dus enkel wie zo lang niet langskwam, moet opnieuw aanmelden.
const MAX_LEEFTIJD = 400 * 24 * 60 * 60;

export function sessieCookie(waarde) {
  const basis = `Path=${PAD}; HttpOnly; Secure; SameSite=Strict`;
  if (!waarde) return `${COOKIE}=; ${basis}; Max-Age=0`;
  return `${COOKIE}=${encodeURIComponent(waarde)}; ${basis}; Max-Age=${MAX_LEEFTIJD}`;
}

export function leesCookie(request) {
  for (const deel of (request.headers.get('cookie') || '').split(';')) {
    const i = deel.indexOf('=');
    if (i < 0 || deel.slice(0, i).trim() !== COOKIE) continue;
    const waarde = deel.slice(i + 1).trim();
    try {
      return decodeURIComponent(waarde) || null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Ververst bij Supabase. Het onderscheid tussen 'ongeldig' en 'storing' is de
 * kern: enkel wanneer Supabase zelf zegt dat het token niet meer geldt, gaat
 * de sessie weg. Tot 0.39.1 wiste elke hapering (een 5xx, een gepauzeerd
 * project) de sessie, en moest iemand opnieuw een link vragen.
 */
export async function ververs(env, verversToken, fetcher = fetch) {
  const basis = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  let antwoord;
  try {
    antwoord = await fetcher(`${basis}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: env.SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ refresh_token: verversToken }),
    });
  } catch {
    return { soort: 'storing' };
  }
  if (antwoord.status === 400 || antwoord.status === 401) return { soort: 'ongeldig' };
  if (!antwoord.ok) return { soort: 'storing' };
  const body = await antwoord.json().catch(() => null);
  if (!body?.access_token || !body?.refresh_token) return { soort: 'storing' };
  return { soort: 'ok', access_token: body.access_token, refresh_token: body.refresh_token };
}

function alsAntwoord(uitkomst) {
  if (uitkomst.soort === 'ok') {
    return json({ access_token: uitkomst.access_token }, 200, {
      'set-cookie': sessieCookie(uitkomst.refresh_token),
      'cache-control': 'no-store',
    });
  }
  if (uitkomst.soort === 'ongeldig') {
    return json({ fout: 'opnieuw aanmelden' }, 401, { 'set-cookie': sessieCookie(null) });
  }
  // De cookie blijft: het token deugt misschien nog, het aanmeldsysteem
  // antwoordde enkel niet.
  return fout(503, 'het aanmeldsysteem is even niet bereikbaar');
}

/**
 * Na de link of de code. Ververst meteen in plaats van het meegegeven token
 * te bewaren: het stond in een URL of ging door een script, en is daarna niet
 * meer bruikbaar.
 */
export async function sessieStarten({ request, env }) {
  const body = await leesJson(request);
  const token = typeof body?.refresh_token === 'string' ? body.refresh_token : '';
  if (!token) return fout(400, 'refresh_token ontbreekt');
  return alsAntwoord(await ververs(env, token));
}

export async function sessieVernieuwen({ request, env }) {
  const token = leesCookie(request);
  if (!token) return fout(401, 'niet aangemeld');
  return alsAntwoord(await ververs(env, token));
}

/** Afmelden. De cookie gaat altijd weg, ook als Supabase niet antwoordt. */
export async function sessieStoppen({ request, env }, fetcher = fetch) {
  const kop = request.headers.get('authorization');
  if (kop?.startsWith('Bearer ')) {
    const basis = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
    try {
      await fetcher(`${basis}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: kop },
      });
    } catch {
      // Afmelden bij Supabase is mooi meegenomen; zonder cookie is de sessie
      // in deze browser hoe dan ook voorbij.
    }
  }
  return json({ ok: true }, 200, { 'set-cookie': sessieCookie(null) });
}
