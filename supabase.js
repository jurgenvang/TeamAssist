// Verifieert het toegangstoken dat Supabase Auth uitgeeft.
//
// Twee vormen komen voor. Oudere projecten ondertekenen met een gedeeld geheim
// (HS256), nieuwere met een sleutelpaar waarvan de publieke helft op te halen
// valt (RS256 of ES256). Beide worden ondersteund: welke van de twee, hangt af
// van of SUPABASE_JWT_SECRET bij de Worker staat.
//
// Wat hier nooit mag gebeuren: een token vertrouwen zonder de handtekening te
// controleren. De `alg` uit de header van het token bepaalt daarom niet welke
// weg gekozen wordt — de configuratie doet dat.

// Supabase publiceert de publieke sleutels op twee plaatsen, afhankelijk van de
// leeftijd van het project. Beide proberen kost bij de eerste oproep hoogstens
// een mislukte fetch, en spaart een storing waarvan de oorzaak niet te raden is.
const JWKS_PADEN = ['/auth/v1/.well-known/jwks.json', '/auth/v1/jwks'];

// De sleutels veranderen zelden en het ophalen kost een netwerkoproep per
// verzoek als het niet bewaard wordt. Deze cache leeft zolang de Worker-instantie
// leeft, wat kort genoeg is om een sleutelwissel vanzelf op te vangen.
let jwksCache = { url: null, sleutels: null, opgehaald: 0 };
const JWKS_GELDIG_MS = 10 * 60 * 1000;

export function decodeerBase64Url(tekst) {
  const gevuld = tekst.replace(/-/g, '+').replace(/_/g, '/');
  const rest = gevuld.length % 4;
  const volledig = rest ? gevuld + '='.repeat(4 - rest) : gevuld;
  const ruw = atob(volledig);
  const uit = new Uint8Array(ruw.length);
  for (let i = 0; i < ruw.length; i++) uit[i] = ruw.charCodeAt(i);
  return uit;
}

function leesDeel(tekst) {
  return JSON.parse(new TextDecoder().decode(decodeerBase64Url(tekst)));
}

/** Splitst een JWT zonder iets te vertrouwen. Gooit bij een ongeldige vorm. */
export function ontleedToken(token) {
  const delen = String(token || '').split('.');
  if (delen.length !== 3) throw new Error('token heeft geen drie delen');
  return {
    header: leesDeel(delen[0]),
    payload: leesDeel(delen[1]),
    handtekening: decodeerBase64Url(delen[2]),
    ondertekend: new TextEncoder().encode(`${delen[0]}.${delen[1]}`),
  };
}

async function haalJwks(projectUrl, fetcher = fetch, jwksUrl = null) {
  // Staat de URL expliciet ingesteld, dan is er niets te raden. Dat is de
  // voorkeur: het dashboard toont ze, en het scheelt een mislukte oproep bij
  // elke koude start van de Worker.
  if (jwksUrl) return haalVanUrl(jwksUrl, jwksUrl, fetcher);

  const basis = String(projectUrl || '').replace(/\/+$/, '');
  const vers = Date.now() - jwksCache.opgehaald < JWKS_GELDIG_MS;
  if (jwksCache.url === basis && jwksCache.sleutels && vers) return jwksCache.sleutels;

  let laatsteFout = null;
  for (const pad of JWKS_PADEN) {
    try {
      return await haalVanUrl(`${basis}${pad}`, basis, fetcher);
    } catch (e) {
      laatsteFout = e;
    }
  }
  throw laatsteFout ?? new Error('jwks niet op te halen');
}

async function haalVanUrl(url, cachesleutel, fetcher) {
  const antwoord = await fetcher(url);
  if (!antwoord.ok) throw new Error(`jwks niet op te halen (${antwoord.status})`);
  const body = await antwoord.json();
  const sleutels = body.keys ?? [];
  // Een leeg antwoord komt voor bij een project dat nog met een gedeeld geheim
  // ondertekent. Dat is geen bruikbare sleutelverzameling, en stil doorgaan zou
  // elk token laten stranden op 'geen passende sleutel'.
  if (!sleutels.length) throw new Error('jwks bevat geen sleutels');
  jwksCache = { url: cachesleutel, sleutels, opgehaald: Date.now() };
  return sleutels;
}

function algoritmeVan(jwk) {
  if (jwk.kty === 'RSA') {
    return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  }
  if (jwk.kty === 'EC') {
    return { name: 'ECDSA', namedCurve: jwk.crv || 'P-256', hash: 'SHA-256' };
  }
  throw new Error(`onbekend sleuteltype ${jwk.kty}`);
}

async function controleerMetJwks(ontleed, projectUrl, fetcher, jwksUrl) {
  const sleutels = await haalJwks(projectUrl, fetcher, jwksUrl);
  const jwk = sleutels.find((k) => k.kid === ontleed.header.kid) ?? sleutels[0];
  if (!jwk) throw new Error('geen passende sleutel in de jwks');

  const algo = algoritmeVan(jwk);
  const sleutel = await crypto.subtle.importKey('jwk', jwk, algo, false, ['verify']);
  const verifieerAlgo =
    algo.name === 'ECDSA' ? { name: 'ECDSA', hash: 'SHA-256' } : algo.name;
  return crypto.subtle.verify(verifieerAlgo, sleutel, ontleed.handtekening, ontleed.ondertekend);
}

async function controleerMetGeheim(ontleed, geheim) {
  const sleutel = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(geheim),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify('HMAC', sleutel, ontleed.handtekening, ontleed.ondertekend);
}

/**
 * Verifieert een token en geeft de payload terug. Gooit bij elke twijfel.
 *
 * @param {string} token
 * @param {object} env  met SUPABASE_URL en optioneel SUPABASE_JWT_SECRET
 */
export async function verifieerToken(token, env, fetcher = fetch) {
  // Eerst de configuratie, dan pas het token. Een sb_secret_-sleutel is géén
  // JWT-geheim: ze vervangt service_role en omzeilt alle beveiliging. Belandt ze
  // hier, dan is er iets in de verkeerde secret geplakt, en dat hoort luid te
  // falen in plaats van stil iets anders te doen.
  if (String(env.SUPABASE_JWT_SECRET || '').startsWith('sb_secret_')) {
    throw new Error('SUPABASE_JWT_SECRET bevat een secret key, geen JWT-geheim');
  }

  const ontleed = ontleedToken(token);

  const geldig = env.SUPABASE_JWT_SECRET
    ? await controleerMetGeheim(ontleed, env.SUPABASE_JWT_SECRET)
    : await controleerMetJwks(ontleed, env.SUPABASE_URL, fetcher, env.SUPABASE_JWKS_URL);

  if (!geldig) throw new Error('handtekening klopt niet');

  const nu = Math.floor(Date.now() / 1000);
  const p = ontleed.payload;
  if (typeof p.exp === 'number' && p.exp <= nu) throw new Error('token is vervallen');
  if (typeof p.nbf === 'number' && p.nbf > nu) throw new Error('token is nog niet geldig');
  if (!p.sub) throw new Error('token heeft geen sub');
  if (!p.email) throw new Error('token heeft geen e-mailadres');

  return { sub: p.sub, email: String(p.email).trim().toLowerCase() };
}

/** Haalt het token uit de Authorization-header. Geeft null als er geen staat. */
export function tokenUitVerzoek(request) {
  const kop = request.headers.get('authorization') || '';
  const match = kop.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
