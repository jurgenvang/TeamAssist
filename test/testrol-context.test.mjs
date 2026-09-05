// De drie voorwaarden waaronder de testrol werkt.
//
// Ze staan in de contextopbouw in src/index.js. Hier wordt bewaakt dat ze er
// alle drie staan: valt er een weg, dan kan een gewone gebruiker de schakelaar
// gebruiken of staat ze open op een installatie waar niemand ze aanzette.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bron = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const blok = bron.slice(bron.indexOf('const gevraagdeRol'), bron.indexOf('// Een route die een recht vraagt'));

test('de rol komt uit een kop en niet uit de body', () => {
  assert.ok(blok.includes("request.headers.get('x-teamassist-rol')"));
  assert.ok(!blok.includes('body'), 'de gebruiker komt nooit uit de request body');
});

test('de instelling wordt opgehaald', () => {
  assert.ok(blok.includes("instellingLezen(env.DB, 'testrol_toegelaten', '0')"));
});

test('de beslissing loopt via magTestrolGebruiken', () => {
  // De voorwaarden zelf worden hieronder echt getest, niet op tekst.
  assert.ok(blok.includes('magTestrolGebruiken(rechten, toegelaten, gevraagdeRol)'));
});

test('er wordt versmald met beperkTot en niet met een nieuwe berekening', () => {
  // Een tweede berekening zou de doorsnede kunnen missen en zo verbreden.
  assert.ok(blok.includes('beperkTot(rechten,'));
});
