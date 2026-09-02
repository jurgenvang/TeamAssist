// Het plan voor wedstrijden.
//
// Het zwaartepunt: de hash dekt niet de uitslag, en een wijziging binnen een
// stille periode wordt niet gemeld. Beide zijn er specifiek om te voorkomen
// dat mensen platgespamd worden met iets dat geen echte wijziging is.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maakWedstrijdplan, wijzigingshash, inStillePeriode, STANDAARD_STILLE_PERIODES,
} from '../src/lib/wedstrijdsync.js';

const ruw = (over = {}) => ({
  wedstrijd_guid: 'W1',
  thuis: true,
  tegenstander: 'Gastploeg',
  datum_ruw: '12-09-2026',
  begin_ruw: '10.30',
  locatie_tekst: 'Sporthal A',
  vbl_acc_guid: 'ACC1',
  uitslag: null,
  gespeeld: false,
  ...over,
});

const bestaandeRij = (over = {}) => ({
  wedstrijd_guid: 'W1',
  datum: '2026-09-12',
  begin: '10:30',
  thuis: 1,
  tegenstander: 'Gastploeg',
  locatie_tekst: 'Sporthal A',
  uitslag: null,
  bij_bond: 1,
  wijzigingshash: wijzigingshash({
    datum: '2026-09-12', begin: '10:30', locatie_tekst: 'Sporthal A', tegenstander: 'Gastploeg', thuis: true,
  }),
  ...over,
});

test('een nieuwe wedstrijd wordt herkend, met vertaalde datum en uur', () => {
  const plan = maakWedstrijdplan([ruw()], []);
  assert.equal(plan.nieuw.length, 1);
  assert.equal(plan.nieuw[0].datum, '2026-09-12');
  assert.equal(plan.nieuw[0].begin, '10:30');
});

test('een onveranderde wedstrijd staat bij ongewijzigd', () => {
  const plan = maakWedstrijdplan([ruw()], [bestaandeRij()]);
  assert.equal(plan.ongewijzigd.length, 1);
  assert.equal(plan.gewijzigd.length, 0);
});

test('een gewijzigd uur wordt gemeld', () => {
  const plan = maakWedstrijdplan([ruw({ begin_ruw: '14.00' })], [bestaandeRij()]);
  assert.equal(plan.gewijzigd.length, 1);
  assert.equal(plan.gewijzigd[0].begin, '14:00');
});

test('een nieuwe uitslag verandert de hash niet en telt niet als wijziging', () => {
  // Precies waarvoor dit onderscheid bestaat: een uitslag is geen wijziging
  // die COORD, COACH en PLOEGV moet worden gemeld.
  const plan = maakWedstrijdplan([ruw({ gespeeld: true, uitslag: '65 - 58 ' })], [bestaandeRij()]);
  assert.equal(plan.gewijzigd.length, 0);
  assert.equal(plan.uitslag_bijgewerkt.length, 1);
  assert.equal(plan.uitslag_bijgewerkt[0].uitslag, '65 - 58 ');
});

test('dezelfde uitslag nogmaals levert geen bijwerking op', () => {
  const plan = maakWedstrijdplan(
    [ruw({ gespeeld: true, uitslag: '65-58' })],
    [bestaandeRij({ uitslag: '65-58' })]
  );
  assert.equal(plan.uitslag_bijgewerkt.length, 0);
  assert.equal(plan.ongewijzigd.length, 1);
});

test('de hash bevat de uitslag niet', () => {
  const met = wijzigingshash({ datum: 'd', begin: 'b', locatie_tekst: 'l', tegenstander: 't', thuis: true, uitslag: '10-5' });
  const zonder = wijzigingshash({ datum: 'd', begin: 'b', locatie_tekst: 'l', tegenstander: 't', thuis: true, uitslag: '99-99' });
  assert.equal(met, zonder);
});

test('06-01 valt binnen de zomerse stille periode', () => {
  assert.equal(inStillePeriode('2026-07-01'), true);
  assert.equal(inStillePeriode('2026-05-31'), false);
  assert.equal(inStillePeriode('2026-08-16'), false);
});

test('de periode rond de jaarwisseling overspant de jaargrens', () => {
  assert.equal(inStillePeriode('2026-12-30'), true);
  assert.equal(inStillePeriode('2027-01-02'), true);
  assert.equal(inStillePeriode('2027-01-04'), false);
});

test('een wijziging binnen een stille periode wordt niet als meldbaar gezien', () => {
  const plan = maakWedstrijdplan(
    [ruw({ datum_ruw: '10-07-2026', begin_ruw: '14.00' })],
    [bestaandeRij({ datum: '2026-07-10', wijzigingshash: wijzigingshash({
      datum: '2026-07-10', begin: '10:30', locatie_tekst: 'Sporthal A', tegenstander: 'Gastploeg', thuis: true,
    }) })]
  );
  assert.equal(plan.gewijzigd.length, 1);
  assert.equal(plan.gewijzigd[0].meldbaar, false);
});

test('dezelfde wijziging buiten een stille periode is wel meldbaar', () => {
  const plan = maakWedstrijdplan([ruw({ begin_ruw: '14.00' })], [bestaandeRij()]);
  assert.equal(plan.gewijzigd[0].meldbaar, true);
});

test('eigen stille periodes kunnen meegegeven worden', () => {
  const eigen = [{ van_dag: '09-10', tot_dag: '09-15' }];
  const plan = maakWedstrijdplan([ruw({ begin_ruw: '14.00' })], [bestaandeRij()], eigen);
  assert.equal(plan.gewijzigd[0].meldbaar, false);
});

test('een onleesbare datum wordt gemeld, niet stil genegeerd', () => {
  const plan = maakWedstrijdplan([ruw({ datum_ruw: '31-02-2026' })], []);
  assert.equal(plan.onleesbare_datums.length, 1);
  assert.equal(plan.nieuw[0].datum, null);
});

test('een lege lijst zet niets weg', () => {
  const plan = maakWedstrijdplan([], [bestaandeRij(), bestaandeRij({ wedstrijd_guid: 'W2' })]);
  assert.equal(plan.verdwenen.length, 0);
  assert.equal(plan.status, 'deels');
});

test('een verdwenen wedstrijd wordt gemeld maar niet verwijderd', () => {
  const bestaand = Array.from({ length: 6 }, (_, i) => bestaandeRij({ wedstrijd_guid: `W${i}` }));
  const gevonden = bestaand.slice(0, 5).map((r) => ruw({ wedstrijd_guid: r.wedstrijd_guid }));
  const plan = maakWedstrijdplan(gevonden, bestaand);
  assert.equal(plan.verdwenen.length, 1);
  assert.equal(plan.status, 'ok');
});

test('thuis en uit worden onderscheiden', () => {
  const plan = maakWedstrijdplan([ruw({ thuis: false, tegenstander: 'Thuisploeg X' })], []);
  assert.equal(plan.nieuw[0].thuis, false);
  assert.equal(plan.nieuw[0].tegenstander, 'Thuisploeg X');
});
