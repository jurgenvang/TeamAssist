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
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
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

test('de ping stuurt de sleutel enkel in de apikey-kop', async () => {
  // Een publishable-sleutel in een Authorization-header levert een 401 op. Dat
  // is precies het soort fout dat pas een week later zichtbaar wordt, wanneer
  // het project gepauzeerd blijkt.
  let gezien = null;
  await pingSupabase(ENV, async (url, opties) => {
    gezien = { url, opties };
    return new Response('[]', { status: 200 });
  });
  assert.match(gezien.url, /\/rest\/v1\/ping/);
  assert.equal(gezien.opties.headers.apikey, 'sb_publishable_test');
  assert.equal(gezien.opties.headers.authorization, undefined);
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

// --- de beheerders verwittigen (0.30.1) -------------------------------------
//
// De ping faalde in september en oktober 2026 een maand lang elke nacht, en
// niemand merkte het: het stond enkel in het logboek.

function metBeheerder() {
  const db = metSeizoen();
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p-adm', 'Ad', 'Min', 'adm@example.org');
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p-coach', 'Co', 'Ach', 'coach@example.org');
    INSERT INTO rollen (persoon_id, rol) VALUES ('p-adm', 'ADMIN');
    UPDATE instellingen SET waarde = 'normaal' WHERE sleutel = 'bericht_modus';
  `);
  return db;
}

/** Vangt de mails naar Resend op; de ping zelf gaat via de eigen fetcher. */
async function metMails(fn) {
  const mails = [];
  const oude = globalThis.fetch;
  globalThis.fetch = async (url, opties) => {
    if (String(url).includes('resend.com')) mails.push(JSON.parse(opties.body));
    return new Response(JSON.stringify({ id: 'm' }), { status: 200 });
  };
  try {
    await fn();
  } finally {
    globalThis.fetch = oude;
  }
  return mails;
}

const ENV_MET_MAIL = { ...ENV, RESEND_API_KEY: 're_test' };

test('één mislukte ping verwittigt nog niemand', async () => {
  const db = metBeheerder();
  const mails = await metMails(() => voerPingUit(db, ENV_MET_MAIL, faalt));
  assert.equal(mails.length, 0);
});

test('bij de tweede mislukking na elkaar krijgt elke beheerder een mail, met wat hij kan doen', async () => {
  const db = metBeheerder();
  const mails = await metMails(async () => {
    await voerPingUit(db, ENV_MET_MAIL, faalt);
    await voerPingUit(db, ENV_MET_MAIL, faalt);
  });
  assert.equal(mails.length, 1, 'enkel de ADMIN, niet de coach');
  assert.equal(mails[0].to, 'adm@example.org');
  assert.match(mails[0].subject, /supabase-ping/);
  assert.match(mails[0].text, /Restore project/);
  assert.match(mails[0].text, /status 500/);
});

test('blijft het mislukken, dan niet elke nacht opnieuw een mail, wel na een week', async () => {
  const db = metBeheerder();
  const eerste = await metMails(async () => {
    for (let i = 0; i < 5; i++) await voerPingUit(db, ENV_MET_MAIL, faalt);
  });
  assert.equal(eerste.length, 1);

  // Het vorige alarm een week terugzetten in de tijd.
  db._sqlite.exec(`UPDATE logboek SET tijdstip = datetime('now', '-8 days') WHERE wat LIKE '%beheerders verwittigd'`);
  const later = await metMails(() => voerPingUit(db, ENV_MET_MAIL, faalt));
  assert.equal(later.length, 1);
});

test('na een geslaagde ping geeft een nieuwe reeks meteen weer een alarm', async () => {
  const db = metBeheerder();
  const mails = await metMails(async () => {
    await voerPingUit(db, ENV_MET_MAIL, faalt);
    await voerPingUit(db, ENV_MET_MAIL, faalt);
    await voerPingUit(db, ENV_MET_MAIL, lukt);
    await voerPingUit(db, ENV_MET_MAIL, faalt);
    await voerPingUit(db, ENV_MET_MAIL, faalt);
  });
  assert.equal(mails.length, 2);
});

test('een alarm dat zelf mislukt, laat de ping niet ontploffen', async () => {
  const db = metBeheerder();
  const oude = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Resend onbereikbaar'); };
  try {
    await voerPingUit(db, ENV_MET_MAIL, faalt);
    const uit = await voerPingUit(db, ENV_MET_MAIL, faalt);
    assert.equal(uit.ok, false);
  } finally {
    globalThis.fetch = oude;
  }
  assert.ok(db._sqlite.prepare(`SELECT 1 FROM logboek WHERE wat = 'bericht versturen mislukt'`).get());
});
