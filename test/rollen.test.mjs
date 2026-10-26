// Welke rollen er zijn, staat op vijf plaatsen: de rechtenlaag, de CHECK in
// het schema, de route die een rol koppelt, en twee schermen. Sinds 0.30.0
// (YOADM, YO, YOPLUS) legt deze test ze naast elkaar: een rol die op één
// plaats ontbreekt, valt anders pas op wanneer iemand hem probeert toe te
// kennen — en dan krijg je een CHECK-fout of een teamveld dat niet verdwijnt.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLRECHTEN } from '../src/lib/rechten.js';

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');
const lijst = (bron, naam) => {
  const m = bron.match(new RegExp(`const ${naam} = \\[([^\\]]*)\\]`));
  assert.ok(m, `${naam} niet gevonden`);
  return [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort();
};

// SPELER en OUVO volgen uit team_spelers en ouder_kind; ze worden nooit
// toegekend en staan dus niet in de rollen-tabel.
const AFGELEID = ['SPELER', 'OUVO'];
const toekenbaar = Object.keys(ROLRECHTEN).filter((r) => !AFGELEID.includes(r)).sort();
const clubbreed = toekenbaar.filter((r) => ROLRECHTEN[r].bereik === 'globaal').sort();

test('de CHECK op rollen kent precies de toekenbare rollen', () => {
  const schema = lees('../schema.sql');
  const blok = schema.slice(schema.indexOf('CREATE TABLE rollen'), schema.indexOf('CREATE UNIQUE INDEX idx_rollen_uniek'));
  const inCheck = [...blok.match(/CHECK \(rol IN \(([^)]*)\)\)/)[1].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(inCheck, toekenbaar);
  const clubbreedInCheck = [...blok.match(/\(rol IN \(([^)]*)\) AND team_guid IS NULL/)[1].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(clubbreedInCheck, clubbreed);
});

test('de koppelroute en de schermen kennen dezelfde rollen als de rechtenlaag', () => {
  const route = lees('../src/routes/admin/persoon.js');
  assert.deepEqual(lijst(route, 'GELDIGE_ROLLEN'), toekenbaar);
  assert.deepEqual(lijst(route, 'CLUBBREDE_ROLLEN'), clubbreed);
  assert.deepEqual(lijst(lees('../public/js/schermen/persoon.js'), 'CLUBBREDE_ROLLEN'), clubbreed);
  assert.deepEqual(lijst(lees('../public/js/schermen/testrol.js'), 'CLUBBREED'), clubbreed);
  assert.deepEqual(lijst(lees('../public/js/schermen/testrol.js'), 'ROLLEN'), [...toekenbaar, ...AFGELEID].sort());
});

test('elke toekenbare rol staat als keuze bij het persoonsscherm', () => {
  const html = lees('../public/index.html');
  const blok = html.slice(html.indexOf('<select id="persoonrolkeuze">'), html.indexOf('</select>', html.indexOf('<select id="persoonrolkeuze">')));
  const keuzes = [...blok.matchAll(/value="(\w+)"/g)].map((x) => x[1]).sort();
  assert.deepEqual(keuzes, toekenbaar);
});
