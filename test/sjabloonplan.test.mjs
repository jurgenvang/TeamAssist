// Het plan voor het inlezen van het sjabloon.
//
// Het zwaartepunt: nooit een nieuwe speler aanmaken bij een onbekende id, en
// een ouderkoppeling die uit het bestand verdwijnt wordt gesignaleerd, nooit
// stil verwijderd.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakSjabloonplan } from '../src/lib/sjabloonplan.js';

const speler = (over = {}) => ({
  id: 'p1',
  voornaam: 'Dries',
  achternaam: 'van Geijstelen Forier',
  geboortedatum: '2010-03-17',
  tel_vast: null,
  tel_gsm: null,
  straat: null,
  nummer: null,
  bus: null,
  postcode: null,
  gemeente: null,
  email: null,
  ...over,
});

const rij = (over = {}) => ({
  id: 'p1',
  lidnummer: '717331',
  naam_bond: 'Dries van Geijstelen Forier',
  voornaam: 'Dries',
  achternaam: 'van Geijstelen Forier',
  geboortedatum: '2010-03-17',
  email_speler: '',
  email_ouder: '',
  tel_vast: '',
  tel_gsm: '',
  straat: '',
  nummer: '',
  bus: '',
  postcode: '',
  gemeente: '',
  ...over,
});

test('een rij zonder wijzigingen levert niets op', () => {
  const plan = maakSjabloonplan([rij()], [speler()], [], []);
  assert.equal(plan.spelerwijzigingen.length, 0);
  assert.equal(plan.status, 'ok');
});

test('een ingevuld e-mailadres wordt herkend als wijziging', () => {
  const plan = maakSjabloonplan([rij({ email_speler: 'dries@example.org' })], [speler()], [], []);
  assert.equal(plan.spelerwijzigingen.length, 1);
  assert.deepEqual(plan.spelerwijzigingen[0].gewijzigde_velden, ['email']);
});

test('meerdere gewijzigde velden komen samen in één rij', () => {
  const plan = maakSjabloonplan(
    [rij({ tel_gsm: '0470123456', gemeente: 'Leuven' })],
    [speler()],
    [],
    []
  );
  assert.deepEqual(plan.spelerwijzigingen[0].gewijzigde_velden.sort(), ['gemeente', 'tel_gsm']);
});

test('een rij zonder id wordt overgeslagen met een duidelijke reden', () => {
  const plan = maakSjabloonplan([rij({ id: '' })], [speler()], [], []);
  assert.equal(plan.spelerwijzigingen.length, 0);
  assert.equal(plan.rijfouten.length, 1);
  assert.match(plan.rijfouten[0].reden, /geen id/);
  assert.equal(plan.status, 'deels');
});

test('een onbekende id maakt nooit een nieuwe speler aan', () => {
  // De kern van de grens die dit sjabloon trekt: geen gokken bij een
  // onbekende id, enkel een foutmelding.
  const plan = maakSjabloonplan([rij({ id: 'bestaat-niet' })], [speler()], [], []);
  assert.equal(plan.spelerwijzigingen.length, 0);
  assert.match(plan.rijfouten[0].reden, /hoort bij geen enkele speler/);
});

test('een dubbele id in het bestand wordt gemeld', () => {
  const plan = maakSjabloonplan([rij(), rij()], [speler()], [], []);
  assert.equal(plan.rijfouten.length, 1);
  assert.match(plan.rijfouten[0].reden, /dubbel/);
});

test('een ongeldig e-mailadres wordt geweigerd met de naam erbij', () => {
  const plan = maakSjabloonplan([rij({ email_speler: 'geen adres' })], [speler()], [], []);
  assert.equal(plan.rijfouten.length, 1);
  assert.match(plan.rijfouten[0].reden, /Dries/);
});

test('een nieuw ouderadres wordt voorgesteld als koppeling', () => {
  const plan = maakSjabloonplan(
    [rij({ email_ouder: 'ouder@example.org' })],
    [speler()],
    [],
    []
  );
  assert.equal(plan.nieuweOuderkoppelingen.length, 1);
  assert.equal(plan.nieuweOuderkoppelingen[0].email, 'ouder@example.org');
  assert.equal(plan.nieuweOuderkoppelingen[0].nieuwe_persoon, true);
});

test('een ouderadres dat al bij een bestaande persoon hoort, koppelt in plaats van aan te maken', () => {
  const alleePersonen = [{ id: 'p-ouder', email: 'ouder@example.org' }];
  const plan = maakSjabloonplan(
    [rij({ email_ouder: 'ouder@example.org' })],
    [speler()],
    [],
    alleePersonen
  );
  assert.equal(plan.nieuweOuderkoppelingen[0].nieuwe_persoon, false);
  assert.equal(plan.nieuweOuderkoppelingen[0].bestaande_persoon_id, 'p-ouder');
});

test('twee ouderadressen, gescheiden door een puntkomma, geven twee koppelingen', () => {
  const plan = maakSjabloonplan(
    [rij({ email_ouder: 'moeder@example.org; vader@example.org' })],
    [speler()],
    [],
    []
  );
  assert.equal(plan.nieuweOuderkoppelingen.length, 2);
});

test('een al bestaande koppeling wordt niet nogmaals voorgesteld', () => {
  const bestaandeOuders = [{ kind_id: 'p1', ouder_id: 'p-ouder', ouder_email: 'ouder@example.org' }];
  const plan = maakSjabloonplan(
    [rij({ email_ouder: 'ouder@example.org' })],
    [speler()],
    bestaandeOuders,
    []
  );
  assert.equal(plan.nieuweOuderkoppelingen.length, 0);
});

test('een koppeling die niet meer in het bestand staat, wordt gesignaleerd, nooit stil verwijderd', () => {
  const bestaandeOuders = [{ kind_id: 'p1', ouder_id: 'p-ouder', ouder_email: 'oudadres@example.org' }];
  const plan = maakSjabloonplan([rij({ email_ouder: '' })], [speler()], bestaandeOuders, []);
  assert.equal(plan.overgeslagenOuders.length, 1);
  assert.equal(plan.overgeslagenOuders[0].email, 'oudadres@example.org');
  // Cruciaal: dit staat enkel als signaal, er wordt nergens een verwijdering
  // uitgevoerd door deze functie zelf.
  assert.ok(!('verwijderdeOuders' in plan));
});

test('hoofdletters in een e-mailadres maken voor het matchen niet uit', () => {
  const alleePersonen = [{ id: 'p-ouder', email: 'ouder@example.org' }];
  const plan = maakSjabloonplan(
    [rij({ email_ouder: 'Ouder@Example.ORG' })],
    [speler()],
    [],
    alleePersonen
  );
  assert.equal(plan.nieuweOuderkoppelingen[0].nieuwe_persoon, false);
});

test('meerdere spelers in hetzelfde bestand worden onafhankelijk verwerkt', () => {
  const spelers = [speler(), speler({ id: 'p2', voornaam: 'Otto', achternaam: 'Muñiz' })];
  const rijen = [
    rij({ email_speler: 'dries@example.org' }),
    rij({ id: 'p2', voornaam: 'Otto', achternaam: 'Muñiz', email_speler: 'otto@example.org' }),
  ];
  const plan = maakSjabloonplan(rijen, spelers, [], []);
  assert.equal(plan.spelerwijzigingen.length, 2);
});

test('lege waarden blijven leeg en tellen niet als wijziging', () => {
  const plan = maakSjabloonplan([rij()], [speler({ tel_gsm: null })], [], []);
  assert.equal(plan.spelerwijzigingen.length, 0);
});
