// De contrastcontrole voor de clubaccentkleur.
//
// Het belangrijkste hier: een afgekeurde kleur wordt geweigerd, nooit
// stilzwijgend aangepast. Een club moet weten dat haar kleur niet werkt, niet
// een andere kleur krijgen zonder het te merken.

import test from 'node:test';
import assert from 'node:assert/strict';
import { geldigeHex, contrastMetWit, keurAccentkleurGoed } from '../src/lib/kleur.js';

test('een geldige hexkleur wordt herkend', () => {
  assert.equal(geldigeHex('#a4232b'), true);
  assert.equal(geldigeHex('#ABCDEF'), true);
});

test('ongeldige waarden worden geweigerd', () => {
  for (const w of ['geel', '#12345', '#gggggg', 'a4232b', '', null, undefined]) {
    assert.equal(geldigeHex(w), false, `'${w}' hoort ongeldig te zijn`);
  }
});

test('zwart en donkere kleuren hebben een hoog contrast met wit', () => {
  assert.ok(contrastMetWit('#000000') > 20);
});

test('wit zelf heeft geen contrast met wit', () => {
  assert.ok(contrastMetWit('#ffffff') < 1.1);
});

test('een lichte kleur zoals geel wordt afgekeurd', () => {
  const uit = keurAccentkleurGoed('#ffff00');
  assert.equal(uit.ok, false);
  assert.match(uit.reden, /contrast/);
});

test('een donkere clubkleur wordt goedgekeurd', () => {
  const uit = keurAccentkleurGoed('#a4232b');
  assert.equal(uit.ok, true);
  assert.ok(uit.contrast >= 4.5);
});

test('een ongeldige hexwaarde wordt geweigerd vóór het contrast berekend wordt', () => {
  const uit = keurAccentkleurGoed('niet-geldig');
  assert.equal(uit.ok, false);
  assert.equal(uit.contrast, undefined);
});

test('de functie verzint nooit een vervangkleur', () => {
  // Geen enkel geretourneerd veld mag een kleur zijn die niet de invoer was.
  const uit = keurAccentkleurGoed('#ffff00');
  assert.ok(!('kleur' in uit) && !('voorgesteld' in uit));
});
