// De beheerdersroute die een echte VBL-respons toont.
//
// Ze staat achter `systeem.beheren`, want ze toont ruwe gegevens van de bond.
// De rechtencontrole zelf zit in de routetabel; hier wordt bewaakt dat de route
// dat recht ook werkelijk vraagt, en dat de standaarduitvoer geen namen bevat.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { vblDiagnose } from '../src/routes/admin/vbl-diagnose.js';

const PLOEG = [
  {
    guid: 'BVBL1125J16  2',
    spelers: [{ lidNr: '1', naam: 'Simon Roels', sGebDat: '17-03-2010', ma: 'N' }],
    tvlijst: [{ lidNr: '2', naam: 'Dieter Devroey', tvCaC: 'Coach' }],
  },
];

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO personen (id, voornaam, achternaam, email)
         VALUES ('p-admin', 'Jurgen', 'van Geijstelen', 'a@b.c');
  `);
  return db;
}

async function roep(db, zoekstring, antwoord) {
  const oude = globalThis.fetch;
  globalThis.fetch = async () => antwoord();
  try {
    const res = await vblDiagnose({
      db,
      persoon: { id: 'p-admin' },
      request: new Request(`https://x/api/admin/vbl-diagnose${zoekstring}`),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = oude;
  }
}

const ok = () => new Response(JSON.stringify(PLOEG), { status: 200 });

test('de route vraagt het recht om het systeem te beheren', () => {
  const route = ROUTES.find((r) => r.pad === '/api/admin/vbl-diagnose');
  assert.equal(route.recht, 'systeem.beheren');
  assert.notEqual(route.publiek, true, 'deze route mag nooit publiek staan');
});

test('een ploeg opvragen geeft een samenvatting zonder namen', async () => {
  const db = zetKlaar();
  const uit = await roep(db, '?team=BVBL1125J16%20%202', ok);
  assert.equal(uit.status, 200);
  assert.equal(uit.body.spelers.aantal, 1);
  assert.ok(!JSON.stringify(uit.body).includes('Simon'), 'geen namen in de standaarduitvoer');
});

test('zonder ploeg komt de ploegenlijst van de club', async () => {
  const db = zetKlaar();
  const org = () => new Response(JSON.stringify({ teams: [{ guid: 'BVBL1125J16  2' }] }), { status: 200 });
  const uit = await roep(db, '', org);
  assert.deepEqual(uit.body.ploegen, ['BVBL1125J16  2']);
  assert.equal(uit.body.club, 'BVBL1125');
});

test('met ruw=1 komt het volledige antwoord mee', async () => {
  const db = zetKlaar();
  const uit = await roep(db, '?team=BVBL1125J16%20%202&ruw=1', ok);
  assert.ok(JSON.stringify(uit.body.ruw).includes('Simon'));
});

test('het ruw opvragen wordt apart gelogd', async () => {
  // Dan gaan er namen van minderjarigen over de lijn; dat hoort een spoor na te
  // laten dat verschilt van een gewone opvraging.
  const db = zetKlaar();
  await roep(db, '?team=BVBL1125J16%20%202&ruw=1', ok);
  const regel = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.match(regel.wat, /ruw/);
  assert.equal(regel.wie, 'p-admin');
});

test('een storing bij de bond geeft 502 met de reden erbij', async () => {
  const db = zetKlaar();
  const stuk = () => new Response('<html>Request Error</html>', { status: 200 });
  const uit = await roep(db, '?team=BVBL1125J16%20%202', stuk);
  assert.equal(uit.status, 502);
  assert.match(uit.body.fout, /geen JSON/);
  const regel = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.match(regel.wat, /mislukt/);
});
