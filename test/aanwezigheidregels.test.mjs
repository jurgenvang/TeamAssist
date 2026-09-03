// De kernregels voor aanwezigheden.
//
// Het zwaartepunt: een uitgesloten speler kan zichzelf niet terugzetten op
// aanwezig, en 'niet geselecteerd' mag nergens als afwezig geteld worden — dat
// laatste wordt hier niet eens een status, wat op zich al de garantie is.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  opgaveSluit, magNogOpgeven, magOpgaveZetten, bouwOpgave, voorgesteldeWedstrijdtermijn,
} from '../src/lib/aanwezigheidregels.js';

const activiteit = { datum: '2026-09-10', begin: '18:30' };

test('opgaveSluit trekt de termijn af van start', () => {
  const sluit = opgaveSluit(activiteit, 1);
  assert.equal(sluit.toISOString(), '2026-09-10T17:30:00.000Z');
});

test('een langere termijn sluit eerder', () => {
  const kort = opgaveSluit(activiteit, 1);
  const lang = opgaveSluit(activiteit, 48);
  assert.ok(lang < kort);
});

test('vóór de sluitingstijd mag er nog opgegeven worden', () => {
  const uit = magNogOpgeven(activiteit, { opgave_toegelaten: 1, opgave_termijn_uren: 1 }, new Date('2026-09-10T16:00:00Z'));
  assert.equal(uit.mag, true);
});

test('na de sluitingstijd mag het niet meer', () => {
  const uit = magNogOpgeven(activiteit, { opgave_toegelaten: 1, opgave_termijn_uren: 1 }, new Date('2026-09-10T18:00:00Z'));
  assert.equal(uit.mag, false);
  assert.match(uit.reden, /termijn/);
});

test('precies op het sluitingsmoment mag het niet meer', () => {
  const uit = magNogOpgeven(activiteit, { opgave_toegelaten: 1, opgave_termijn_uren: 1 }, new Date('2026-09-10T17:30:00Z'));
  assert.equal(uit.mag, false);
});

test('staat opgeven uit voor de ploeg, dan mag het nooit, ongeacht het tijdstip', () => {
  const uit = magNogOpgeven(activiteit, { opgave_toegelaten: 0, opgave_termijn_uren: 1 }, new Date('2026-01-01T00:00:00Z'));
  assert.equal(uit.mag, false);
  assert.match(uit.reden, /staat uit/);
});

test('een uitgesloten speler kan geen opgave meer zetten, ook niet vóór de termijn', () => {
  const uit = magOpgaveZetten({
    huidigeRij: { uitgesloten: 1, uitgesloten_reden: 'disciplinair' },
    activiteit,
    teamInstelling: { opgave_toegelaten: 1, opgave_termijn_uren: 1 },
    nu: new Date('2026-09-10T10:00:00Z'),
  });
  assert.equal(uit.mag, false);
  assert.match(uit.reden, /uitgesloten/);
  assert.match(uit.reden, /disciplinair/, 'de reden hoort zichtbaar te zijn voor de speler zelf');
});

test('zonder uitsluiting geldt gewoon de termijn', () => {
  const uit = magOpgaveZetten({
    huidigeRij: { uitgesloten: 0 },
    activiteit,
    teamInstelling: { opgave_toegelaten: 1, opgave_termijn_uren: 1 },
    nu: new Date('2026-09-10T10:00:00Z'),
  });
  assert.equal(uit.mag, true);
});

test('een nieuwe rij (geen huidigeRij) is niet uitgesloten', () => {
  const uit = magOpgaveZetten({
    huidigeRij: undefined,
    activiteit,
    teamInstelling: { opgave_toegelaten: 1, opgave_termijn_uren: 1 },
    nu: new Date('2026-09-10T10:00:00Z'),
  });
  assert.equal(uit.mag, true);
});

test('bouwOpgave vult de reden enkel in bij afwezig', () => {
  const aanwezig = bouwOpgave({ status: 'aanwezig', doorPersoonId: 'p1' });
  assert.equal(aanwezig.opgave_reden, null);

  const afwezig = bouwOpgave({ status: 'afwezig', reden: 'gekwetst', doorPersoonId: 'p1' });
  assert.equal(afwezig.opgave_reden, 'gekwetst');
});

test('bouwOpgave vult de toelichting enkel in bij reden ander', () => {
  const uit = bouwOpgave({ status: 'afwezig', reden: 'ander', toelichting: 'op reis', doorPersoonId: 'p1' });
  assert.equal(uit.opgave_toelichting, 'op reis');

  const zonder = bouwOpgave({ status: 'afwezig', reden: 'ziek', toelichting: 'zou genegeerd worden', doorPersoonId: 'p1' });
  assert.equal(zonder.opgave_toelichting, null);
});

test('bouwOpgave weigert afwezig zonder geldige reden', () => {
  assert.throws(() => bouwOpgave({ status: 'afwezig', doorPersoonId: 'p1' }));
  assert.throws(() => bouwOpgave({ status: 'afwezig', reden: 'moe', doorPersoonId: 'p1' }));
});

test('bouwOpgave weigert een onbekende status', () => {
  assert.throws(() => bouwOpgave({ status: 'misschien', doorPersoonId: 'p1' }));
});

test('bouwOpgave registreert wie de opgave deed', () => {
  const uit = bouwOpgave({ status: 'aanwezig', doorPersoonId: 'p-ouder' });
  assert.equal(uit.opgave_door, 'p-ouder');
});

test('de voorgestelde wedstrijdtermijn is 48 uur zodra selectie aan staat', () => {
  assert.equal(voorgesteldeWedstrijdtermijn(1), 48);
  assert.equal(voorgesteldeWedstrijdtermijn(0), 1);
});
