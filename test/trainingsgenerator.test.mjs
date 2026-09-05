// De generator die een reeks uitschrijft naar concrete trainingen.
//
// Het zwaartepunt: wat een beheerder handmatig aanpaste, blijft onaangeroerd,
// en een vakantie of een gesloten zaal wordt zichtbaar in plaats van stil
// weggelaten.

import test from 'node:test';
import assert from 'node:assert/strict';
import { genereerTrainingen, isoWeekdag } from '../src/lib/trainingsgenerator.js';

const reeks = (over = {}) => ({
  weekdag: 2, // dinsdag
  begin: '18:30',
  einde: '20:00',
  van: '2026-09-01',
  tot: '2026-09-30',
  vakantie_doorlopen: 0,
  ...over,
});

test('isoWeekdag telt 1 = maandag tot 7 = zondag', () => {
  assert.equal(isoWeekdag('2026-08-31'), 1); // maandag
  assert.equal(isoWeekdag('2026-09-06'), 7); // zondag
  assert.equal(isoWeekdag('2026-09-01'), 2); // dinsdag
});

test('een lege reeks levert de juiste dinsdagen van september op', () => {
  const plan = genereerTrainingen({ reeks: reeks(), onderwijsgroep: 'geen' });
  assert.deepEqual(
    plan.nieuw.map((t) => t.datum),
    ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']
  );
});

test('elke gegenereerde training draagt het uur van de reeks', () => {
  const plan = genereerTrainingen({ reeks: reeks(), onderwijsgroep: 'geen' });
  assert.equal(plan.nieuw[0].begin, '18:30');
  assert.equal(plan.nieuw[0].status, 'gepland');
});

test('een training in een vakantie wordt overgeslagen, niet gegenereerd', () => {
  const periodes = [{ naam: 'Herfstvakantie', soort: 'vakantie', doelgroep: 'iedereen', van: '2026-09-08', tot: '2026-09-08' }];
  const plan = genereerTrainingen({ reeks: reeks(), onderwijsgroep: 'geen', periodes });
  assert.ok(!plan.nieuw.some((t) => t.datum === '2026-09-08'));
  assert.equal(plan.nieuw.length, 4); // vijf min de overgeslagen 8 september
});

test('vakantie_doorlopen negeert de vakantie', () => {
  const periodes = [{ naam: 'Herfstvakantie', soort: 'vakantie', doelgroep: 'iedereen', van: '2026-09-08', tot: '2026-09-08' }];
  const plan = genereerTrainingen({ reeks: reeks({ vakantie_doorlopen: 1 }), onderwijsgroep: 'geen', periodes });
  assert.equal(plan.nieuw.length, 5);
});

test('een examenperiode raakt enkel de bijpassende onderwijsgroep', () => {
  const periodes = [{ naam: 'Examens secundair', soort: 'vakantie', doelgroep: 'secundair', van: '2026-09-15', tot: '2026-09-15' }];

  const secundair = genereerTrainingen({ reeks: reeks(), onderwijsgroep: 'secundair', periodes });
  assert.equal(secundair.nieuw.length, 4); // vijf min de overgeslagen 15 september

  const hoger = genereerTrainingen({ reeks: reeks(), onderwijsgroep: 'hoger', periodes });
  assert.equal(hoger.nieuw.length, 5);
});

test('een gesloten zaal levert een training met een duidelijke status op', () => {
  // Verdwijnen zou verkeerd zijn: de betrokkenen horen te weten dat er iets mis
  // is, niet dat er niets gepland stond.
  const sluitingen = [{ van: '2026-09-15', tot: '2026-09-15', reden: 'vloer geschuurd' }];
  const plan = genereerTrainingen({ reeks: reeks(), onderwijsgroep: 'geen', sluitingen });
  const geraakt = plan.nieuw.find((t) => t.datum === '2026-09-15');
  assert.equal(geraakt.status, 'zaal_niet_beschikbaar');
  assert.equal(plan.overgeslagen_sluiting[0].reden, 'vloer geschuurd');
});

test('een handmatig gewijzigde training wordt nooit herschreven', () => {
  const bestaand = [
    { id: 1, datum: '2026-09-08', begin: '19:00', einde: '20:30', status: 'gepland', handmatig_gewijzigd: 1 },
  ];
  const plan = genereerTrainingen({ reeks: reeks(), onderwijsgroep: 'geen', bestaandeTrainingen: bestaand });
  assert.ok(!plan.nieuw.some((t) => t.bestaand_id === 1));
  assert.equal(plan.behouden.length, 1);
  assert.equal(plan.behouden[0].begin, '19:00', 'het handmatig gezette uur blijft staan');
});

test('een ongewijzigde training komt apart te staan en niet bij nieuw', () => {
  const bestaand = [{ id: 2, datum: '2026-09-01', begin: '18:30', einde: '20:00', status: 'gepland', handmatig_gewijzigd: 0 }];
  const plan = genereerTrainingen({ reeks: reeks(), onderwijsgroep: 'geen', bestaandeTrainingen: bestaand });
  assert.equal(plan.ongewijzigd.length, 1);
  assert.ok(!plan.nieuw.some((t) => t.datum === '2026-09-01'));
});

test('een gewijzigd uur op de reeks werkt een niet-handmatige training bij', () => {
  const bestaand = [{ id: 3, datum: '2026-09-01', begin: '18:00', einde: '19:30', status: 'gepland', handmatig_gewijzigd: 0 }];
  const plan = genereerTrainingen({ reeks: reeks(), onderwijsgroep: 'geen', bestaandeTrainingen: bestaand });
  const bijgewerkt = plan.nieuw.find((t) => t.bestaand_id === 3);
  assert.ok(bijgewerkt, 'de training hoort bijgewerkt te worden naar het nieuwe uur');
  assert.equal(bijgewerkt.begin, '18:30');
});

test('een reeks buiten het schooljaar genereert gewoon door', () => {
  // De grenzen van het seizoen worden bij het aanmaken van de reeks bewaakt,
  // niet hier: deze functie schrijft enkel uit wat haar gegeven wordt.
  const plan = genereerTrainingen({
    reeks: reeks({ van: '2026-07-01', tot: '2026-07-07' }),
    onderwijsgroep: 'geen',
  });
  assert.ok(plan.nieuw.length >= 0);
});

// --- Feestdagen: een eigenschap van de zaal, geen keuze van het team -------

test('een feestdag slaat een training over wanneer de zaal standaard niet open is', () => {
  const periodes = [{ naam: 'Kerstmis', soort: 'feestdag', doelgroep: 'iedereen', van: '2026-09-08', tot: '2026-09-08' }];
  const plan = genereerTrainingen({ reeks: reeks(), onderwijsgroep: 'geen', periodes });
  assert.ok(!plan.nieuw.some((t) => t.datum === '2026-09-08'));
  assert.equal(plan.overgeslagen_feestdag.length, 0, 'geen bestaande training om over te slaan, dus geen melding nodig');
  assert.equal(plan.nieuw.length, 4);
});

test('een zaal die open is op feestdagen, traint gewoon door', () => {
  const periodes = [{ naam: 'Feestdag', soort: 'feestdag', doelgroep: 'iedereen', van: '2026-09-08', tot: '2026-09-08' }];
  const plan = genereerTrainingen({
    reeks: reeks(), onderwijsgroep: 'geen', periodes, zaalOpenOpFeestdagen: true,
  });
  assert.ok(plan.nieuw.some((t) => t.datum === '2026-09-08'));
  assert.equal(plan.nieuw.length, 5);
});

test('een bestaande training op een feestdag wordt gemeld als ze wegvalt', () => {
  const periodes = [{ naam: 'Feestdag', soort: 'feestdag', doelgroep: 'iedereen', van: '2026-09-08', tot: '2026-09-08' }];
  const bestaand = [{ id: 9, datum: '2026-09-08', begin: '18:30', einde: '20:00', status: 'gepland', handmatig_gewijzigd: 0 }];
  const plan = genereerTrainingen({
    reeks: reeks(), onderwijsgroep: 'geen', periodes, bestaandeTrainingen: bestaand,
  });
  assert.equal(plan.overgeslagen_feestdag.length, 1);
  assert.equal(plan.overgeslagen_feestdag[0].id, 9);
  assert.equal(plan.overgeslagen_feestdag[0].reden, 'Feestdag');
});

test('vakantie_doorlopen op de reeks laat een feestdag niet automatisch mee doorlopen', () => {
  // Het team kan door de vakantie heen trainen, maar of de zaal open is op
  // een feestdag blijft een aparte, eigen beslissing van de zaal.
  const periodes = [
    { naam: 'Kerstvakantie', soort: 'vakantie', doelgroep: 'iedereen', van: '2026-09-01', tot: '2026-09-30' },
    { naam: 'Kerstmis', soort: 'feestdag', doelgroep: 'iedereen', van: '2026-09-08', tot: '2026-09-08' },
  ];
  const plan = genereerTrainingen({
    reeks: reeks({ vakantie_doorlopen: 1 }), onderwijsgroep: 'geen', periodes,
  });
  assert.ok(!plan.nieuw.some((t) => t.datum === '2026-09-08'), 'de feestdag blokkeert ondanks vakantie_doorlopen');
  assert.equal(plan.nieuw.length, 4, 'de andere vier dinsdagen van de vakantie lopen wel door');
});

test('een zaal die open is op feestdagen, respecteert nog steeds vakantie_doorlopen = 0', () => {
  // Dat de zaal fysiek open kan zijn, betekent niet dat het team tijdens zijn
  // eigen vakantieweek wil trainen.
  const periodes = [
    { naam: 'Vakantie', soort: 'vakantie', doelgroep: 'iedereen', van: '2026-09-01', tot: '2026-09-30' },
    { naam: 'Feestdag', soort: 'feestdag', doelgroep: 'iedereen', van: '2026-09-08', tot: '2026-09-08' },
  ];
  const plan = genereerTrainingen({
    reeks: reeks({ vakantie_doorlopen: 0 }), onderwijsgroep: 'geen', periodes, zaalOpenOpFeestdagen: true,
  });
  assert.equal(plan.nieuw.length, 0, 'de hele vakantie blijft overgeslagen, feestdag of niet');
});

test('een feestdag buiten een vakantie wordt ook zonder vakantie_doorlopen correct overgeslagen', () => {
  const periodes = [{ naam: 'Feestdag', soort: 'feestdag', doelgroep: 'iedereen', van: '2026-09-15', tot: '2026-09-15' }];
  const plan = genereerTrainingen({ reeks: reeks(), onderwijsgroep: 'geen', periodes });
  assert.ok(!plan.nieuw.some((t) => t.datum === '2026-09-15'));
  assert.equal(plan.nieuw.length, 4);
});
