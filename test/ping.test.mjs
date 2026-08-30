// De supabase-ping.
//
// Zonder deze taak wordt het gratis project na een week zonder activiteit
// gepauzeerd en raakt niemand nog binnen. Dus: hij mag niet stil falen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { pingSupabase, voerPingUit, PING_TAAK } from '../src/lib/ping.js';

const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_SLEUTEL: 'anon-sleutel',
};

const lukt = async () => new Response('[]', { status: 200 });
const faalt = async () => new Response('nee', { status: 500 });
const ontploft = async () => {
  throw new Error('netwerk weg');
};

function metSeizoen() {
  const db = maakDb();
  db._sqlite.exec(`INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1)`);
  return db;
}

test('een geslaagde ping meldt dat het project wakker is', async () => {
  const uit = await pingSupabase(ENV, lukt);
  assert.equal(uit.ok, true);
});

test('de ping gebruikt de anon-sleutel in beide koppen', async () => {
  let gezien = null;
  await pingSupabase(ENV, async (url, opties) => {
    gezien = { url, opties };
    return new Response('[]', { status: 200 });
  });
  assert.match(gezien.url, /\/rest\/v1\/ping/);
  assert.equal(gezien.opties.headers.apikey, 'anon-sleutel');
  assert.equal(gezien.opties.headers.authorization, 'Bearer anon-sleutel');
});

test('ontbrekende instellingen geven een fout in plaats van een stille ping', async () => {
  const uit = await pingSupabase({}, lukt);
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /ontbreekt/);
});

test('een netwerkfout wordt opgevangen en niet doorgegooid', async () => {
  const uit = await pingSupabase(ENV, ontploft);
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /netwerk weg/);
});

test('elke uitvoering laat een spoor na in taak_runs', async () => {
  const db = metSeizoen();
  await voerPingUit(db, ENV, lukt);
  const rij = db._sqlite.prepare(`SELECT * FROM taak_runs WHERE taak = ?`).get(PING_TAAK);
  assert.equal(rij.status, 'ok');
});

test('één mislukking komt in het logboek maar geldt als afgehandeld', async () => {
  const db = metSeizoen();
  await voerPingUit(db, ENV, faalt);
  const rij = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.match(rij.wat, /mislukt/);
  assert.equal(rij.afgehandeld, 1);
});

test('twee mislukkingen na elkaar blijven onafgehandeld staan', async () => {
  // Anders merkt niemand het tot de app een week later dichtgaat.
  const db = metSeizoen();
  await voerPingUit(db, ENV, faalt);
  await voerPingUit(db, ENV, faalt);
  const rij = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.equal(rij.afgehandeld, 0);
  assert.match(rij.wat, /gepauzeerd/);
});

test('een geslaagde ping na een mislukte zet de teller terug', async () => {
  const db = metSeizoen();
  await voerPingUit(db, ENV, faalt);
  await voerPingUit(db, ENV, lukt);
  await voerPingUit(db, ENV, faalt);
  const rij = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.equal(rij.afgehandeld, 1, 'na een geslaagde ping telt de reeks opnieuw');
});
