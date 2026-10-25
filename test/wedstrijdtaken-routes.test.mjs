// De routes rond wedstrijdtaken (T1): tonen, toewijzen, probleem melden.
//
// Het zwaartepunt: toewijzen vraagt team.selectie.beheren op dát team (een
// coach van een andere ploeg kan er niet aan), en een probleem melden kan
// enkel voor je eigen taak — niet voor die van iemand anders.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { bouwRechten } from '../src/lib/rechten.js';
import { ROUTES } from '../src/index.js';
import {
  wedstrijdtakenTonen, wedstrijdtaakToewijzen, wedstrijdtaakProbleemMelden,
  taakKandidaten,
} from '../src/routes/admin/wedstrijdtaken.js';

const T1 = 'BVBL1125J16  2';
const T2 = 'BVBL1125J18  1';
const seizoen = { code: '2026-27', naam: '2026-2027' };
const env = { RESEND_API_KEY: 'x' };

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam) VALUES
      ('${T1}', '2026-27', 'J16 B'), ('${T2}', '2026-27', 'J18 A');
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('p-ouder', 'Ida', 'Peeters', 'ida@example.org'),
      ('p-coach', 'Co', 'Ach', 'coach@example.org'),
      ('p-inactief', 'Niet', 'Meer', 'weg@example.org');
    UPDATE personen SET actief = 0 WHERE id = 'p-inactief';
    INSERT INTO rollen (persoon_id, rol, team_guid, seizoen) VALUES ('p-coach', 'COACH', '${T1}', '2026-27');
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander)
         VALUES ('W1', '${T1}', '2026-27', '2026-09-12', '10:30', 1, 'Gastploeg');
    INSERT INTO wedstrijdtaken (wedstrijd_id, taak) VALUES (1, 'klok'), (1, '24seconden'), (1, 'ploegafgevaardigde');
  `);
  return db;
}

const coachRechten = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: T1 }] });
const andereCoachRechten = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: T2 }] });
const vreemdeRechten = bouwRechten();

function verzoek(pad, body) {
  return new Request(`https://x${pad}`, {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  });
}

function stilleFetch() {
  return async () => new Response('{}', { status: 200 });
}

// --- tonen ------------------------------------------------------------------

test('de drie routes staan in de routetabel', () => {
  for (const pad of [
    '/api/admin/wedstrijdtaken',
    '/api/admin/wedstrijdtaken/toewijzen',
    '/api/admin/wedstrijdtaken/probleem',
  ]) {
    assert.ok(ROUTES.find((r) => r.pad === pad), pad);
  }
});

test('een coach ziet de taakslots van zijn eigen wedstrijd', async () => {
  const db = zetKlaar();
  const res = await wedstrijdtakenTonen({
    db, rechten: coachRechten, request: verzoek('/x?wedstrijd_id=1'),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.taken.length, 3);
  assert.deepEqual(body.taken.map((t) => t.taak).sort(), ['24seconden', 'klok', 'ploegafgevaardigde']);
});

test('een onbezet taakslot toont geen naam', async () => {
  const db = zetKlaar();
  const res = await wedstrijdtakenTonen({ db, rechten: coachRechten, request: verzoek('/x?wedstrijd_id=1') });
  const body = await res.json();
  assert.ok(body.taken.every((t) => t.persoon_id === null && t.persoon_naam === null));
});

test('een coach van een ander team ziet de taken niet', async () => {
  const db = zetKlaar();
  const res = await wedstrijdtakenTonen({
    db, rechten: andereCoachRechten, request: verzoek('/x?wedstrijd_id=1'),
  });
  assert.equal(res.status, 403);
});

test('zonder enige rol: geen toegang', async () => {
  const db = zetKlaar();
  const res = await wedstrijdtakenTonen({ db, rechten: vreemdeRechten, request: verzoek('/x?wedstrijd_id=1') });
  assert.equal(res.status, 403);
});

test('een onbestaande wedstrijd geeft 404', async () => {
  const db = zetKlaar();
  const res = await wedstrijdtakenTonen({ db, rechten: coachRechten, request: verzoek('/x?wedstrijd_id=999') });
  assert.equal(res.status, 404);
});

// --- toewijzen --------------------------------------------------------------

async function wijsToe(db, body, rechten = coachRechten) {
  const oude = globalThis.fetch;
  globalThis.fetch = stilleFetch();
  try {
    return await wedstrijdtaakToewijzen({
      db, persoon: { id: 'p-coach' }, rechten, seizoen, env, request: verzoek('/x', body),
    });
  } finally {
    globalThis.fetch = oude;
  }
}

test('een coach wijst een clublid toe aan een taak', async () => {
  const db = zetKlaar();
  const res = await wijsToe(db, { wedstrijdtaak_id: 1, persoon_id: 'p-ouder' });
  assert.equal(res.status, 200);
  const rij = db._sqlite.prepare(`SELECT * FROM wedstrijdtaken WHERE id = 1`).get();
  assert.equal(rij.persoon_id, 'p-ouder');
  assert.equal(rij.toegewezen_door, 'p-coach');
  assert.ok(rij.toegewezen_tijdstip);
});

test('om het even welk actief clublid komt in aanmerking, ook zonder band met dat team', async () => {
  const db = zetKlaar();
  // p-ouder hangt aan geen enkel team — dat mag, zo is het uitgeklaard.
  const res = await wijsToe(db, { wedstrijdtaak_id: 1, persoon_id: 'p-ouder' });
  assert.equal(res.status, 200);
});

test('een inactieve persoon kan niet toegewezen worden', async () => {
  const db = zetKlaar();
  const res = await wijsToe(db, { wedstrijdtaak_id: 1, persoon_id: 'p-inactief' });
  assert.equal(res.status, 400);
  assert.equal(db._sqlite.prepare(`SELECT persoon_id FROM wedstrijdtaken WHERE id = 1`).get().persoon_id, null);
});

test('een coach van een ander team kan niet toewijzen', async () => {
  const db = zetKlaar();
  const res = await wijsToe(db, { wedstrijdtaak_id: 1, persoon_id: 'p-ouder' }, andereCoachRechten);
  assert.equal(res.status, 403);
  assert.equal(db._sqlite.prepare(`SELECT persoon_id FROM wedstrijdtaken WHERE id = 1`).get().persoon_id, null);
});

test('toewijzen aan een onbestaande persoon geeft 404', async () => {
  const db = zetKlaar();
  const res = await wijsToe(db, { wedstrijdtaak_id: 1, persoon_id: 'bestaat-niet' });
  assert.equal(res.status, 404);
});

test('toewijzen aan een onbestaande taak geeft 404', async () => {
  const db = zetKlaar();
  const res = await wijsToe(db, { wedstrijdtaak_id: 999, persoon_id: 'p-ouder' });
  assert.equal(res.status, 404);
});

test('de toegewezen persoon krijgt een bericht', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`UPDATE instellingen SET waarde = 'normaal' WHERE sleutel = 'bericht_modus'`);
  const mails = [];
  const oude = globalThis.fetch;
  globalThis.fetch = async (url, opties) => {
    if (String(url).includes('resend.com')) mails.push(JSON.parse(opties.body));
    return new Response('{}', { status: 200 });
  };
  try {
    await wedstrijdtaakToewijzen({
      db, persoon: { id: 'p-coach' }, rechten: coachRechten, seizoen, env,
      request: verzoek('/x', { wedstrijdtaak_id: 1, persoon_id: 'p-ouder' }),
    });
  } finally {
    globalThis.fetch = oude;
  }
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'ida@example.org');
  assert.match(mails[0].subject, /Klok/);
});

test('opnieuw toewijzen wist een eerder gemeld probleem', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    UPDATE wedstrijdtaken SET persoon_id = 'p-ouder', probleem_gemeld = 1, probleem_reden = 'kan niet'
     WHERE id = 1;
  `);
  await wijsToe(db, { wedstrijdtaak_id: 1, persoon_id: 'p-coach' });
  const rij = db._sqlite.prepare(`SELECT * FROM wedstrijdtaken WHERE id = 1`).get();
  assert.equal(rij.probleem_gemeld, 0);
  assert.equal(rij.probleem_reden, null);
});

// --- probleem melden --------------------------------------------------------

async function meldProbleem(db, body, persoonId) {
  const oude = globalThis.fetch;
  globalThis.fetch = stilleFetch();
  try {
    return await wedstrijdtaakProbleemMelden({
      db, persoon: { id: persoonId }, seizoen, env, request: verzoek('/x', body),
    });
  } finally {
    globalThis.fetch = oude;
  }
}

test('wie is toegewezen, kan een probleem melden', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`UPDATE wedstrijdtaken SET persoon_id = 'p-ouder' WHERE id = 1`);
  const res = await meldProbleem(db, { wedstrijdtaak_id: 1, reden: 'ik geraak er niet' }, 'p-ouder');
  assert.equal(res.status, 200);
  const rij = db._sqlite.prepare(`SELECT * FROM wedstrijdtaken WHERE id = 1`).get();
  assert.equal(rij.probleem_gemeld, 1);
  assert.equal(rij.probleem_reden, 'ik geraak er niet');
});

test('een probleem melden bij andermans taak wordt geweigerd', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`UPDATE wedstrijdtaken SET persoon_id = 'p-ouder' WHERE id = 1`);
  const res = await meldProbleem(db, { wedstrijdtaak_id: 1, reden: 'niet mijn taak' }, 'p-coach');
  assert.equal(res.status, 403);
  assert.equal(db._sqlite.prepare(`SELECT probleem_gemeld FROM wedstrijdtaken WHERE id = 1`).get().probleem_gemeld, 0);
});

test('een probleem melden bij een onbezette taak wordt geweigerd', async () => {
  const db = zetKlaar();
  const res = await meldProbleem(db, { wedstrijdtaak_id: 1, reden: 'zomaar' }, 'p-ouder');
  assert.equal(res.status, 403);
});

test('een probleem zonder reden wordt geweigerd', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`UPDATE wedstrijdtaken SET persoon_id = 'p-ouder' WHERE id = 1`);
  const res = await meldProbleem(db, { wedstrijdtaak_id: 1 }, 'p-ouder');
  assert.equal(res.status, 400);
});

test('een gemeld probleem komt onafgehandeld in het logboek', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`UPDATE wedstrijdtaken SET persoon_id = 'p-ouder' WHERE id = 1`);
  await meldProbleem(db, { wedstrijdtaak_id: 1, reden: 'ziek' }, 'p-ouder');
  const regel = db._sqlite.prepare(`SELECT * FROM logboek WHERE wat LIKE 'probleem gemeld%'`).get();
  assert.ok(regel);
  assert.equal(regel.afgehandeld, 0, 'vraagt opvolging van een beheerder');
});

test('een gemeld probleem verwittigt de begeleiding, niet de melder zelf', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    UPDATE wedstrijdtaken SET persoon_id = 'p-ouder' WHERE id = 1;
    UPDATE instellingen SET waarde = 'normaal' WHERE sleutel = 'bericht_modus';
  `);
  const mails = [];
  const oude = globalThis.fetch;
  globalThis.fetch = async (url, opties) => {
    if (String(url).includes('resend.com')) mails.push(JSON.parse(opties.body).to);
    return new Response('{}', { status: 200 });
  };
  try {
    await wedstrijdtaakProbleemMelden({
      db, persoon: { id: 'p-ouder' }, seizoen, env,
      request: verzoek('/x', { wedstrijdtaak_id: 1, reden: 'ziek' }),
    });
  } finally {
    globalThis.fetch = oude;
  }
  assert.deepEqual(mails, ['coach@example.org'], 'enkel de coach van dat team');
});

// --- kandidaten -------------------------------------------------------------

test('de kandidatenlijst bevat elk actief clublid, ook zonder band met dat team', async () => {
  const db = zetKlaar();
  const res = await taakKandidaten({ db, rechten: coachRechten, request: verzoek('/x?wedstrijd_id=1') });
  assert.equal(res.status, 200);
  const body = await res.json();
  const ids = body.kandidaten.map((k) => k.id).sort();
  assert.deepEqual(ids, ['p-coach', 'p-ouder'], 'p-inactief valt weg, p-ouder zit er wel bij');
});

test('de kandidatenlijst geeft geen gevoelige velden mee', async () => {
  const db = zetKlaar();
  const res = await taakKandidaten({ db, rechten: coachRechten, request: verzoek('/x?wedstrijd_id=1') });
  const body = await res.json();
  const velden = Object.keys(body.kandidaten[0]).sort();
  assert.deepEqual(velden, ['achternaam', 'id', 'voornaam'], 'geen e-mail, geboortedatum, lidnummer of rel_guid');
});

test('een coach van een ander team krijgt de kandidatenlijst niet', async () => {
  const db = zetKlaar();
  const res = await taakKandidaten({ db, rechten: andereCoachRechten, request: verzoek('/x?wedstrijd_id=1') });
  assert.equal(res.status, 403);
});

test('kandidaten zonder wedstrijd_id geeft 400', async () => {
  const db = zetKlaar();
  const res = await taakKandidaten({ db, rechten: coachRechten, request: verzoek('/x') });
  assert.equal(res.status, 400);
});
