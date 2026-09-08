// Welke tafeltaken een wedstrijd nodig heeft — zuiver, geen databank.

import test from 'node:test';
import assert from 'node:assert/strict';
import { takenVoorWedstrijd } from '../src/lib/wedstrijdtaken.js';

test('thuiswedstrijd tot en met U12 (G10/G12/M12/G08): enkel klok + ploegafgevaardigde', () => {
  for (const categorie of ['G08', 'G10', 'G12', 'M12']) {
    const taken = takenVoorWedstrijd({ categorie, thuis: true });
    assert.deepEqual(taken, ['klok', 'ploegafgevaardigde'], categorie);
  }
});

test('thuiswedstrijd vanaf U14: klok + 24 seconden + ploegafgevaardigde', () => {
  for (const categorie of ['G14', 'M14', 'J16', 'M16', 'J18', 'M19', 'J21', 'HSE', 'DSE']) {
    const taken = takenVoorWedstrijd({ categorie, thuis: true });
    assert.deepEqual(taken, ['klok', '24seconden', 'ploegafgevaardigde'], categorie);
  }
});

test('uitwedstrijd: enkel tablet + ploegafgevaardigde, ongeacht categorie', () => {
  for (const categorie of ['G12', 'J16', 'HSE']) {
    const taken = takenVoorWedstrijd({ categorie, thuis: false });
    assert.deepEqual(taken, ['tablet', 'ploegafgevaardigde'], categorie);
  }
});

test('een ploegafgevaardigde is er altijd, thuis en uit', () => {
  assert.ok(takenVoorWedstrijd({ categorie: 'G12', thuis: true }).includes('ploegafgevaardigde'));
  assert.ok(takenVoorWedstrijd({ categorie: 'G12', thuis: false }).includes('ploegafgevaardigde'));
});

test('een onbekende categorie geeft geen enkele taak — liever niets dan verkeerd gokken', () => {
  assert.deepEqual(takenVoorWedstrijd({ categorie: 'ONBEKEND', thuis: true }), []);
  assert.deepEqual(takenVoorWedstrijd({ categorie: 'ROL', thuis: false }), []);
});

test('nooit klok of 24 seconden bij een uitwedstrijd', () => {
  const taken = takenVoorWedstrijd({ categorie: 'J16', thuis: false });
  assert.ok(!taken.includes('klok'));
  assert.ok(!taken.includes('24seconden'));
});

test('nooit tablet bij een thuiswedstrijd', () => {
  const taken = takenVoorWedstrijd({ categorie: 'J16', thuis: true });
  assert.ok(!taken.includes('tablet'));
});
