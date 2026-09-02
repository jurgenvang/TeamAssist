// De route die wedstrijden ophaalt en toont.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { wedstrijdenSync, wedstrijdenTonen } from '../src/routes/admin/wedstrijden.js';

const T1 = 'BVBL1125J16  2';
const seizoen = { code: '2026-27', naam: '2026-2027' };
const persoon = { id: 'p-admin' };

const VBL_ANTWOORD = [
  {
    guid: 'W1', tTGUID: T1, tTNaam: 'J16 B', uTGUID: 'BVBL1053J16  1', uTNaam: 'Gastploeg',
    datumString: '12-09-2026', beginTijd: '10.30', accGUID: 'ACC1', accNaam: 'Sporthal A',
    gespeeld: 'N', wedOff: [],
  },
];

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd) VALUES ('${T1}', '2026-27', 'J16 B', 'J16', 1);
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p-admin', 'A', 'B');
  `);
  return db;
}

function verzoek(pad, methode = 'POST') {
  return new Request(`https://x${pad}`, { method: methode });
}

async function sync(db, zoekstring = '', antwoord = () => new Response(JSON.stringify(VBL_ANTWOORD), { status: 200 })) {
  const oude = globalThis.fetch;
  globalThis.fetch = async () => antwoord();
  try {
    const res = await wedstrijdenSync({ db, persoon, seizoen, request: verzoek(`/x${zoekstring}`) });
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = oude;
  }
}

const tel = (db, tabel) => db._sqlite.prepare(`SELECT count(*) AS n FROM ${tabel}`).get().n;

test('de sync-route vraagt systeem.beheren, tonen enkel team.bekijken', () => {
  const s = ROUTES.find((r) => r.pad === '/api/admin/wedstrijden/sync');
  assert.equal(s.recht, 'systeem.beheren');
  const t = ROUTES.find((r) => r.pad === '/api/admin/wedstrijden' && r.methode === 'GET');
  assert.equal(t.recht, 'team.bekijken');
  assert.equal(typeof t.team, 'function');
});

test('een droogloop schrijft niets weg', async () => {
  const db = zetKlaar();
  const uit = await sync(db);
  assert.equal(uit.body.droogloop, true);
  assert.equal(uit.body.totalen.nieuw, 1);
  assert.equal(tel(db, 'wedstrijden'), 0);
});

test('met uitvoeren komt de wedstrijd erin', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  assert.equal(tel(db, 'wedstrijden'), 1);
  const rij = db._sqlite.prepare(`SELECT * FROM wedstrijden`).get();
  assert.equal(rij.datum, '2026-09-12');
  assert.equal(rij.begin, '10:30');
  assert.equal(rij.thuis, 1);
});

test('een tweede synchronisatie maakt geen dubbels', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  await sync(db, '?uitvoeren=1');
  assert.equal(tel(db, 'wedstrijden'), 1);
});

test('een uurwijziging komt onafgehandeld in het logboek', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const gewijzigd = () =>
    new Response(JSON.stringify([{ ...VBL_ANTWOORD[0], beginTijd: '14.00' }]), { status: 200 });
  await sync(db, '?uitvoeren=1', gewijzigd);

  const rij = db._sqlite.prepare(`SELECT begin FROM wedstrijden`).get();
  assert.equal(rij.begin, '14:00');
  const regel = db._sqlite.prepare(`SELECT * FROM logboek WHERE wat LIKE 'wedstrijd gewijzigd%'`).get();
  assert.equal(regel.afgehandeld, 0);
});

test('enkel een uitslag bijwerken komt niet in het logboek als wijziging', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const metUitslag = () =>
    new Response(JSON.stringify([{ ...VBL_ANTWOORD[0], gespeeld: 'G', uitslag: '65 - 58' }]), { status: 200 });
  await sync(db, '?uitvoeren=1', metUitslag);

  const rij = db._sqlite.prepare(`SELECT uitslag FROM wedstrijden`).get();
  assert.match(rij.uitslag, /65/);
  const regel = db._sqlite.prepare(`SELECT * FROM logboek WHERE wat LIKE 'wedstrijd gewijzigd%'`).get();
  assert.equal(regel, undefined, 'een uitslag hoort geen wijzigingsmelding te zijn');
});

test('een verdwenen wedstrijd blijft bestaan met bij_bond = 0', async () => {
  // Zes bestaande wedstrijden, waarvan er vijf in het VBL-antwoord voorkomen:
  // dat is één verdwenen op zes, ruim onder de derde-grens, dus de rem slaat
  // niet aan en de verdwenen rij wordt wel gemarkeerd.
  const db = zetKlaar();
  const zesRijen = Array.from({ length: 6 }, (_, i) => ({
    guid: `W${i + 1}`, tTGUID: T1, tTNaam: 'J16 B', uTGUID: 'X', uTNaam: 'Gast',
    datumString: `1${i}-09-2026`, beginTijd: '10.30', accGUID: 'ACC1', accNaam: 'Sporthal A',
    gespeeld: 'N', wedOff: [],
  }));
  await sync(db, '?uitvoeren=1', () => new Response(JSON.stringify(zesRijen), { status: 200 }));
  assert.equal(tel(db, 'wedstrijden'), 6);

  const vijfVanZes = () => new Response(JSON.stringify(zesRijen.slice(0, 5)), { status: 200 });
  await sync(db, '?uitvoeren=1', vijfVanZes);

  const rij = db._sqlite.prepare(`SELECT bij_bond FROM wedstrijden WHERE wedstrijd_guid = 'W6'`).get();
  assert.equal(rij.bij_bond, 0);
  const rest = db._sqlite.prepare(`SELECT bij_bond FROM wedstrijden WHERE wedstrijd_guid = 'W1'`).get();
  assert.equal(rest.bij_bond, 1);
});

test('een lege lijst zet niets weg, ook niet bij wedstrijden', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const leeg = () => new Response(JSON.stringify([]), { status: 200 });
  const uit = await sync(db, '?uitvoeren=1', leeg);
  assert.equal(uit.body.ploegen[0].status, 'deels');
  const rij = db._sqlite.prepare(`SELECT bij_bond FROM wedstrijden WHERE wedstrijd_guid = 'W1'`).get();
  assert.equal(rij.bij_bond, 1, 'geen enkele wedstrijd mag weggezet zijn');
});

test('wedstrijden tonen voor een ploeg', async () => {
  const db = zetKlaar();
  await sync(db, '?uitvoeren=1');
  const res = await wedstrijdenTonen({ db, seizoen, request: new Request(`https://x/api/admin/wedstrijden?team=${encodeURIComponent(T1)}`) });
  const body = await res.json();
  assert.equal(body.wedstrijden.length, 1);
});

test('zonder team volgt een 400', async () => {
  const res = await wedstrijdenTonen({ db: zetKlaar(), seizoen, request: new Request('https://x/api/admin/wedstrijden') });
  assert.equal(res.status, 400);
});

test('zonder gevolgde ploeg volgt een duidelijke fout', async () => {
  const db = maakDb();
  db._sqlite.exec(`INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1)`);
  const uit = await sync(db);
  assert.equal(uit.status, 400);
});
