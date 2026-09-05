// Het plan voor het zaaluren-sjabloon.
//
// Het zwaartepunt: een onbekende zaalnaam wordt als 'nieuw' behandeld, en een
// blok dat uit het bestand verdwijnt wordt gesignaleerd, nooit stil
// verwijderd.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakZaalsjabloonplan } from '../src/lib/zaalsjabloonplan.js';

const rij = (over = {}) => ({
  zaal: 'Sportoase Wilsele',
  weekdag: '1',
  begin: '18:00',
  einde: '19:15',
  seizoen: '2026-27',
  ...over,
});

test('een blok voor een bestaande zaal, exact als vroeger, is ongewijzigd', () => {
  const bestaandeZalen = [{ id: 'z1', naam: 'Sportoase Wilsele' }];
  const bestaandeBlokken = [{ id: 1, zaal_id: 'z1', zaal_naam: 'Sportoase Wilsele', seizoen: '2026-27', weekdag: 1, begin: '18:00', einde: '19:15' }];
  const plan = maakZaalsjabloonplan([rij()], bestaandeZalen, bestaandeBlokken);
  assert.equal(plan.ongewijzigd.length, 1);
  assert.equal(plan.nieuweBlokken.length, 0);
});

test('een onbekende zaalnaam wordt als nieuwe zaal voorgesteld', () => {
  const plan = maakZaalsjabloonplan([rij({ zaal: 'Nieuwe Zaal' })], [], []);
  assert.deepEqual(plan.nieuweZalen, ['Nieuwe Zaal']);
  assert.equal(plan.nieuweBlokken.length, 1);
});

test('hoofdlettergebruik in de zaalnaam maakt voor het matchen niet uit', () => {
  const bestaandeZalen = [{ id: 'z1', naam: 'Sportoase Wilsele' }];
  const plan = maakZaalsjabloonplan([rij({ zaal: 'SPORTOASE WILSELE' })], bestaandeZalen, []);
  assert.equal(plan.nieuweZalen.length, 0);
});

test('een blok dat niet meer in het bestand staat, wordt gesignaleerd, nooit stil verwijderd', () => {
  const bestaandeBlokken = [{ id: 1, zaal_id: 'z1', zaal_naam: 'Andere Zaal', seizoen: '2026-27', weekdag: 2, begin: '19:00', einde: '20:00' }];
  const plan = maakZaalsjabloonplan([rij()], [{ id: 'z1', naam: 'Andere Zaal' }], bestaandeBlokken);
  assert.equal(plan.verdwenenBlokken.length, 1);
  assert.ok(!('verwijderdeBlokken' in plan), 'er wordt nergens automatisch iets verwijderd');
});

test('ontbrekende verplichte velden geven een rijfout, geen crash', () => {
  const plan = maakZaalsjabloonplan([rij({ zaal: '' })], [], []);
  assert.equal(plan.rijfouten.length, 1);
  assert.equal(plan.status, 'deels');
});

test('een ongeldige weekdag wordt geweigerd', () => {
  const plan = maakZaalsjabloonplan([rij({ weekdag: '9' })], [], []);
  assert.equal(plan.rijfouten.length, 1);
});

test('einde vóór begin wordt geweigerd, met de zaalnaam in de melding', () => {
  const plan = maakZaalsjabloonplan([rij({ begin: '20:00', einde: '19:00' })], [], []);
  assert.match(plan.rijfouten[0].reden, /Sportoase Wilsele/);
});

test('twee rijen voor dezelfde nieuwe zaal geven die zaal maar één keer in nieuweZalen', () => {
  const plan = maakZaalsjabloonplan(
    [rij({ weekdag: '1' }), rij({ weekdag: '2' })],
    [],
    []
  );
  assert.equal(plan.nieuweZalen.length, 1);
  assert.equal(plan.nieuweBlokken.length, 2);
});

test('een lege lijst met bestaande blokken laat alles als verdwenen zien', () => {
  const bestaandeBlokken = [{ id: 1, zaal_id: 'z1', zaal_naam: 'X', seizoen: '2026-27', weekdag: 1, begin: '18:00', einde: '19:00' }];
  const plan = maakZaalsjabloonplan([], [], bestaandeBlokken);
  assert.equal(plan.verdwenenBlokken.length, 1);
  assert.equal(plan.nieuweBlokken.length, 0);
});
