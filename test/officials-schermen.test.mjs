// De schermen van de module Officials (0.38.0, I1 fase 4a): Aanduidingen,
// Mijn vergoeding en de voorkeuren van een official.
//
// Er draait hier geen browser: de zuivere hulpjes worden echt uitgevoerd, de
// schermen als tekst gelezen, en de twee nieuwe backendstukken (wie official
// is bij /api/mij, de voorkeuren) tegen de databank getest. Het scherm zelf
// is met een nep-API in Chromium bekeken (WIJZIGINGEN-0.38.0.md).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maakDb } from './d1.mjs';
import { rechtenVoor } from '../src/lib/rechten-db.js';
import { mij } from '../src/routes/mij.js';
import { officialsVoorkeurenTonen, officialsVoorkeurenBewaren } from '../src/officials/voorkeuren.js';
import { herinner } from '../src/officials/herinneringen.js';
import { plusDagen, brusselDatum } from '../src/lib/klok.js';
import {
  dagVan, maandLabel, sectieVoor, forfaitTekst, grensMaand, internationaal, alsBedrag,
} from '../public/js/officials-hulp.js';

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');
const scherm = lees('../public/js/schermen/aanduidingen.js');
const vergoeding = lees('../public/js/schermen/mijn-vergoeding.js');
const voorkeuren = lees('../public/js/schermen/officials-voorkeuren.js');
const app = lees('../public/js/app.js');
const html = lees('../public/index.html');
const seizoen = { code: '2026-27', naam: '2026-2027' };

// --- de zuivere hulpjes -------------------------------------------------------

test('hulpjes: dag, maand, sectie, forfait, grens, gsm, bedrag', () => {
  assert.deepEqual(dagVan('2026-11-14'), { dag: 'za', nr: 14 });
  assert.equal(maandLabel('2026-11'), 'november 2026');
  assert.equal(sectieVoor({ toegewezen: true, beschikbaarheid: 'nee' }), 'aangeduid');
  assert.equal(sectieVoor({ toegewezen: false, beschikbaarheid: null }), 'open');
  assert.equal(sectieVoor({ toegewezen: false, beschikbaarheid: 'ja' }), 'beantwoord');
  assert.equal(sectieVoor({ toegewezen: false, beschikbaarheid: null, forfait: 'uit' }), 'beantwoord', 'een forfait vraagt geen antwoord');
  assert.equal(forfaitTekst('thuis'), 'forfait thuisploeg');
  assert.equal(grensMaand(new Date('2026-11-30T12:00:00Z')), '2027-01');
  assert.equal(internationaal('0470 12 34 56'), '32470123456');
  assert.equal(internationaal('+31 6 1234 5678'), '31612345678');
  assert.equal(internationaal('0032 470 123456'), '32470123456');
  assert.equal(alsBedrag(-1550), '− € 15,50');
});

// --- de schermen, als tekst ---------------------------------------------------------

test('elke oproep van het official-scherm geeft namens mee', () => {
  // Een ouder vult in voor zijn kind; zonder namens zou het antwoord op de
  // rij van de ouder belanden (of geweigerd worden).
  for (const pad of ['/api/officials/beschikbaarheid', '/api/officials/probleem']) {
    const start = scherm.indexOf(`'${pad}'`);
    assert.ok(start > 0, pad);
    assert.match(scherm.slice(start, start + 200), /namens: staat\.namens/, pad);
  }
  assert.match(scherm, /metNamens\('\/api\/officials\/wedstrijden'\)/);
  assert.match(vergoeding, /\/api\/officials\/vergoeding\$\{namens \?/);
  assert.match(voorkeuren, /namens,\s*herinner_avond/);
  assert.match(voorkeuren, /\{ namens, vernieuw \}/);
});

test('namen en teksten uit de databank worden ontsmet', () => {
  for (const veld of ['w.ploeg', 'w.tegenstander', 'o.naam', 'w.locatie', 'k.naam']) {
    assert.ok(scherm.includes(`veilig(${veld}`), veld);
  }
  assert.ok(vergoeding.includes('veilig(wedstrijdTekst(w))'));
  assert.ok(voorkeuren.includes('veilig(url)'));
});

test('de sectie-indeling ligt vast per bezoek, de teller niet', () => {
  assert.match(scherm, /if \(!staat\.sectieVast\) staat\.sectieVast = new Map/);
  assert.match(scherm, /const nogOpen = staat\.wedstrijden\.filter\(\(w\) => sectieVoor\(w\) === 'open'\)/);
});

test('een nieuwe agendalink vraagt bevestiging, want de oude stopt te werken', () => {
  assert.match(voorkeuren, /if \(vernieuw && !confirm\(/);
});

test('Aanduidingen, Mijn vergoeding en de voorkeuren hangen aan official of ouder van een official', () => {
  assert.match(app, /metOfficials = isOfficial \|\| kinderen\.length > 0/);
  assert.match(app, /el\('naammenu-vergoeding'\)\.hidden = !metOfficials/);
  assert.match(app, /\{ ouderVanOfficial: kinderen\.length > 0 \}/);
  for (const id of ['tab-aanduidingen', 'vergoedingscherm', 'officialsvoorkeuren', 'naammenu-vergoeding']) {
    const start = html.indexOf(`id="${id}"`);
    assert.ok(start > 0, id);
    assert.match(html.slice(start, html.indexOf('>', start)), /hidden/, `${id} staat standaard verborgen`);
  }
});

// --- de backend -------------------------------------------------------------------

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    UPDATE instellingen SET waarde = 'normaal' WHERE sleutel = 'bericht_modus';
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd, officials) VALUES ('T12', '2026-27', 'Bears G12 A', 'G12', 0, 1);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('ouder', 'Olga', 'Kind', 'olga@x.be'), ('kind', 'Kim', 'Kind', NULL), ('speler', 'Sam', 'Kind', NULL),
      ('ann', 'Ann', 'Aerts', 'ann@x.be'), ('vreemd', 'Vic', 'Vreemd', 'vic@x.be');
    INSERT INTO rollen (persoon_id, rol) VALUES ('kind', 'YO'), ('ann', 'YOPLUS');
    INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('ouder', 'kind'), ('ouder', 'speler');
  `);
  return db;
}

async function ctx(db, persoonId, { body, url = 'https://x/' } = {}) {
  return {
    db, env: { RESEND_API_KEY: 'x' }, seizoen, persoon: { id: persoonId },
    rechten: await rechtenVoor(db, persoonId, seizoen.code),
    request: new Request(url, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined }),
  };
}
const json = async (res) => ({ status: res.status, ...(await res.json()) });

test('/api/mij: de kinderen die official zijn, niet de andere', async () => {
  const db = zetKlaar();
  const c = await ctx(db, 'ouder');
  const r = await json(await mij({ ...c, persoon: { id: 'ouder', voornaam: 'Olga', achternaam: 'Kind' } }));
  assert.deepEqual(r.officials_kinderen, [{ id: 'kind', naam: 'Kim Kind' }]);
  const a = await json(await mij({ ...(await ctx(db, 'ann')), persoon: { id: 'ann', voornaam: 'Ann', achternaam: 'Aerts' } }));
  assert.deepEqual(a.officials_kinderen, []);
});

test('voorkeuren: standaard alles aan, enkel wat meegegeven is verandert, ook namens een kind', async () => {
  const db = zetKlaar();
  assert.deepEqual(
    (({ herinner_avond, herinner_ochtend, gsm_delen }) => ({ herinner_avond, herinner_ochtend, gsm_delen }))(
      await json(await officialsVoorkeurenTonen(await ctx(db, 'ann')))
    ),
    { herinner_avond: true, herinner_ochtend: true, gsm_delen: true }
  );
  await officialsVoorkeurenBewaren(await ctx(db, 'ann', { body: { herinner_ochtend: false } }));
  const na = await json(await officialsVoorkeurenTonen(await ctx(db, 'ann')));
  assert.deepEqual([na.herinner_avond, na.herinner_ochtend, na.gsm_delen], [true, false, true]);
  await officialsVoorkeurenBewaren(await ctx(db, 'ann', { body: { gsm_delen: false } }));
  const daarna = await json(await officialsVoorkeurenTonen(await ctx(db, 'ann')));
  assert.equal(daarna.herinner_ochtend, false, 'wat eerder uit stond, blijft uit');
  assert.equal((await officialsVoorkeurenBewaren(await ctx(db, 'ann', { body: { gsm_delen: 'ja' } }))).status, 400);

  const k = await json(await officialsVoorkeurenBewaren(await ctx(db, 'ouder', { body: { namens: 'kind', herinner_avond: false } })));
  assert.equal(k.namens.naam, 'Kim Kind');
  assert.equal(db._sqlite.prepare(`SELECT herinner_avond FROM officials_voorkeuren WHERE persoon_id = 'kind'`).get().herinner_avond, 0);

  assert.equal((await officialsVoorkeurenTonen(await ctx(db, 'ouder'))).status, 403, 'de ouder zelf is geen official');
  assert.equal((await officialsVoorkeurenTonen(await ctx(db, 'ouder', { url: 'https://x/?namens=speler' }))).status, 403, 'een kind dat geen official is');
  assert.equal((await officialsVoorkeurenBewaren(await ctx(db, 'vreemd', { body: { namens: 'kind', herinner_avond: true } }))).status, 403);
});

test('een herinnering die uitgezet is via de voorkeuren, vertrekt niet', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander)
      VALUES ('W1', 'T12', '2026-27', '${plusDagen(brusselDatum(), 1)}', '10:00', 1, 'Tienen');
    INSERT INTO officials_wedstrijd (wedstrijd_id, cat_code, scope) SELECT id, 'G12', 1 FROM wedstrijden;
    INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id) SELECT id, 'ann' FROM wedstrijden;
  `);
  await officialsVoorkeurenBewaren(await ctx(db, 'ann', { body: { herinner_avond: false } }));
  const oude = globalThis.fetch;
  let mails = 0;
  globalThis.fetch = async () => { mails += 1; return new Response('{}'); };
  try {
    await herinner({ db, env: { RESEND_API_KEY: 'x' }, seizoen }, { avond: true });
  } finally {
    globalThis.fetch = oude;
  }
  assert.equal(mails, 0);
});
