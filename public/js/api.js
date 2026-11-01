// Praten met de eigen API, en met Supabase Auth.
//
// Alles loopt hier langs, zodat het vernieuwen van een verlopen token op één
// plaats staat. Een kale fetch elders levert stille 401's op: een token is maar
// enkele minuten tot een uur geldig, en dan lijkt een knop het niet te doen.
//
// Sinds 0.39.2 (T20) staat het verversingstoken in een HttpOnly-cookie die de
// Worker zet, en het toegangstoken enkel in het geheugen van deze pagina. Bij
// het openen haalt de pagina een nieuw toegangstoken bij /api/sessie/vernieuw.

// Waar de sessie tot 0.39.1 stond. Enkel nog gelezen om ze één keer naar de
// cookie over te zetten, zodat niemand door de overstap opnieuw moet aanmelden.
const OUDE_OPSLAG = 'teamassist.sessie';
const TESTROL = 'teamassist.testrol';

export let config = null;

export async function haalConfig() {
  const antwoord = await fetch('/api/config');
  config = await antwoord.json();
  return config;
}

let toegang = null;
let lopend = null;

async function sessieOproep(stap, body) {
  return fetch(`/api/sessie/${stap}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(toegang ? { authorization: `Bearer ${toegang}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
}

/** 'ok', 'weg' (opnieuw aanmelden) of 'storing' (de sessie blijft). */
async function alsUitkomst(antwoord) {
  if (antwoord.ok) {
    toegang = (await antwoord.json()).access_token;
    return 'ok';
  }
  if (antwoord.status === 401) {
    toegang = null;
    return 'weg';
  }
  return 'storing';
}

/**
 * Een nieuw toegangstoken uit de cookie. Nooit twee tegelijk: twee
 * verversingen met hetzelfde token kunnen de sessie bij Supabase laten
 * intrekken (T20). Wie vraagt terwijl er een loopt, wacht op die.
 */
export function vernieuw() {
  if (!lopend) {
    lopend = (async () => {
      try {
        return await alsUitkomst(await sessieOproep('vernieuw'));
      } catch {
        return 'storing';
      } finally {
        lopend = null;
      }
    })();
  }
  return lopend;
}

/** Na de link of de code: de Worker zet de cookie. */
export async function startSessie(verversToken) {
  try {
    return await alsUitkomst(await sessieOproep('start', { refresh_token: verversToken }));
  } catch {
    return 'storing';
  }
}

function oudeSessie() {
  try {
    return JSON.parse(localStorage.getItem(OUDE_OPSLAG) || 'null');
  } catch {
    return null;
  }
}

function wisOudeSessie() {
  try {
    localStorage.removeItem(OUDE_OPSLAG);
  } catch {
    // Geen opslag, dan valt er ook niets te wissen.
  }
}

/** Bij het openen van de app: de cookie, en anders eenmalig de oude opslag. */
export async function herneemSessie() {
  const uitkomst = await vernieuw();
  if (uitkomst !== 'weg') return uitkomst;
  const oud = oudeSessie();
  if (!oud?.refresh_token) return 'weg';
  const overgezet = await startSessie(oud.refresh_token);
  // Bij een storing blijft ze staan, voor een volgende poging.
  if (overgezet !== 'storing') wisOudeSessie();
  return overgezet;
}

export async function afmelden() {
  try {
    await sessieOproep('stop');
  } catch {
    // De cookie gaat dan bij de volgende 401 weg; het toegangstoken nu al.
  }
  toegang = null;
  wisOudeSessie();
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

const STORING = { status: 503, fout: 'het aanmeldsysteem is even niet bereikbaar' };

/**
 * Voert het verzoek uit en vernieuwt eenmalig het token bij een 401. Geeft
 * het antwoord, of 'weg' / 'storing' als er geen bruikbaar token kwam.
 */
async function voerUit(pad, optiesVoorToken) {
  if (!toegang) {
    const uitkomst = await vernieuw();
    if (uitkomst !== 'ok') return uitkomst;
  }
  let antwoord = await fetch(pad, optiesVoorToken(toegang));
  if (antwoord.status === 401) {
    const uitkomst = await vernieuw();
    if (uitkomst !== 'ok') return uitkomst;
    antwoord = await fetch(pad, optiesVoorToken(toegang));
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
  if (antwoord === 'weg') return { status: 401 };
  if (antwoord === 'storing') return { status: STORING.status, body: { fout: STORING.fout } };
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
  if (antwoord === 'weg') return { status: 401, tekst: '' };
  if (antwoord === 'storing') return { status: STORING.status, tekst: STORING.fout };
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
 * Bevestigt de zescijferige code uit de mail rechtstreeks bij Supabase, in
 * plaats van op de link te klikken.
 *
 * Nodig op een iPhone waar de app op het beginscherm staat: die 'app' is een
 * eigen browseromgeving die geen opslag deelt met Safari. Klik je op de link,
 * dan meldt Safari zich aan — de app op het beginscherm ziet daar niets van
 * en blijft op het aanmeldscherm staan. Een code intypen blijft wél volledig
 * binnen diezelfde omgeving: geen tweede browser, dus geen probleem.
 *
 * Dit gaat wél rechtstreeks naar Supabase, niet via de eigen route zoals
 * vraagAanmeldlink — de reden om die laatste af te schermen (misbruik om mails
 * te laten versturen naar willekeurige adressen) speelt hier niet: er wordt
 * niets meer verstuurd, enkel een code geverifieerd die al vertrokken is, en
 * Supabase begrenst zelf hoe vaak een code fout geraden mag worden.
 */
export async function verifieerCode(email, code) {
  if (!config?.supabase_url || !config?.supabase_publishable_key) {
    throw new Error('het aanmeldsysteem is niet ingesteld');
  }
  const basis = String(config.supabase_url).replace(/\/+$/, '');
  const antwoord = await fetch(`${basis}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: config.supabase_publishable_key },
    body: JSON.stringify({ email, token: code, type: 'email' }),
  });
  const body = await antwoord.json().catch(() => null);
  if (!antwoord.ok || !body?.access_token) {
    throw new Error(body?.error_description || body?.msg || `status ${antwoord.status}`);
  }
  return { access_token: body.access_token, refresh_token: body.refresh_token };
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
