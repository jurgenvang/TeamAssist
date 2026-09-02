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

export async function api(pad, methode = 'GET', body = null) {
  let s = sessie();
  if (!s) return { status: 401 };

  const rol = testrol();
  const opties = (token) => ({
    method: methode,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
      // De gekozen rol gaat in een kop mee. De backend versmalt daarmee de
      // rechten; verbreden kan ze niet.
      ...(rol ? { 'x-teamassist-rol': rol.rol } : {}),
      ...(rol?.team ? { 'x-teamassist-team': rol.team } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let antwoord = await fetch(pad, opties(s.access_token));
  if (antwoord.status === 401 && s.refresh_token) {
    const nieuw = await vernieuwToken(s);
    if (nieuw) {
      bewaarSessie(nieuw);
      antwoord = await fetch(pad, opties(nieuw.access_token));
    }
  }
  return { status: antwoord.status, body: await antwoord.json().catch(() => null) };
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
