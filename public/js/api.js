// Praten met de eigen API, en met Supabase Auth.
//
// Alles loopt hier langs, zodat het vernieuwen van een verlopen token op één
// plaats staat. Een kale fetch elders levert stille 401's op: een token is maar
// enkele minuten tot een uur geldig, en dan lijkt een knop het niet te doen.

const OPSLAG = 'teamassist.sessie';
const TESTROL = 'teamassist.testrol';

export let config = null;

export async function haalConfig() {
  const antwoord = await fetch('/api/config');
  config = await antwoord.json();
  return config;
}

export function sessie() {
  try {
    return JSON.parse(localStorage.getItem(OPSLAG) || 'null');
  } catch {
    return null;
  }
}

export function bewaarSessie(s) {
  if (s) localStorage.setItem(OPSLAG, JSON.stringify(s));
  else localStorage.removeItem(OPSLAG);
}

/** De rol waarmee een beheerder wil kijken, of null. */
export function testrol() {
  try {
    return JSON.parse(localStorage.getItem(TESTROL) || 'null');
  } catch {
    return null;
  }
}

export function bewaarTestrol(keuze) {
  if (keuze) localStorage.setItem(TESTROL, JSON.stringify(keuze));
  else localStorage.removeItem(TESTROL);
}

async function vernieuwToken(huidige) {
  const antwoord = await fetch(`${config.supabase_url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: config.supabase_publishable_key },
    body: JSON.stringify({ refresh_token: huidige.refresh_token }),
  });
  if (!antwoord.ok) return null;
  const body = await antwoord.json();
  return { access_token: body.access_token, refresh_token: body.refresh_token };
}

function kopHeaders(token, extra = {}) {
  const rol = testrol();
  return {
    authorization: `Bearer ${token}`,
    // De gekozen rol gaat in een kop mee. De backend versmalt daarmee de
    // rechten; verbreden kan ze niet.
    ...(rol ? { 'x-teamassist-rol': rol.rol } : {}),
    ...(rol?.team ? { 'x-teamassist-team': rol.team } : {}),
    ...extra,
  };
}

/** Voert het verzoek uit en vernieuwt eenmalig het token bij een 401. */
async function voerUit(pad, optiesVoorToken) {
  let s = sessie();
  if (!s) return null;

  let antwoord = await fetch(pad, optiesVoorToken(s.access_token));
  if (antwoord.status === 401 && s.refresh_token) {
    const nieuw = await vernieuwToken(s);
    if (nieuw) {
      bewaarSessie(nieuw);
      antwoord = await fetch(pad, optiesVoorToken(nieuw.access_token));
    }
  }
  return antwoord;
}

export async function api(pad, methode = 'GET', body = null) {
  const opties = (token) => ({
    method: methode,
    headers: kopHeaders(token, body ? { 'content-type': 'application/json' } : {}),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const antwoord = await voerUit(pad, opties);
  if (!antwoord) return { status: 401 };
  return { status: antwoord.status, body: await antwoord.json().catch(() => null) };
}

/**
 * Zoals api(), maar met platte tekst in plaats van JSON — voor het CSV-
 * sjabloon. Een eigen functie in plaats van api() overladen: JSON.stringify()
 * op een CSV-string zou de aanhalingstekens verdubbelen en het bestand
 * onbruikbaar maken.
 */
export async function apiRuw(pad, methode, lichaam, contentType) {
  const opties = (token) => ({
    method: methode,
    headers: kopHeaders(token, lichaam !== undefined ? { 'content-type': contentType } : {}),
    ...(lichaam !== undefined ? { body: lichaam } : {}),
  });

  const antwoord = await voerUit(pad, opties);
  if (!antwoord) return { status: 401 };
  return { status: antwoord.status, tekst: await antwoord.text().catch(() => '') };
}

/** Vraagt een aanmeldlink via de eigen route, niet rechtstreeks bij Supabase. */
export async function vraagAanmeldlink(email) {
  const antwoord = await fetch('/api/aanmeldlink', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const body = await antwoord.json().catch(() => null);
  if (!antwoord.ok) throw new Error(`status ${antwoord.status}`);
  return body?.boodschap ?? '';
}

/**
 * De huisstijl van de club: publiek, want het aanmeldscherm mag de clubkleur
 * en het logo al tonen vóór iemand een token heeft. Staat hier en niet in
 * huisstijl.js, om dezelfde reden als vraagAanmeldlink: elke publieke
 * pre-aanmeld-oproep hoort op één plaats te staan.
 */
export async function haalBranding() {
  const antwoord = await fetch('/api/branding');
  return antwoord.json();
}

/**
 * Leest de tokens uit het fragment na het klikken op een aanmeldlink, en haalt
 * ze daar meteen weg zodat ze niet in de geschiedenis blijven staan.
 */
export function leesTokensUitUrl() {
  if (!location.hash) return null;
  const p = new URLSearchParams(location.hash.slice(1));

  const fout = p.get('error_description') || p.get('error');
  if (fout) {
    history.replaceState(null, '', location.pathname + location.search);
    return { fout: decodeURIComponent(fout.replace(/\+/g, ' ')) };
  }

  if (!p.get('access_token')) return null;
  const uit = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token') };
  history.replaceState(null, '', location.pathname + location.search);
  return uit;
}
