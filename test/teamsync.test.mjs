// Het plan dat de ploegsynchronisatie maakt.
//
// Zuivere functie, dus elke uitzondering is hier te bewijzen zonder databank.
// Het zwaartepunt ligt op wat er níét gebeurt: de synchronisatie draait
// ongezien en raakt gegevens die niemand meteen nakijkt.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakPloegplan, VERDWIJNGRENS } from '../src/lib/teamsync.js';

const CLUB = 'BVBL1125';
const g = (code, nr) => `${CLUB}${code}  ${nr}`;

const bestaandeRij = (guid, extra = {}) => ({
  guid,
  naam: 'oude naam',
  categorie: 'J16',
  gevolgd: 1,
  bij_bond: 1,
  ...extra,
});

test('een onbekende ploeg wordt als nieuw gemeld', () => {
  const plan = maakPloegplan([{ guid: g('J16', 2), naam: 'J16 B' }], [], CLUB);
  assert.equal(plan.nieuw.length, 1);
  assert.equal(plan.nieuw[0].categorie, 'J16');
  assert.equal(plan.nieuw[0].onderwijsgroep, 'secundair');
});

test('de categorie komt uit de GUID en niet uit de naam', () => {
  // De naam wisselt van jaar tot jaar en van invoerder tot invoerder.
  const plan = maakPloegplan([{ guid: g('HSE', 1), naam: 'Heren A (promo)' }], [], CLUB);
  assert.equal(plan.nieuw[0].categorie, 'HSE');
  assert.equal(plan.nieuw[0].onderwijsgroep, 'hoger');
});

test('een ploeg met een onbekende categorie wordt gemarkeerd', () => {
  const plan = maakPloegplan([{ guid: `${CLUB}ROL  1`, naam: 'Rolstoelbasket' }], [], CLUB);
  assert.equal(plan.nieuw[0].categorie_bekend, false);
  assert.equal(plan.nieuw[0].onderwijsgroep, 'geen');
});

test('een GUID met een afwijkende vorm levert geen categorie op', () => {
  const plan = maakPloegplan([{ guid: `${CLUB}XYZ1`, naam: 'raar' }], [], CLUB);
  assert.equal(plan.nieuw[0].categorie, null);
  assert.equal(plan.nieuw[0].categorie_bekend, false);
});

test('een ploeg zonder naam valt terug op haar GUID', () => {
  const plan = maakPloegplan([{ guid: g('G12', 1), naam: null }], [], CLUB);
  assert.equal(plan.nieuw[0].naam, g('G12', 1));
});

test('een gewijzigde naam wordt gemeld met wat er verschilt', () => {
  const plan = maakPloegplan(
    [{ guid: g('J16', 2), naam: 'J16 B' }],
    [bestaandeRij(g('J16', 2))],
    CLUB
  );
  assert.equal(plan.gewijzigd.length, 1);
  assert.deepEqual(plan.gewijzigd[0].verschillen, ['naam']);
  assert.equal(plan.nieuw.length, 0);
});

test('een ongewijzigde ploeg staat apart en niet bij gewijzigd', () => {
  const plan = maakPloegplan(
    [{ guid: g('J16', 2), naam: 'J16 B' }],
    [bestaandeRij(g('J16', 2), { naam: 'J16 B' })],
    CLUB
  );
  assert.equal(plan.gewijzigd.length, 0);
  assert.equal(plan.ongewijzigd.length, 1);
});

test('een ploeg die terugkeert bij de bond wordt als gewijzigd gemeld', () => {
  const plan = maakPloegplan(
    [{ guid: g('J16', 2), naam: 'J16 B' }],
    [bestaandeRij(g('J16', 2), { naam: 'J16 B', bij_bond: 0 })],
    CLUB
  );
  assert.ok(plan.gewijzigd[0].verschillen.includes('terug bij de bond'));
});

test('een verdwenen ploeg wordt gemeld maar niet verwijderd', () => {
  const bestaand = [
    bestaandeRij(g('J16', 1), { naam: 'a' }),
    bestaandeRij(g('J16', 2), { naam: 'b' }),
    bestaandeRij(g('G12', 1), { naam: 'c' }),
    bestaandeRij(g('G14', 1), { naam: 'd' }),
  ];
  const plan = maakPloegplan(
    [
      { guid: g('J16', 1), naam: 'a' },
      { guid: g('J16', 2), naam: 'b' },
      { guid: g('G12', 1), naam: 'c' },
    ],
    bestaand,
    CLUB
  );
  assert.equal(plan.verdwenen.length, 1);
  assert.equal(plan.verdwenen[0].guid, g('G14', 1));
  assert.equal(plan.status, 'ok');
});

test('een leeg antwoord van de bond zet niets weg', () => {
  // Dit is de belangrijkste test van het bestand: bij een storing bij de bond
  // zou anders in één nacht de hele werking van de club verdwijnen.
  const bestaand = [bestaandeRij(g('J16', 1)), bestaandeRij(g('J16', 2))];
  const plan = maakPloegplan([], bestaand, CLUB);
  assert.equal(plan.verdwenen.length, 0);
  assert.equal(plan.genegeerd_verdwenen.length, 2);
  assert.equal(plan.status, 'deels');
  assert.match(plan.melding, /storing/);
});

test('meer dan een derde tegelijk weg wordt genegeerd', () => {
  const bestaand = Array.from({ length: 9 }, (_, i) => bestaandeRij(g('J16', i + 1)));
  const gevonden = bestaand.slice(0, 5).map((r) => ({ guid: r.guid, naam: r.naam }));
  const plan = maakPloegplan(gevonden, bestaand, CLUB);
  assert.equal(plan.verdwenen.length, 0);
  assert.equal(plan.genegeerd_verdwenen.length, 4);
  assert.equal(plan.status, 'deels');
});

test('net onder de grens wordt wel doorgevoerd', () => {
  const bestaand = Array.from({ length: 9 }, (_, i) => bestaandeRij(g('J16', i + 1)));
  const gevonden = bestaand.slice(0, 6).map((r) => ({ guid: r.guid, naam: r.naam }));
  const plan = maakPloegplan(gevonden, bestaand, CLUB);
  assert.equal(plan.verdwenen.length, 3);
  assert.equal(plan.status, 'ok');
  assert.ok(3 <= 9 * VERDWIJNGRENS);
});

test('een eerste synchronisatie op een lege databank slaat niet aan', () => {
  // Nul bestaande ploegen en nul gevonden ploegen is geen storing maar een
  // installatie die nog niets heeft.
  const plan = maakPloegplan([], [], CLUB);
  assert.equal(plan.status, 'ok');
});

test('een ploeg die al weg was, wordt niet opnieuw gemeld', () => {
  const plan = maakPloegplan(
    [{ guid: g('J16', 1), naam: 'a' }],
    [bestaandeRij(g('J16', 1), { naam: 'a' }), bestaandeRij(g('G14', 1), { bij_bond: 0 })],
    CLUB
  );
  assert.equal(plan.verdwenen.length, 0);
});
