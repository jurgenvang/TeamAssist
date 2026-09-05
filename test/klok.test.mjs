// Brusselse tijd. De cron draait op UTC, de club leeft op Brusselse uren.

import test from 'node:test';
import assert from 'node:assert/strict';
import { brusselUur, brusselWeekdag } from '../src/lib/klok.js';

test('in de winter loopt Brussel een uur voor op UTC', () => {
  assert.equal(brusselUur(new Date('2026-01-15T03:00:00Z')), 4);
  assert.equal(brusselUur(new Date('2026-12-31T23:30:00Z')), 0);
});

test('in de zomer lopen er twee uur verschil', () => {
  // Precies de reden om niet zeven cron-expressies te gebruiken: die zouden
  // twee keer per jaar een uur verschuiven.
  assert.equal(brusselUur(new Date('2026-07-15T02:00:00Z')), 4);
  assert.equal(brusselUur(new Date('2026-07-15T22:30:00Z')), 0);
});

test('de weekdag telt van maandag tot zondag', () => {
  assert.equal(brusselWeekdag(new Date('2026-08-31T09:00:00Z')), 1);
  assert.equal(brusselWeekdag(new Date('2026-09-02T09:00:00Z')), 3);
  assert.equal(brusselWeekdag(new Date('2026-09-06T09:00:00Z')), 7);
});

test('vlak na middernacht Brusselse tijd is het al de volgende dag', () => {
  // 22u30 UTC in de zomer is 00u30 in Brussel, dus een dag verder.
  assert.equal(brusselWeekdag(new Date('2026-07-14T22:30:00Z')), 3);
});
