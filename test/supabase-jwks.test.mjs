// De publieke sleutels ophalen.
//
// Supabase publiceert ze op twee mogelijke paden, afhankelijk van de leeftijd
// van het project. Welke van de twee het is, valt van hieruit niet te zien —
// dus worden ze allebei geprobeerd.

import test from 'node:test';
import assert from 'node:assert/strict';
import { verifieerToken } from '../src/lib/supabase.js';

function nepJwks(werkendPad) {
  const gezien = [];
  return {
    gezien,
    fetcher: async (url) => {
      gezien.push(new URL(url).pathname);
      if (!url.endsWith(werkendPad)) return new Response('niet hier', { status: 404 });
      return new Response(JSON.stringify({ keys: [] }), { status: 200 });
    },
  };
}

test('het klassieke pad wordt eerst geprobeerd', async () => {
  const { gezien, fetcher } = nepJwks('/auth/v1/.well-known/jwks.json');
  // Een lege sleutellijst geldt als onbruikbaar, dus dit gooit — waar het hier
  // om gaat, is welk pad bevraagd werd.
  await assert.rejects(() =>
    verifieerToken('a.b.c', { SUPABASE_URL: 'https://x.supabase.co' }, fetcher)
  );
  assert.ok(gezien.length === 0 || gezien[0] === '/auth/v1/.well-known/jwks.json');
});

test('bij een 404 op het eerste pad wordt het tweede geprobeerd', async () => {
  const gezien = [];
  const fetcher = async (url) => {
    gezien.push(new URL(url).pathname);
    if (url.endsWith('/auth/v1/jwks')) {
      return new Response(JSON.stringify({ keys: [{ kty: 'EC', crv: 'P-256', kid: 'k' }] }), {
        status: 200,
      });
    }
    return new Response('niet hier', { status: 404 });
  };

  // Een geldig gevormd token met een handtekening die niet klopt: de sleutels
  // worden opgehaald, de verificatie faalt daarna. Beide paden zijn dan gezien.
  const deel = btoa(JSON.stringify({ alg: 'ES256', kid: 'k' })).replace(/=+$/, '');
  const body = btoa(JSON.stringify({ sub: 's', email: 'a@b.c' })).replace(/=+$/, '');
  await assert.rejects(() =>
    verifieerToken(`${deel}.${body}.AAAA`, { SUPABASE_URL: 'https://x.supabase.co' }, fetcher)
  );
  assert.deepEqual(gezien, ['/auth/v1/.well-known/jwks.json', '/auth/v1/jwks']);
});

test('een ingestelde JWKS-URL wordt rechtstreeks gebruikt', async () => {
  const gezien = [];
  const fetcher = async (url) => {
    gezien.push(url);
    return new Response(JSON.stringify({ keys: [{ kty: 'EC', crv: 'P-256', kid: 'k' }] }), {
      status: 200,
    });
  };
  const kop = btoa(JSON.stringify({ alg: 'ES256', kid: 'k' })).replace(/=+$/, '');
  const body = btoa(JSON.stringify({ sub: 's', email: 'a@b.c' })).replace(/=+$/, '');

  await assert.rejects(() =>
    verifieerToken(
      `${kop}.${body}.AAAA`,
      {
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_JWKS_URL: 'https://x.supabase.co/auth/v1/eigen-pad.json',
      },
      fetcher
    )
  );
  assert.deepEqual(gezien, ['https://x.supabase.co/auth/v1/eigen-pad.json']);
});

test('een secret key in het JWT-geheim wordt geweigerd', async () => {
  // sb_secret_ vervangt service_role en omzeilt alle beveiliging. Ze hoort hier
  // niet, en stil een verkeerde verificatie doen zou erger zijn dan falen.
  await assert.rejects(
    () => verifieerToken('a.b.c', { SUPABASE_JWT_SECRET: 'sb_secret_iets' }),
    /secret key/
  );
});
