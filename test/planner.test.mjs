// Welke automatische taak op welk uur — een zuivere, makkelijk te testen
// beslissing, los van de uitvoering zelf.

import test from 'node:test';
import assert from 'node:assert/strict';
import { takenVoorUur } from '../src/lib/planner.js';

test('wedstrijden lopen vier keer per dag: 0, 6, 12, 18 uur', () => {
  for (const uur of [0, 6, 12, 18]) {
    assert.ok(takenVoorUur(uur, 1).includes('wedstrijden'), `uur ${uur}`);
  }
});

test('wedstrijden lopen niet op een ander uur', () => {
  for (const uur of [1, 2, 3, 4, 5, 7, 13, 19, 23]) {
    assert.ok(!takenVoorUur(uur, 1).includes('wedstrijden'), `uur ${uur}`);
  }
});

test('teams en leden lopen samen om 3 uur, elke dag', () => {
  for (const dag of [1, 2, 3, 4, 5, 6, 7]) {
    const taken = takenVoorUur(3, dag);
    assert.ok(taken.includes('teams'));
    assert.ok(taken.includes('leden'));
  }
});

test('periodes lopen enkel op maandag om 5 uur', () => {
  assert.ok(takenVoorUur(5, 1).includes('periodes'));
  for (const dag of [2, 3, 4, 5, 6, 7]) {
    assert.ok(!takenVoorUur(5, dag).includes('periodes'), `dag ${dag}`);
  }
});

test('periodes lopen niet om een ander uur, ook niet op maandag', () => {
  assert.ok(!takenVoorUur(6, 1).includes('periodes'));
  assert.ok(!takenVoorUur(4, 1).includes('periodes'));
});

test('de ping blijft op 4 uur staan, ongewijzigd', () => {
  assert.ok(takenVoorUur(4, 1).includes('ping'));
  assert.ok(!takenVoorUur(3, 1).includes('ping'));
  assert.ok(!takenVoorUur(5, 1).includes('ping'));
});

test('een rustig uur zonder taken geeft een lege lijst, geen crash', () => {
  assert.deepEqual(takenVoorUur(1, 3), []);
});

test('opkuis loopt elke dag om 2 uur', () => {
  for (const dag of [1, 2, 3, 4, 5, 6, 7]) {
    assert.ok(takenVoorUur(2, dag).includes('opkuis'), `dag ${dag}`);
  }
});

test('opkuis loopt niet op een ander uur', () => {
  for (const uur of [1, 3, 4, 5, 6]) {
    assert.ok(!takenVoorUur(uur, 1).includes('opkuis'), `uur ${uur}`);
  }
});

test('elk uur van de dag geeft altijd een array terug', () => {
  for (let uur = 0; uur < 24; uur++) {
    for (let dag = 1; dag <= 7; dag++) {
      assert.ok(Array.isArray(takenVoorUur(uur, dag)), `uur ${uur} dag ${dag}`);
    }
  }
});
