// Een mededeling plaatsen (0.28.0).
//
// Het zwaartepunt: eerst een droogloop, en de ontvangers zijn precies de
// doelgroep met een account — niet meer, en zeker niet wie nooit aanmeldde.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { mededelingPlaatsen, mededelingIntrekken, mededelingHuidige, keurMededelingGoed } from '../src/routes/admin/mededeling.js';
import { ontvangers } from '../src/lib/doelgroep.js';

const T1 = 'BVBL1125J16  2';
const seizoen = { code: '2026-27', naam: '2026-2027' };
const morgen = () => new Date(Date.now() + 86400000).toISOString();

function zetKlaar(modus = 'normaal') {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie) VALUES ('${T1}', '2026-27', 'J16 B', 'J16');
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('admin', 'Ad', 'Min', 'admin@x.be'), ('speler', 'Sp', 'E', 's@x.be'),
      ('ouder', 'Ou', 'D', 'o@x.be'), ('coach', 'Co', 'A', 'c@x.be'),
      ('nooit', 'Nooit', 'Aangemeld', 'n@x.be'), ('weg', 'Niet', 'Actief', 'w@x.be');
    UPDATE personen SET actief = 0 WHERE id = 'weg';
    INSERT INTO accounts (sub, persoon_id, email) VALUES
      ('s1', 'admin', 'admin@x.be'), ('s2', 'speler', 's@x.be'), ('s3', 'ouder', 'o@x.be'),
      ('s4', 'coach', 'c@x.be'), ('s6', 'weg', 'w@x.be');
    INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES ('speler', '${T1}', '2026-27'), ('nooit', '${T1}', '2026-27');
    INSERT INTO rollen (persoon_id, rol, team_guid, seizoen) VALUES ('coach', 'COACH', '${T1}', '2026-27');
    INSERT INTO rollen (persoon_id, rol) VALUES ('admin', 'ADMIN');
    UPDATE instellingen SET waarde = '${modus}' WHERE sleutel = 'bericht_modus';
  `);
  return db;
}

const verzoek = (body) => new Request('https://x', { method: 'POST', body: JSON.stringify(body) });
const ctx = (db, body) => ({ db, env: { RESEND_API_KEY: 'x' }, persoon: { id: 'admin' }, seizoen, request: verzoek(body) });
const plaats = async (db, over = {}) =>
  (await mededelingPlaatsen(ctx(db, { tekst: 'Algemene vergadering', geldig_tot: morgen(), ...over }))).json();

function vangFetch() {
  const oproepen = [];
  globalThis.fetch = async (url, opties) => {
    oproepen.push({ url, body: JSON.parse(opties.body) });
    return new Response('{"data":[]}', { status: 200 });
  };
  return oproepen;
}

test('zonder uitvoeren is het een droogloop: niets bewaard, niets verstuurd', async () => {
  const db = zetKlaar();
  const oproepen = vangFetch();
  try {
    const uit = await plaats(db);
    assert.equal(uit.uitgevoerd, false);
    assert.equal(uit.ontvangers, 4);
    assert.equal(oproepen.length, 0);
    assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM mededelingen`).get().n, 0);
  } finally {
    delete globalThis.fetch;
  }
});

test('iedereen = elke actieve persoon met een account, niet wie nooit aanmeldde of inactief is', async () => {
  const db = zetKlaar();
  const ids = (await ontvangers(db, { doelgroep: 'iedereen', seizoen: '2026-27' })).map((o) => o.id);
  assert.deepEqual(ids, ['admin', 'coach', 'ouder', 'speler']);
});

test('ploeg = spelers, ouders en begeleiding van die ploeg, met een account', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('ouder', 'speler')`);
  const ids = (await ontvangers(db, { doelgroep: 'ploeg', team_guid: T1, seizoen: '2026-27' })).map((o) => o.id);
  assert.deepEqual(ids, ['coach', 'ouder', 'speler']);
});

test('begeleiding = wie COORD, COACH of PLOEGV is in het seizoen', async () => {
  const db = zetKlaar();
  const ids = (await ontvangers(db, { doelgroep: 'begeleiding', seizoen: '2026-27' })).map((o) => o.id);
  assert.deepEqual(ids, ['coach']);
});

test('uitvoeren bewaart de mededeling, mailt in één batch en vult Mijn berichten', async () => {
  const db = zetKlaar();
  const oproepen = vangFetch();
  try {
    const uit = await plaats(db, { uitvoeren: true, link: 'https://club.be/av', link_tekst: 'Agenda' });
    assert.equal(uit.verstuurd, 4);
    assert.equal(oproepen.length, 1, 'één oproep voor vier mails');
    assert.match(oproepen[0].url, /emails\/batch$/);
    assert.equal(oproepen[0].body.length, 4);
    assert.match(oproepen[0].body[0].text, /Agenda: https:\/\/club\.be\/av/);
  } finally {
    delete globalThis.fetch;
  }
  const rij = db._sqlite.prepare(`SELECT soort, kort FROM berichten WHERE persoon_id = 'speler'`).get();
  assert.equal(rij.soort, 'nieuws');
  assert.equal(rij.kort, 'Algemene vergadering');
});

test('meer dan honderd ontvangers gaan in groepen van honderd', async () => {
  const db = zetKlaar();
  const ins = db._sqlite.prepare(`INSERT INTO personen (id, email) VALUES (?, ?)`);
  const acc = db._sqlite.prepare(`INSERT INTO accounts (sub, persoon_id, email) VALUES (?, ?, ?)`);
  for (let i = 0; i < 150; i++) { ins.run(`p${i}`, `p${i}@x.be`); acc.run(`sub${i}`, `p${i}`, `p${i}@x.be`); }
  const oproepen = vangFetch();
  try {
    const uit = await plaats(db, { uitvoeren: true });
    assert.equal(uit.verstuurd, 154);
    assert.deepEqual(oproepen.map((o) => o.body.length), [100, 54]);
  } finally {
    delete globalThis.fetch;
  }
});

test('een mislukte batch komt niet in Mijn berichten en staat open in het logboek', async () => {
  const db = zetKlaar();
  globalThis.fetch = async () => new Response('stuk', { status: 500 });
  try {
    const uit = await plaats(db, { uitvoeren: true });
    assert.equal(uit.verstuurd, 0);
    assert.equal(uit.mislukt, 4);
  } finally {
    delete globalThis.fetch;
  }
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM berichten`).get().n, 0);
  const regel = db._sqlite.prepare(`SELECT afgehandeld FROM logboek WHERE wat = 'bericht versturen mislukt'`).get();
  assert.equal(regel.afgehandeld, 0);
});

test('omleiden stuurt één mail naar het testadres, niet één per ontvanger', async () => {
  const db = zetKlaar('omleiden');
  db._sqlite.exec(`UPDATE instellingen SET waarde = 'test@x.be' WHERE sleutel = 'bericht_omleidadres'`);
  const oproepen = vangFetch();
  try {
    const uit = await plaats(db, { uitvoeren: true });
    assert.equal(uit.omgeleid, true);
    assert.equal(oproepen.length, 1);
    assert.equal(oproepen[0].body.to, 'test@x.be');
    assert.match(oproepen[0].body.text, /bedoeld voor 4 ontvanger/);
  } finally {
    delete globalThis.fetch;
  }
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM berichten`).get().n, 0);
});

test('enkel de banner: geen mail, geen berichten', async () => {
  const db = zetKlaar();
  const oproepen = vangFetch();
  try {
    const uit = await plaats(db, { uitvoeren: true, bericht: false });
    assert.equal(uit.ontvangers, 0);
    assert.equal(oproepen.length, 0);
  } finally {
    delete globalThis.fetch;
  }
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM mededelingen WHERE actief = 1`).get().n, 1);
});

test('een nieuwe mededeling vervangt de vorige; intrekken haalt de banner weg', async () => {
  const db = zetKlaar();
  vangFetch();
  try {
    await plaats(db, { uitvoeren: true, bericht: false, tekst: 'eerste' });
    await plaats(db, { uitvoeren: true, bericht: false, tekst: 'tweede' });
  } finally {
    delete globalThis.fetch;
  }
  const huidig = await (await mededelingHuidige({ db })).json();
  assert.equal(huidig.mededeling.tekst, 'tweede');
  await mededelingIntrekken({ db, persoon: { id: 'admin' } });
  assert.equal((await (await mededelingHuidige({ db })).json()).mededeling, null);
});

test('een ploeg die niet in het seizoen bestaat, wordt geweigerd', async () => {
  const db = zetKlaar();
  const res = await mededelingPlaatsen(ctx(db, { tekst: 'Hallo ploeg', geldig_tot: morgen(), doelgroep: 'ploeg', team_guid: 'BESTAATNIET' }));
  assert.equal(res.status, 400);
});

test('de invoer wordt nagekeken', () => {
  const nu = new Date('2026-10-25T10:00:00Z');
  const goed = { tekst: 'Hallo', geldig_tot: '2026-10-26T10:00:00Z' };
  assert.ok(keurMededelingGoed({ ...goed, tekst: 'x' }, nu).fout);
  assert.ok(keurMededelingGoed({ ...goed, tekst: 'x'.repeat(501) }, nu).fout);
  assert.ok(keurMededelingGoed({ ...goed, geldig_tot: '2026-10-24T10:00:00Z' }, nu).fout, 'verleden');
  assert.ok(keurMededelingGoed({ ...goed, link: 'javascript:alert(1)' }, nu).fout, 'enkel http(s)');
  assert.ok(keurMededelingGoed({ ...goed, doelgroep: 'ploeg' }, nu).fout, 'ploeg zonder ploeg');
  assert.ok(keurMededelingGoed({ ...goed, doelgroep: 'vrienden' }, nu).fout);
  assert.equal(keurMededelingGoed(goed, nu).geldig_tot, '2026-10-26T10:00:00.000Z');
});
