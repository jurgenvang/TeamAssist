// Regio en de beheerdelen van de officials (0.41.0, I1 fase 4d).
//
// De instellingen van de module (backend), wie welke secties van Dagelijks
// beheer en Configuratie ziet, Regio als zuivere functie en als tekst. In
// Chromium bekeken tegen de echte handlers (WIJZIGINGEN-0.41.0.md).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { officialsInstellingenTonen, officialsInstellingBewaren } from '../src/officials/instellingen.js';
import { bouwRechten } from '../src/lib/rechten.js';
import { menuTabbladen, tabbalkTabbladen } from '../public/js/navigatie.js';
import { bronVanDag } from '../public/js/schermen/regio.js';

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');
const html = lees('../public/index.html');
const app = lees('../public/js/app.js');
const beheer = lees('../public/js/schermen/officials-beheer.js');
const regio = lees('../public/js/schermen/regio.js');

// --- de instellingen van de module ---------------------------------------------

const ctx = (db, body) => ({
  db, persoon: { id: 'baas' },
  request: new Request('https://x/', { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined }),
});
const json = async (res) => ({ status: res.status, ...(await res.json()) });

test('instellingen van de module: standaard, bewaren, en enkel deze twee', async () => {
  const db = maakDb();
  const voor = await json(await officialsInstellingenTonen(ctx(db)));
  assert.deepEqual([voor.instellingen.forfait_aanduiding.waarde, voor.instellingen.extern_namen.waarde], ['vrijgeven', 'initialen']);

  assert.equal((await officialsInstellingBewaren(ctx(db, { sleutel: 'forfait_aanduiding', waarde: 'melden' }))).status, 200);
  const na = await json(await officialsInstellingenTonen(ctx(db)));
  assert.equal(na.instellingen.forfait_aanduiding.waarde, 'melden');
  assert.match(db._sqlite.prepare(`SELECT details FROM logboek WHERE wat LIKE 'instelling forfait%'`).get().details, /vrijgeven → melden/);

  assert.equal((await officialsInstellingBewaren(ctx(db, { sleutel: 'extern_namen', waarde: 'alles' }))).status, 400);
  // De schakelaar van de overstap en de berichtmodus horen bij de clubbeheerder.
  for (const sleutel of ['officials_automatisch', 'bericht_modus', 'club_guid']) {
    assert.equal((await officialsInstellingBewaren(ctx(db, { sleutel, waarde: 'vrijgeven' }))).status, 400, sleutel);
  }
});

test('de routes van 4d vragen officials.beheren', () => {
  for (const pad of ['/api/admin/officials/instellingen', '/api/admin/officials/regio', '/api/admin/officials/woensdaglijst',
    '/api/admin/officials/volg-clubs', '/api/admin/officials/regio/leegmaken', '/api/admin/officials/sync']) {
    for (const r of ROUTES.filter((x) => x.pad === pad)) assert.equal(r.recht, 'officials.beheren', `${r.methode} ${pad}`);
  }
});

// --- wie ziet wat --------------------------------------------------------------------

test('een YOADM ziet Regio en de twee panelen, een coach niets daarvan', () => {
  const yoadm = bouwRechten({ rollen: [{ rol: 'YOADM', team_guid: null }] }).overzicht();
  assert.ok(tabbalkTabbladen(yoadm).some((t) => t.id === 'regio'));
  assert.deepEqual(menuTabbladen(yoadm).map((t) => t.id), ['vergoedingen', 'dagelijksbeheer', 'configuratie']);
  const coach = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: 'BVBL1125J16  1' }] }).overzicht();
  assert.ok(!tabbalkTabbladen(coach).some((t) => t.id === 'regio'));
  assert.deepEqual(menuTabbladen(coach), []);
});

test('elke sectie van Dagelijks beheer en Configuratie zegt voor wie ze is', () => {
  for (const id of ['tab-dagelijksbeheer', 'tab-configuratie']) {
    const s = html.slice(html.indexOf(`<section id="${id}"`), html.indexOf('</section>', html.indexOf(`<section id="${id}"`)));
    const secties = s.match(/<details[^>]*>/g) ?? [];
    assert.ok(secties.length >= 4, id);
    for (const d of secties) assert.match(d, /data-recht="(systeem|officials)\.beheren"/, `${id}: ${d}`);
  }
  assert.match(app, /sectie\.hidden = !Object\.hasOwn\(rechten \?\? \{\}, sectie\.dataset\.recht\)/);
  // Elk deel laadt enkel voor wie het mag: anders een 403 bij de YOADM.
  assert.match(app, /if \(mag\('systeem\.beheren'\)\) laadInstellingen\(\);/);
  assert.match(app, /if \(mag\('officials\.beheren'\)\) laadConfiguratieOfficials\(\);/);
  assert.match(app, /if \(mag\('systeem\.beheren'\)\) laadMededelingBeheer\(\);/);
});

test('wat wijzigt of wist, toont eerst wat er zou gebeuren', () => {
  // Synchroniseren: eerst de droogloop, dan pas de knop om uit te voeren.
  assert.ok(beheer.indexOf("'/api/admin/officials/sync', 'POST'") < beheer.indexOf("'/api/admin/officials/sync?uitvoeren=1'"));
  // Leegmaken: eerst tellen, dan bevestigen, dan wissen.
  const wis = beheer.slice(beheer.indexOf("el('volgclubwis')"));
  const proef = wis.indexOf("'/api/admin/officials/regio/leegmaken', 'POST', {}");
  const vraag = wis.indexOf('confirm(');
  const echt = wis.indexOf('uitvoeren: true');
  assert.ok(proef > 0 && proef < vraag && vraag < echt);
});

// --- Regio ----------------------------------------------------------------------------

test('Regio: de bron van een dag, en ontsmet', () => {
  assert.equal(bronVanDag([{ bron: 'lijst' }, { bron: 'lijst' }]), 'lijst');
  assert.equal(bronVanDag([{ bron: 'lijst' }, { bron: 'api' }]), 'api', 'één wedstrijd uit de API maakt de dag onzeker');
  // Thuis, uit en categorie gaan door de gedeelde kaart, die zelf ontsmet.
  for (const veld of ['w.club', 'w.naam']) {
    assert.ok(regio.includes(`veilig(${veld}`), veld);
  }
  assert.match(regio, /ploeg: w\.thuis,\s*tegenstander: w\.uit,\s*cat: w\.categorie/);
  assert.match(regio, /wedguid=\$\{encodeURIComponent\(w?\.?guid\)\}|wedstrijdblad\(w\.guid\)/);
  const start = html.indexOf('id="tab-regio"');
  assert.match(html.slice(start, html.indexOf('>', start)), /hidden/);
});
