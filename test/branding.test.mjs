// Clubkleur en logo.
//
// Het zwaartepunt: een voorstel schrijft nooit rechtstreeks naar de
// instellingen, en een afgekeurde kleur wordt geweigerd bij het bewaren, niet
// stilzwijgend aangepast.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { brandingVoorstel, brandingTonen } from '../src/routes/admin/branding.js';
import { instellingBewaren, instellingenTonen } from '../src/routes/admin/instellingen.js';

const persoon = { id: 'p-admin' };

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p-admin', 'A', 'B');
  `);
  return db;
}

function verzoek(pad = '/x', body) {
  return new Request(`https://x${pad}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined });
}

test('het voorstel opvragen vraagt systeem.beheren', () => {
  const route = ROUTES.find((r) => r.pad === '/api/admin/branding-voorstel');
  assert.equal(route.recht, 'systeem.beheren');
  assert.notEqual(route.publiek, true);
});

test('/api/branding is publiek', () => {
  const route = ROUTES.find((r) => r.pad === '/api/branding');
  assert.equal(route.publiek, true);
});

test('een voorstel bevat de logo-URL, afgeleid uit het club-GUID', async () => {
  const db = zetKlaar();
  const oude = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ guid: 'BVBL1125', teams: [] }), { status: 200 });
  try {
    const res = await brandingVoorstel({ db, persoon });
    const body = await res.json();
    assert.equal(body.logo_url, 'https://vblapi1.wisseq.eu/vbldataOrgLogo/BVBL1125_small.jpg');
    assert.equal(body.logo_url_geverifieerd, false, 'het patroon is niet uit de officiële documentatie bevestigd');
  } finally {
    globalThis.fetch = oude;
  }
});

test('een shirtkleur die geen hex is, wordt getoond maar niet als bruikbaar gemarkeerd', async () => {
  const db = zetKlaar();
  const oude = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ guid: 'BVBL1125', shirtKleur: 'rood', teams: [] }), { status: 200 });
  try {
    const res = await brandingVoorstel({ db, persoon });
    const body = await res.json();
    assert.equal(body.shirt_kleur_ruw, 'rood');
    assert.equal(body.shirt_kleur_bruikbaar.ok, false);
  } finally {
    globalThis.fetch = oude;
  }
});

test('een geldige hexkleur die te licht is, wordt afgekeurd in het voorstel', async () => {
  const db = zetKlaar();
  const oude = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ guid: 'BVBL1125', shirtKleur: '#ffff00', teams: [] }), { status: 200 });
  try {
    const res = await brandingVoorstel({ db, persoon });
    const body = await res.json();
    assert.equal(body.shirt_kleur_bruikbaar.ok, false);
    assert.match(body.shirt_kleur_bruikbaar.reden, /contrast/);
  } finally {
    globalThis.fetch = oude;
  }
});

test('een voorstel schrijft nooit naar de instellingen', async () => {
  const db = zetKlaar();
  const oude = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ guid: 'BVBL1125', shirtKleur: '#a4232b', teams: [] }), { status: 200 });
  try {
    await brandingVoorstel({ db, persoon });
    const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM instellingen WHERE sleutel = 'clubkleur_accent'`).get().n;
    assert.equal(aantal, 0);
  } finally {
    globalThis.fetch = oude;
  }
});

test('een goedgekeurde kleur bewaren zet ze in de instellingen', async () => {
  const db = zetKlaar();
  const res = await instellingBewaren({ db, persoon, request: verzoek('/x', { sleutel: 'clubkleur_accent', waarde: '#a4232b' }) });
  assert.equal(res.status, 200);
  const rij = db._sqlite.prepare(`SELECT waarde FROM instellingen WHERE sleutel = 'clubkleur_accent'`).get();
  assert.equal(rij.waarde, '#a4232b');
});

test('een te lichte kleur bewaren wordt geweigerd, niet aangepast', async () => {
  const db = zetKlaar();
  const res = await instellingBewaren({ db, persoon, request: verzoek('/x', { sleutel: 'clubkleur_accent', waarde: '#ffff00' }) });
  assert.equal(res.status, 400);
  const rij = db._sqlite.prepare(`SELECT waarde FROM instellingen WHERE sleutel = 'clubkleur_accent'`).get();
  assert.equal(rij, undefined, 'er hoort geen enkele waarde weggeschreven te zijn, ook geen aangepaste');
});

test('een lege clubkleur (terug naar standaard) is toegelaten', async () => {
  const db = zetKlaar();
  const res = await instellingBewaren({ db, persoon, request: verzoek('/x', { sleutel: 'clubkleur_accent', waarde: '' }) });
  assert.equal(res.status, 200);
});

test('/api/branding geeft enkel een geldige kleur terug, nooit een ongeldige', async () => {
  const db = zetKlaar();
  db._sqlite.exec(
    `UPDATE instellingen SET waarde = 'niet-geldig' WHERE sleutel = 'clubkleur_accent'`
  );
  // Kan nul rijen raken als de instelling nog niet bestaat; dat is prima —
  // de test hieronder dekt beide gevallen.
  db._sqlite.exec(`
    INSERT OR IGNORE INTO instellingen (sleutel, waarde) VALUES ('clubkleur_accent', 'niet-geldig');
  `);
  const res = await brandingTonen({ db });
  const body = await res.json();
  assert.equal(body.kleur_accent, null);
});

test('/api/branding toont een geldige clubkleur wel', async () => {
  const db = zetKlaar();
  await instellingBewaren({ db, persoon, request: verzoek('/x', { sleutel: 'clubkleur_accent', waarde: '#0d1a2b' }) });
  const res = await brandingTonen({ db });
  const body = await res.json();
  assert.equal(body.kleur_accent, '#0d1a2b');
});

test('de instellingenlijst bevat de drie huisstijlvelden', async () => {
  const db = zetKlaar();
  const res = await instellingenTonen({ db });
  const body = await res.json();
  assert.ok('clubkleur_accent' in body.instellingen);
  assert.ok('clublogo_url' in body.instellingen);
  assert.ok('clublogo_bron' in body.instellingen);
});

test('de instellingenlijst bevat nu ook clubkleur_topbalk', async () => {
  const db = zetKlaar();
  const res = await instellingenTonen({ db });
  const body = await res.json();
  assert.ok('clubkleur_topbalk' in body.instellingen);
});

test('een felle merkkleur wordt geweigerd als accent maar aanvaard als topbalkkleur', async () => {
  const db = zetKlaar();
  const alsAccent = await instellingBewaren({
    db, persoon, request: verzoek('/x', { sleutel: 'clubkleur_accent', waarde: '#f5821f' }),
  });
  assert.equal(alsAccent.status, 400);

  const alsTopbalk = await instellingBewaren({
    db, persoon, request: verzoek('/x', { sleutel: 'clubkleur_topbalk', waarde: '#f5821f' }),
  });
  assert.equal(alsTopbalk.status, 200);
});

test('/api/branding geeft de topbalkkleur mee met de juiste tekstkleur', async () => {
  const db = zetKlaar();
  await instellingBewaren({
    db, persoon, request: verzoek('/x', { sleutel: 'clubkleur_topbalk', waarde: '#f5821f' }),
  });
  const res = await brandingTonen({ db });
  const body = await res.json();
  assert.equal(body.kleur_topbalk, '#f5821f');
  assert.equal(body.kleur_topbalk_tekst, '#000000');
});

test('/api/branding geeft geen topbalkkleur wanneer er geen ingesteld is', async () => {
  const db = zetKlaar();
  const res = await brandingTonen({ db });
  const body = await res.json();
  assert.equal(body.kleur_topbalk, null);
  assert.equal(body.kleur_topbalk_tekst, null);
});

test('/api/branding geeft ook de leesbare tekstkleur voor de accentkleur als achtergrond (dark mode)', async () => {
  const db = zetKlaar();
  await instellingBewaren({
    db, persoon, request: verzoek('/x', { sleutel: 'clubkleur_accent', waarde: '#a4232b' }),
  });
  const res = await brandingTonen({ db });
  const body = await res.json();
  assert.equal(body.kleur_accent, '#a4232b');
  assert.equal(body.kleur_accent_op_vlak_tekst, '#ffffff');
});

test('zonder accentkleur is kleur_accent_op_vlak_tekst ook null', async () => {
  const db = zetKlaar();
  const res = await brandingTonen({ db });
  const body = await res.json();
  assert.equal(body.kleur_accent_op_vlak_tekst, null);
});

test('een ongeldige waarde in clubkleur_topbalk wordt door /api/branding genegeerd', async () => {
  const db = zetKlaar();
  db._sqlite.exec(
    `INSERT INTO instellingen (sleutel, waarde) VALUES ('clubkleur_topbalk', 'niet-geldig')`
  );
  const res = await brandingTonen({ db });
  const body = await res.json();
  assert.equal(body.kleur_topbalk, null);
});
