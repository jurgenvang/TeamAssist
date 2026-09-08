// Het echt uitvoeren van de geplande taken, met dezelfde fout-opvang als de
// bestaande ping.
//
// Het zwaartepunt: een lege uitgangspositie ('nog geen gevolgde ploeg') is
// geen mislukking en mag niemand alarmeren; een echte mislukking komt wél in
// taak_runs én, bij twee keer na elkaar, onafgehandeld in het logboek.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { voerGeplandeTakenUit } from '../src/lib/geplandetaken.js';

const T1 = 'BVBL1125J16  2';
const env = { RESEND_API_KEY: 'x' };

function zetKlaarMetPloeg() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd) VALUES ('${T1}', '2026-27', 'J16 B', 'J16', 1);
  `);
  return db;
}

function zetKlaarZonderPloeg() {
  const db = maakDb();
  db._sqlite.exec(`INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);`);
  return db;
}

const VBL_WEDSTRIJDEN = [
  {
    guid: 'W1', tTGUID: T1, tTNaam: 'J16 B', uTGUID: 'BVBL1053J16  1', uTNaam: 'Gastploeg',
    datumString: '12-09-2026', beginTijd: '10.30', accGUID: 'ACC1', accNaam: 'Sporthal A',
    gespeeld: 'N', wedOff: [],
  },
];

function mockVblFetch(status = 200, data = VBL_WEDSTRIJDEN) {
  return async () => new Response(JSON.stringify(data), { status });
}

test('geen taken: er gebeurt niets, geen enkele databankaanroep faalt', async () => {
  const db = zetKlaarMetPloeg();
  await voerGeplandeTakenUit([], db, env);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM taak_runs`).get().n;
  assert.equal(aantal, 0);
});

test('geen actief seizoen: er gebeurt niets, geen crash', async () => {
  const db = maakDb(); // geen enkel seizoen ingevoegd
  const oude = globalThis.fetch;
  globalThis.fetch = mockVblFetch();
  try {
    await voerGeplandeTakenUit(['wedstrijden'], db, env);
  } finally {
    globalThis.fetch = oude;
  }
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM taak_runs`).get().n;
  assert.equal(aantal, 0);
});

test('wedstrijden synchroniseren bij succes komt als ok in taak_runs', async () => {
  const db = zetKlaarMetPloeg();
  const oude = globalThis.fetch;
  globalThis.fetch = mockVblFetch();
  try {
    await voerGeplandeTakenUit(['wedstrijden'], db, env);
  } finally {
    globalThis.fetch = oude;
  }
  const rij = db._sqlite.prepare(`SELECT * FROM taak_runs WHERE taak = 'wedstrijden-sync'`).get();
  assert.equal(rij.status, 'ok');

  const wed = db._sqlite.prepare(`SELECT * FROM wedstrijden WHERE wedstrijd_guid = 'W1'`).get();
  assert.ok(wed, 'de wedstrijd is echt weggeschreven, niet enkel een droogloop');
});

test('geen gevolgde ploeg is geen mislukking, ook niet twee keer na elkaar', async () => {
  const db = zetKlaarZonderPloeg();
  await voerGeplandeTakenUit(['wedstrijden'], db, env);
  await voerGeplandeTakenUit(['wedstrijden'], db, env);

  const rijen = db._sqlite.prepare(`SELECT status FROM taak_runs WHERE taak = 'wedstrijden-sync'`).all();
  assert.equal(rijen.length, 2);
  assert.ok(rijen.every((r) => r.status === 'ok'), 'niets gevolgd is geen storing');

  const logregel = db._sqlite.prepare(`SELECT * FROM logboek WHERE soort = 'taak'`).get();
  assert.equal(logregel, undefined, 'geen enkele alarmerende logregel voor een lege, normale beginstand');
});

test('een eerste mislukking komt als fout in taak_runs, gelogd maar wél afgehandeld', async () => {
  const db = zetKlaarMetPloeg();
  const oude = globalThis.fetch;
  globalThis.fetch = async () => new Response('serverfout', { status: 500 });
  try {
    await voerGeplandeTakenUit(['wedstrijden'], db, env);
  } finally {
    globalThis.fetch = oude;
  }
  const rij = db._sqlite.prepare(`SELECT * FROM taak_runs WHERE taak = 'wedstrijden-sync'`).get();
  assert.equal(rij.status, 'fout');
  const logregel = db._sqlite.prepare(`SELECT * FROM logboek WHERE soort = 'taak'`).get();
  assert.ok(logregel, 'wel gelogd, net als bij de bestaande ping');
  assert.equal(logregel.afgehandeld, 1, 'één mislukking op zich hoeft nog niemand te alarmeren');
  assert.match(logregel.wat, /wedstrijden-sync mislukt/);
});

test('twee mislukkingen na elkaar geven een tweede logregel, nu onafgehandeld', async () => {
  const db = zetKlaarMetPloeg();
  const oude = globalThis.fetch;
  globalThis.fetch = async () => new Response('serverfout', { status: 500 });
  try {
    await voerGeplandeTakenUit(['wedstrijden'], db, env);
    await voerGeplandeTakenUit(['wedstrijden'], db, env);
  } finally {
    globalThis.fetch = oude;
  }
  const logregels = db._sqlite.prepare(`SELECT * FROM logboek WHERE soort = 'taak' ORDER BY id`).all();
  assert.equal(logregels.length, 2, 'elke mislukking wordt gelogd, niet enkel de tweede');
  assert.equal(logregels[0].afgehandeld, 1);
  assert.match(logregels[1].wat, /twee keer na elkaar mislukt/);
  assert.equal(logregels[1].afgehandeld, 0);
});

test('een derde, geslaagde run na twee mislukkingen telt niet meer als twee-op-twee', async () => {
  const db = zetKlaarMetPloeg();
  const oude = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('serverfout', { status: 500 });
    await voerGeplandeTakenUit(['wedstrijden'], db, env);
    await voerGeplandeTakenUit(['wedstrijden'], db, env);
    globalThis.fetch = mockVblFetch();
    await voerGeplandeTakenUit(['wedstrijden'], db, env);
  } finally {
    globalThis.fetch = oude;
  }
  const laatste = db._sqlite.prepare(`SELECT status FROM taak_runs WHERE taak = 'wedstrijden-sync' ORDER BY id DESC LIMIT 1`).get();
  assert.equal(laatste.status, 'ok');
});

test('teams en leden lopen allebei, elk met hun eigen taak_runs-regel', async () => {
  const db = zetKlaarMetPloeg();
  const oude = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('OrgDetailByGuid')) {
      return new Response(JSON.stringify({ naam: 'Club', guid: 'BVBL1125', teams: [{ guid: T1, naam: 'J16 B' }] }), { status: 200 });
    }
    if (String(url).includes('TeamDetailByGuid')) {
      return new Response(JSON.stringify({ spelers: [], tvlijst: [] }), { status: 200 });
    }
    return new Response('onverwacht', { status: 500 });
  };
  try {
    await voerGeplandeTakenUit(['teams', 'leden'], db, env);
  } finally {
    globalThis.fetch = oude;
  }
  const teamsRij = db._sqlite.prepare(`SELECT * FROM taak_runs WHERE taak = 'teams-sync'`).get();
  const ledenRij = db._sqlite.prepare(`SELECT * FROM taak_runs WHERE taak = 'leden-sync'`).get();
  assert.ok(teamsRij);
  assert.ok(ledenRij);
});

test('periodes voert zowel vakanties als feestdagen uit, apart gelogd', async () => {
  const db = zetKlaarMetPloeg();
  const oude = globalThis.fetch;
  globalThis.fetch = mockVblFetch(200, []); // lege OpenHolidays-lijst, geen fout
  try {
    await voerGeplandeTakenUit(['periodes'], db, env);
  } finally {
    globalThis.fetch = oude;
  }
  const vakRij = db._sqlite.prepare(`SELECT * FROM taak_runs WHERE taak = 'vakanties-sync'`).get();
  const feestRij = db._sqlite.prepare(`SELECT * FROM taak_runs WHERE taak = 'feestdagen-sync'`).get();
  assert.ok(vakRij);
  assert.ok(feestRij);
});

test('logboekregels van een automatische synchronisatie hebben wie = null, niet een echte persoon', async () => {
  const db = zetKlaarMetPloeg();
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p-coach', 'Co', 'Ach', 'coach@example.org');
    INSERT INTO rollen (persoon_id, rol, team_guid, seizoen) VALUES ('p-coach', 'COACH', '${T1}', '2026-27');
  `);
  const oude = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('resend.com')) return new Response('{}', { status: 200 });
    return mockVblFetch()();
  };
  try {
    await voerGeplandeTakenUit(['wedstrijden'], db, env);
    // Een tweede run met een gewijzigd uur triggert de meldbare wijziging.
    globalThis.fetch = async (url) => {
      if (String(url).includes('resend.com')) return new Response('{}', { status: 200 });
      return new Response(JSON.stringify([{ ...VBL_WEDSTRIJDEN[0], beginTijd: '14.00' }]), { status: 200 });
    };
    await voerGeplandeTakenUit(['wedstrijden'], db, env);
  } finally {
    globalThis.fetch = oude;
  }
  const regel = db._sqlite.prepare(`SELECT * FROM logboek WHERE wat LIKE 'wedstrijd gewijzigd%'`).get();
  assert.ok(regel);
  assert.equal(regel.wie, null, 'het systeem, geen aangemelde persoon');
});

// --- opkuis (T15) -----------------------------------------------------------

test('opkuis draait zonder een actief seizoen — opruiming hangt daar niet van af', async () => {
  const db = maakDb(); // geen seizoen ingevoegd
  db._sqlite.exec(`
    INSERT INTO taak_runs (taak, geeindigd, status) VALUES ('iets', datetime('now', '-40 days'), 'ok');
  `);
  await voerGeplandeTakenUit(['opkuis'], db, env);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM taak_runs WHERE taak = 'iets'`).get().n, 0);
});

test('opkuis logt elk van de vier onderdelen apart in taak_runs', async () => {
  const db = zetKlaarMetPloeg();
  await voerGeplandeTakenUit(['opkuis'], db, env);
  const namen = db._sqlite.prepare(`SELECT taak FROM taak_runs ORDER BY taak`).all().map((r) => r.taak);
  assert.deepEqual(namen, ['opkuis-berichten', 'opkuis-logboek', 'opkuis-personen', 'opkuis-taak_runs']);
});

test('opkuis verwijdert echt oude, afgehandelde logboekregels bij het echt draaien', async () => {
  const db = zetKlaarMetPloeg();
  db._sqlite.exec(`
    INSERT INTO logboek (tijdstip, soort, wat, afgehandeld) VALUES (datetime('now', '-400 days'), 'beheer', 'oud', 1);
  `);
  await voerGeplandeTakenUit(['opkuis'], db, env);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM logboek WHERE wat = 'oud'`).get().n, 0);
});

test('opkuis en wedstrijden kunnen in dezelfde run zonder elkaar te storen', async () => {
  const db = zetKlaarMetPloeg();
  const oude = globalThis.fetch;
  globalThis.fetch = mockVblFetch();
  try {
    await voerGeplandeTakenUit(['opkuis', 'wedstrijden'], db, env);
  } finally {
    globalThis.fetch = oude;
  }
  const opkuisRij = db._sqlite.prepare(`SELECT * FROM taak_runs WHERE taak = 'opkuis-logboek'`).get();
  const wedstrijdenRij = db._sqlite.prepare(`SELECT * FROM taak_runs WHERE taak = 'wedstrijden-sync'`).get();
  assert.ok(opkuisRij);
  assert.ok(wedstrijdenRij);
});
