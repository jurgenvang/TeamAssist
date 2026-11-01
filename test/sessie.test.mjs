// De sessie in een cookie van de Worker (T20, 0.39.2).
//
// Drie dingen moeten kloppen: enkel een antwoord van Supabase dat het token
// niet meer geldt, meldt iemand af (een storing niet); het verversingstoken
// komt nooit in een antwoord dat een script kan lezen; en de browser ververst
// nooit twee keer tegelijk, want dan kan Supabase de sessie intrekken.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import worker from '../src/index.js';
import {
  ververs, sessieStarten, sessieVernieuwen, sessieStoppen, leesCookie, sessieCookie, COOKIE,
} from '../src/routes/sessie.js';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'pk' };
const antwoord = (status, body) => new Response(JSON.stringify(body ?? {}), { status });

async function metFetch(nep, doe) {
  const oud = globalThis.fetch;
  globalThis.fetch = nep;
  try {
    return await doe();
  } finally {
    globalThis.fetch = oud;
  }
}

function verzoek(pad, { cookie, body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`https://teamassist.clubassist.org${pad}`, {
    method: 'POST', headers, body: JSON.stringify(body ?? {}),
  });
}

// --- verversen bij Supabase ---------------------------------------------------

test('ververs: enkel 400/401 betekent dat het token niet meer geldt', async () => {
  const nep = (status, body) => async () => antwoord(status, body);
  assert.deepEqual(await ververs(env, 'r1', nep(200, { access_token: 'a2', refresh_token: 'r2' })),
    { soort: 'ok', access_token: 'a2', refresh_token: 'r2' });
  assert.equal((await ververs(env, 'r1', nep(400, { error: 'invalid_grant' }))).soort, 'ongeldig');
  assert.equal((await ververs(env, 'r1', nep(401))).soort, 'ongeldig');
  for (const status of [429, 500, 503, 530]) {
    assert.equal((await ververs(env, 'r1', nep(status))).soort, 'storing', `status ${status}`);
  }
  assert.equal((await ververs(env, 'r1', async () => { throw new TypeError('netwerk'); })).soort, 'storing');
  assert.equal((await ververs(env, 'r1', nep(200, { access_token: 'a2' }))).soort, 'storing', 'een half antwoord');
});

test('ververs stuurt het token naar het tokenpad van Supabase', async () => {
  let gezien;
  await ververs(env, 'r1', async (url, opties) => {
    gezien = { url, body: JSON.parse(opties.body), apikey: opties.headers.apikey };
    return antwoord(200, { access_token: 'a', refresh_token: 'r' });
  });
  assert.deepEqual(gezien, {
    url: 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token', body: { refresh_token: 'r1' }, apikey: 'pk',
  });
});

// --- de cookie ---------------------------------------------------------------

test('de cookie: HttpOnly, Secure, Strict, enkel voor /api/sessie/, lang geldig', () => {
  const c = sessieCookie('r2');
  for (const deel of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/sessie/', `${COOKIE}=r2`]) {
    assert.ok(c.includes(deel), deel);
  }
  assert.ok(Number(c.match(/Max-Age=(\d+)/)[1]) >= 365 * 24 * 3600);
  assert.match(sessieCookie(null), /Max-Age=0/);
  const r = new Request('https://x/', { headers: { cookie: `ander=1; ${COOKIE}=${encodeURIComponent('a/b=c')}` } });
  assert.equal(leesCookie(r), 'a/b=c');
  assert.equal(leesCookie(new Request('https://x/')), null);
});

// --- de routes ---------------------------------------------------------------

test('start ververst meteen, zet de nieuwe in de cookie en geeft enkel het toegangstoken', async () => {
  let meegegeven;
  const res = await metFetch(async (url, o) => {
    meegegeven = JSON.parse(o.body).refresh_token;
    return antwoord(200, { access_token: 'a2', refresh_token: 'r2' });
  }, () => sessieStarten({ env, request: verzoek('/api/sessie/start', { body: { refresh_token: 'uit-de-url' } }) }));
  assert.equal(meegegeven, 'uit-de-url');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie'), new RegExp(`${COOKIE}=r2;`));
  assert.deepEqual(await res.json(), { access_token: 'a2' }, 'het verversingstoken staat nooit in de body');
  assert.equal((await sessieStarten({ env, request: verzoek('/api/sessie/start') })).status, 400);
});

test('vernieuw: zonder cookie 401; ongeldig = cookie weg; storing = 503 en de cookie blijft', async () => {
  assert.equal((await sessieVernieuwen({ env, request: verzoek('/api/sessie/vernieuw') })).status, 401);

  const cookie = `${COOKIE}=r1`;
  let gestuurd;
  const ok = await metFetch(async (u, o) => {
    gestuurd = JSON.parse(o.body).refresh_token;
    return antwoord(200, { access_token: 'a2', refresh_token: 'r2' });
  }, () => sessieVernieuwen({ env, request: verzoek('/api/sessie/vernieuw', { cookie }) }));
  assert.equal(gestuurd, 'r1');
  assert.match(ok.headers.get('set-cookie'), /ta_sessie=r2;/);

  const weg = await metFetch(async () => antwoord(400, { error: 'invalid_grant' }),
    () => sessieVernieuwen({ env, request: verzoek('/api/sessie/vernieuw', { cookie }) }));
  assert.equal(weg.status, 401);
  assert.match(weg.headers.get('set-cookie'), /Max-Age=0/);

  const storing = await metFetch(async () => antwoord(530),
    () => sessieVernieuwen({ env, request: verzoek('/api/sessie/vernieuw', { cookie }) }));
  assert.equal(storing.status, 503);
  assert.equal(storing.headers.get('set-cookie'), null, 'bij een storing blijft de cookie staan');
});

test('stop: de cookie gaat weg, ook als Supabase niet antwoordt', async () => {
  let afgemeld;
  const nep = async (url, o) => {
    afgemeld = { url, auth: o.headers.authorization };
    return antwoord(204);
  };
  const res = await sessieStoppen({ env, request: verzoek('/api/sessie/stop', { token: 'a1' }) }, nep);
  assert.deepEqual(afgemeld, { url: 'https://x.supabase.co/auth/v1/logout', auth: 'Bearer a1' });
  assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
  const zonder = await sessieStoppen({ env, request: verzoek('/api/sessie/stop', { token: 'a1' }) },
    async () => { throw new TypeError('netwerk'); });
  assert.match(zonder.headers.get('set-cookie'), /Max-Age=0/);
});

// --- een storing bij het nakijken van het token -----------------------------

function nepToken() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'ES256', kid: 'k' })}.${b64({ sub: 's', email: 'a@x.be', exp: 9e9 })}.${b64('x')}`;
}

test('kan de Worker de publieke sleutels niet ophalen, dan is dat een 503, geen 401', async () => {
  const db = maakDb();
  const werkEnv = { ...env, DB: db, SUPABASE_JWKS_URL: 'https://x.supabase.co/auth/v1/jwks' };
  const vraag = () => worker.fetch(
    new Request('https://x/api/mij', { headers: { authorization: `Bearer ${nepToken()}` } }), werkEnv, {}
  );
  const onbereikbaar = await metFetch(async () => { throw new TypeError('netwerk'); }, vraag);
  assert.equal(onbereikbaar.status, 503);
  const gepauzeerd = await metFetch(async () => antwoord(530), vraag);
  assert.equal(gepauzeerd.status, 503);

  // Wel bereikbaar, maar de handtekening deugt niet: dat blijft een 401.
  const sleutel = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', sleutel.publicKey)), kid: 'k' };
  const vals = await metFetch(async () => antwoord(200, { keys: [jwk] }), vraag);
  assert.equal(vals.status, 401);
});

// --- de browser: api.js -------------------------------------------------------

test('de browser: één verversing tegelijk, een storing meldt niet af, de oude sessie gaat mee', async () => {
  const opslag = new Map([['teamassist.sessie', JSON.stringify({ access_token: 'oud', refresh_token: 'r-oud' })]]);
  globalThis.localStorage = {
    getItem: (k) => opslag.get(k) ?? null, setItem: (k, v) => opslag.set(k, v), removeItem: (k) => opslag.delete(k),
  };
  const api = await import('../public/js/api.js');
  const oproepen = [];
  let supabase = 'weg';
  let eigen = 200;
  const oud = globalThis.fetch;
  globalThis.fetch = async (pad, opties) => {
    oproepen.push(pad);
    await new Promise((r) => setTimeout(r, 5));
    if (pad === '/api/sessie/vernieuw') {
      if (supabase === 'ok') return antwoord(200, { access_token: 'a-cookie' });
      return antwoord(supabase === 'weg' ? 401 : 503);
    }
    if (pad === '/api/sessie/start') {
      const { refresh_token: r } = JSON.parse(opties.body);
      return r === 'r-oud' ? antwoord(200, { access_token: 'a-start' }) : antwoord(401);
    }
    if (pad === '/api/sessie/stop') return antwoord(200);
    return antwoord(eigen, { pad, token: opties.headers.authorization });
  };
  try {
    // Geen cookie, wel een sessie van vóór 0.39.2: één keer overzetten.
    assert.equal(await api.herneemSessie(), 'ok');
    assert.deepEqual(oproepen, ['/api/sessie/vernieuw', '/api/sessie/start']);
    assert.equal(opslag.has('teamassist.sessie'), false, 'de oude opslag is leeg');
    assert.equal((await api.api('/api/mij')).body.token, 'Bearer a-start');

    // Het token verloopt; drie oproepen tegelijk krijgen een 401 — één verversing.
    supabase = 'ok';
    eigen = 401;
    oproepen.length = 0;
    const tegelijk = api.api('/api/a');
    const tweede = api.api('/api/b');
    const derde = api.api('/api/c');
    setTimeout(() => { eigen = 200; }, 7);
    await Promise.all([tegelijk, tweede, derde]);
    assert.equal(oproepen.filter((p) => p === '/api/sessie/vernieuw').length, 1, 'één verversing tegelijk');

    // Supabase even weg: 503, en de sessie blijft (geen stop-oproep).
    supabase = 'storing';
    eigen = 401;
    oproepen.length = 0;
    const r = await api.api('/api/mij');
    assert.equal(r.status, 503);
    assert.ok(!oproepen.includes('/api/sessie/stop'));

    await api.afmelden();
    assert.ok(oproepen.includes('/api/sessie/stop'));
  } finally {
    globalThis.fetch = oud;
  }
});
