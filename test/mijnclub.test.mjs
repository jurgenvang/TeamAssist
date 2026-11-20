// Mijn club (T7): het venster, welke ploegen iemand ziet, de keuze bewaren,
// de berichten voor wie een ploeg 'op de hoogte houdt', en de migratie.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { maakDb } from './d1.mjs';
import { rechtenVoor } from '../src/lib/rechten-db.js';
import { mijnclubVenster, toonPloegen, volgerRegels, bundelPerPersoon, netteUitslag } from '../src/lib/mijnclub.js';
import { netteUitslag as netteUitslagKaart } from '../public/js/kaart.js';
import { mijnclubTonen, mijnclubKeuzeBewaren } from '../src/routes/mijnclub.js';
import { wedstrijdenSync } from '../src/routes/admin/wedstrijden.js';
import { brusselDatum, plusDagen } from '../src/lib/klok.js';

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');
const seizoen = { code: '2026-27', naam: '2026-2027' };

// --- het venster -----------------------------------------------------------------

test('het venster: van de zaterdag van het vorige weekend tot de zondag van het komende', () => {
  // 20 november 2026 is een vrijdag.
  assert.deepEqual(mijnclubVenster('2026-11-20'), { van: '2026-11-14', tot: '2026-11-22' });
  // Tijdens het weekend telt dat weekend als het komende; het vorige staat er nog in.
  assert.deepEqual(mijnclubVenster('2026-11-21'), { van: '2026-11-14', tot: '2026-11-22' });
  assert.deepEqual(mijnclubVenster('2026-11-22'), { van: '2026-11-14', tot: '2026-11-22' });
  // Vanaf maandag schuift het een week op.
  assert.deepEqual(mijnclubVenster('2026-11-23'), { van: '2026-11-21', tot: '2026-11-29' });
  // Over de jaargrens.
  assert.deepEqual(mijnclubVenster('2026-12-31'), { van: '2026-12-26', tot: '2027-01-03' });
});

// --- welke ploegen ------------------------------------------------------------------

const P = [{ guid: 'A' }, { guid: 'B' }, { guid: 'C' }];
const toon = (eigen, keuzes) => toonPloegen(P, new Set(eigen), keuzes).map((p) => `${p.guid}${p.tonen ? '+' : '-'}${p.op_de_hoogte ? '!' : ''}`);

test('de standaard: mijn ploegen, en alle als ik aan geen enkele hang', () => {
  assert.deepEqual(toon(['B'], []), ['A-', 'B+', 'C-']);
  assert.deepEqual(toon([], []), ['A+', 'B+', 'C+']);
  // Een eigen ploeg die niet gevolgd wordt, telt niet: dan alle.
  assert.deepEqual(toon(['X'], []), ['A+', 'B+', 'C+']);
});

test('op de hoogte houden verandert niets aan wat ik zie; een keuze geldt voor alle ploegen samen', () => {
  assert.deepEqual(toon(['B'], [{ team_guid: 'A', tonen: null, op_de_hoogte: 1 }]), ['A-!', 'B+', 'C-']);
  assert.deepEqual(toon(['B'], [{ team_guid: 'A', tonen: 1, op_de_hoogte: 0 }]), ['A+', 'B-', 'C-'], 'na een keuze staat een ploeg zonder rij uit');
});

// --- wat een volger te horen krijgt ----------------------------------------------------

const ploeg = { guid: 'T', naam: 'Bears G12 A', naam_kort: 'U12 A' };
const was = { datum: '2026-11-21', begin: '10:00', locatie_tekst: 'Ter Bank', uitslag: null };

test('een gewijzigd uur, een andere zaal en een uitslag: elk een regel; een andere tegenstander niet', () => {
  const r = volgerRegels(ploeg, {
    gewijzigd: [
      { datum: '2026-11-21', begin: '11:00', locatie_tekst: 'Ter Bank', thuis: true, tegenstander: 'Gent', was, meldbaar: true },
      { datum: '2026-11-21', begin: '10:00', locatie_tekst: 'Kessel-Lo', thuis: false, tegenstander: 'Lier', was, meldbaar: true },
      { datum: '2026-11-21', begin: '10:00', locatie_tekst: 'Ter Bank', thuis: true, tegenstander: 'Diest', was, meldbaar: true },
      { datum: '2026-11-21', begin: '10:00', locatie_tekst: 'Ter Bank', thuis: true, tegenstander: 'Tienen', was, meldbaar: true, uitslag: '45-40' },
    ],
    uitslag_bijgewerkt: [{ datum: '2026-11-14', thuis: true, tegenstander: 'Aarschot', uitslag: '50-52' }],
    nieuw: [{ datum: '2026-11-28', begin: '10:00' }],
  });
  assert.deepEqual(r.map((x) => x.tekst), [
    'U12 A thuis tegen Gent: nu za 21/11 om 11:00 (was za 21/11 om 10:00)',
    'U12 A uit tegen Lier: nu in Kessel-Lo (was Ter Bank)',
    'U12 A thuis tegen Tienen (za 21/11): 45-40',
    'U12 A thuis tegen Aarschot (za 14/11): 50-52',
  ]);
});

test('in een stille periode (niet meldbaar) geen regel voor een gewijzigd moment', () => {
  const r = volgerRegels(ploeg, { gewijzigd: [{ datum: '2026-08-02', begin: '11:00', locatie_tekst: 'Ter Bank', thuis: true, tegenstander: 'Gent', was, meldbaar: false }] });
  assert.deepEqual(r, []);
});

test('gebundeld: één lijst per persoon, enkel met de ploegen die hij volgt', () => {
  const m = bundelPerPersoon(
    [{ team_guid: 'A', tekst: 'a1' }, { team_guid: 'A', tekst: 'a2' }, { team_guid: 'B', tekst: 'b1' }],
    [{ persoon_id: 'p', team_guid: 'A' }, { persoon_id: 'p', team_guid: 'B' }, { persoon_id: 'q', team_guid: 'C' }]
  );
  assert.deepEqual([...m], [['p', ['a1', 'a2', 'b1']]]);
});

test('een uitslag zonder opvulspaties, in backend en kaart gelijk', () => {
  for (const f of [netteUitslag, netteUitslagKaart]) {
    assert.equal(f(' 62- 58'), '62-58');
    assert.equal(f('062 - 9'), '62-9');
    assert.equal(f(' 20-  0  BFOR'), '20-  0  BFOR', 'een andere vorm blijft zoals ze is');
    assert.equal(f(null), null);
  }
});

// --- de routes ----------------------------------------------------------------------

const dag = (n) => plusDagen(brusselDatum(), n);

function zetKlaar() {
  const db = maakDb();
  const { van, tot } = mijnclubVenster(brusselDatum());
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, naam_kort, categorie, gevolgd) VALUES
      ('A', '2026-27', 'Bears G12 A', 'U12 A', 'G12', 1), ('B', '2026-27', 'Bears G14 A', 'U14 A', 'G14', 1),
      ('Z', '2026-27', 'Bears G10 B', 'U10 B', 'G10', 0);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('ouder', 'O', 'K', 'o@x.be'), ('kind', 'K', 'K', NULL), ('los', 'L', 'L', 'l@x.be');
    INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('ouder', 'kind');
    INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES ('kind', 'A', '2026-27');
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander, locatie_tekst, uitslag) VALUES
      ('W1', 'A', '2026-27', '${van}', '10:00', 1, 'Tienen', 'Ter Bank', '45-40'),
      ('W2', 'B', '2026-27', '${tot}', '14:00', 0, 'Gent', 'Gent Sportpaleis', NULL),
      ('W3', 'A', '2026-27', '${plusDagen(van, -1)}', '10:00', 1, 'Te vroeg', NULL, NULL),
      ('W4', 'A', '2026-27', '${plusDagen(tot, 1)}', '10:00', 1, 'Te laat', NULL, NULL),
      ('W5', 'Z', '2026-27', '${van}', '11:00', 1, 'Niet gevolgd', NULL, NULL);
  `);
  return db;
}

async function ctx(db, id, { body, url = 'https://x/api/mijnclub' } = {}) {
  const persoon = db._sqlite.prepare('SELECT * FROM personen WHERE id = ?').get(id);
  return {
    db, env: {}, seizoen, persoon, rechten: await rechtenVoor(db, id, seizoen.code),
    request: new Request(url, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined }),
  };
}

test('een ouder ziet standaard de ploeg van zijn kind, enkel in het venster en enkel gevolgde ploegen', async () => {
  const db = zetKlaar();
  const r = await (await mijnclubTonen(await ctx(db, 'ouder'))).json();
  assert.deepEqual(r.ploegen.map((p) => [p.guid, p.tonen, p.eigen]), [['A', true, true], ['B', false, false]]);
  assert.equal(r.gekozen, false);
  assert.deepEqual(r.wedstrijden.map((w) => w.tegenstander), ['Tienen']);
  assert.equal(r.wedstrijden[0].ploeg, 'U12 A');
  assert.match(r.wedstrijden[0].wedstrijdblad, /wedguid=W1$/);
});

test('wie aan geen ploeg hangt, ziet alle gevolgde ploegen', async () => {
  const db = zetKlaar();
  const r = await (await mijnclubTonen(await ctx(db, 'los'))).json();
  assert.deepEqual(r.wedstrijden.map((w) => w.tegenstander), ['Tienen', 'Gent']);
});

test('de keuze bewaren: alles of niets, en enkel gevolgde ploegen', async () => {
  const db = zetKlaar();
  const fout = await mijnclubKeuzeBewaren(await ctx(db, 'ouder', { body: { ploegen: [{ team_guid: 'Z', tonen: true, op_de_hoogte: true }] } }));
  assert.equal(fout.status, 400, 'een niet gevolgde ploeg');
  assert.equal((await mijnclubKeuzeBewaren(await ctx(db, 'ouder', { body: { ploegen: [{ team_guid: 'A', tonen: 'ja', op_de_hoogte: false }] } }))).status, 400);
  const ok = await (await mijnclubKeuzeBewaren(await ctx(db, 'ouder', { body: { ploegen: [
    { team_guid: 'A', tonen: false, op_de_hoogte: true }, { team_guid: 'B', tonen: true, op_de_hoogte: false },
  ] } }))).json();
  assert.equal(ok.gekozen, true);
  const r = await (await mijnclubTonen(await ctx(db, 'ouder'))).json();
  assert.deepEqual(r.wedstrijden.map((w) => w.tegenstander), ['Gent']);
  // Opnieuw bewaren vervangt de vorige keuze volledig.
  await mijnclubKeuzeBewaren(await ctx(db, 'ouder', { body: { ploegen: [{ team_guid: 'B', tonen: true, op_de_hoogte: false }] } }));
  assert.equal(db._sqlite.prepare(`SELECT COUNT(*) n FROM mijnclub_ploegen WHERE persoon_id = 'ouder'`).get().n, 1);
});

test('na een ophaling: één bericht voor wie de ploeg op de hoogte houdt, niets voor de anderen', async () => {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, naam_kort, categorie, gevolgd) VALUES ('T1', '2026-27', 'Bears J16 B', 'U16 B', 'J16', 1);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('admin', 'A', 'B', NULL),
      ('volger', 'V', 'G', 'volger@x.be'), ('kijker', 'K', 'IJ', 'kijker@x.be');
    INSERT INTO mijnclub_ploegen (persoon_id, team_guid, tonen, op_de_hoogte) VALUES ('volger', 'T1', 1, 1), ('kijker', 'T1', 1, 0);
    UPDATE instellingen SET waarde = 'normaal' WHERE sleutel = 'bericht_modus';
  `);
  const datum = dag(-1).split('-').reverse().join('-');
  const rij = (gespeeld, uitslag) => [{
    guid: 'W1', tTGUID: 'T1', tTNaam: 'U16 B', tUGUID: 'X', tUNaam: 'Gent',
    datumString: datum, beginTijd: '10.30', accGUID: 'A', accNaam: 'Ter Bank', gespeeld, uitslag, wedOff: [],
  }];
  const mails = [];
  const oude = globalThis.fetch;
  const met = (antwoord) => async (url, opties) => {
    if (String(url).includes('resend.com')) { mails.push(JSON.parse(opties.body)); return new Response('{"id":"x"}'); }
    return new Response(JSON.stringify(antwoord));
  };
  const sync = () => wedstrijdenSync({ db, persoon: { id: 'admin' }, seizoen, env: { RESEND_API_KEY: 'x' }, request: new Request('https://x/?uitvoeren=1', { method: 'POST' }) });
  try {
    globalThis.fetch = met(rij('N', null));
    await sync(); // nieuw: geen bericht
    assert.equal(mails.length, 0);
    globalThis.fetch = met(rij('G', '62- 58'));
    await sync(); // de uitslag komt binnen
  } finally {
    globalThis.fetch = oude;
  }
  assert.equal(mails.length, 1);
  assert.deepEqual([mails[0].to].flat(), ['volger@x.be']);
  assert.match(mails[0].subject, /Mijn club — 1 wijziging/);
  assert.match(mails[0].text ?? mails[0].html, /U16 B thuis tegen Gent .*: 62-58/);
  // Dezelfde uitslag in een andere vorm (zonder opvulspaties) is geen nieuwe uitslag.
  try {
    globalThis.fetch = met(rij('G', '62-58'));
    await sync();
  } finally {
    globalThis.fetch = oude;
  }
  assert.equal(mails.length, 1);
});

// --- schema en migratie -------------------------------------------------------------

test('migratie-0.46.0.sql: het schema van 0.45.0 plus de migratie is het schema van nu, en opnieuw kan', () => {
  const nu = lees('../schema.sql');
  const oud = nu.replace(/-- Mijn club \(T7, 0\.46\.0\)[\s\S]*?CREATE INDEX idx_mijnclub_op_de_hoogte[^\n]*\n\n/, '');
  assert.notEqual(oud, nu, 'de tabel staat in schema.sql');
  const vorm = (sql) => {
    const db = new DatabaseSync(':memory:');
    db.exec(sql);
    return {
      kolommen: db.prepare(`PRAGMA table_info(mijnclub_ploegen)`).all().map((k) => `${k.name} ${k.type} ${k.notnull} ${k.dflt_value} ${k.pk}`),
      indexen: db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'mijnclub_ploegen' AND sql IS NOT NULL`).all().map((i) => i.name),
    };
  };
  const migratie = lees('../migratie-0.46.0.sql');
  assert.deepEqual(vorm(`${oud}\n${migratie}`), vorm(nu));
  const db = new DatabaseSync(':memory:');
  db.exec(`${oud}\n${migratie}`);
  db.exec(migratie); // een tweede keer kan geen kwaad
});
