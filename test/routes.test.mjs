// De routetabel.
//
// Elke route zegt expliciet wat ze vraagt: publiek, of een geldige identiteit,
// of een bepaald recht. Een route die dat vergeet te zeggen, zou stilzwijgend
// op 'enkel aanmelden' terechtkomen — vandaar deze controle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES } from '../src/index.js';
import { RECHTEN } from '../src/lib/rechten.js';

test('elke route heeft een methode, een pad en iets om uit te voeren', () => {
  for (const route of ROUTES) {
    assert.match(route.methode, /^(GET|POST|PUT|DELETE|PATCH)$/, `methode van ${route.pad}`);
    assert.ok(route.pad.startsWith('/api/'), `${route.pad} hoort onder /api/ te staan`);
    assert.equal(typeof route.doe, 'function', `${route.pad} heeft geen functie`);
  }
});

test('geen twee routes op dezelfde methode en hetzelfde pad', () => {
  const gezien = new Set();
  for (const route of ROUTES) {
    const sleutel = `${route.methode} ${route.pad}`;
    assert.ok(!gezien.has(sleutel), `${sleutel} staat twee keer in de tabel`);
    gezien.add(sleutel);
  }
});

test('een route vraagt enkel rechten die bestaan', () => {
  for (const route of ROUTES) {
    if (!route.recht) continue;
    assert.ok(RECHTEN.includes(route.recht), `${route.pad} vraagt onbekend recht ${route.recht}`);
  }
});

test('publieke routes geven geen persoonsgegevens terug', () => {
  // Alles wat publiek staat, is van buitenaf op te vragen zonder aanmelden.
  // /api/aanmeldlink hoort daarbij omdat wie een link vraagt nog niet aangemeld
  // is; ze geeft wel altijd hetzelfde antwoord terug. /api/branding geeft enkel
  // de huisstijl (clubnaam, kleur, logo) — geen enkel gegeven over personen.
  const publiek = ROUTES.filter((r) => r.publiek).map((r) => r.pad);
  assert.deepEqual(publiek.sort(), ['/api/aanmeldlink', '/api/branding', '/api/config', '/api/versie']);
});

test('een route die geen recht vraagt, doet dat bewust', () => {
  // /api/mij gaat over jezelf: het recht zit in de identiteit, niet in een
  // aparte controle. Elke andere route zonder recht hoort hier opgemerkt te
  // worden bij het toevoegen.
  const zonderRecht = ROUTES.filter((r) => !r.publiek && !r.recht).map((r) => r.pad);
  assert.deepEqual(zonderRecht, ['/api/mij']);
});
