// Het plan voor spelers en staf.
//
// De zwaarste tests van dit bestand gaan over wat er niet gebeurt: niemand
// samenvoegen bij twijfel, niemand uit een ploeg halen bij een halve lijst, en
// niets overschrijven wat de club zelf heeft ingevuld.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakLedenplan, zoekPersoon, velden } from '../src/lib/ledensync.js';

const speler = (over = {}) => ({
  lidNr: '717331',
  relGuid: 'REL-1',
  naam: 'Dries van Geijstelen Forier',
  sGebDat: '17-03-2010',
  sAanslDat: '11-08-2026 13:40',
  ma: null,
  ...over,
});

const persoon = (over = {}) => ({
  id: 'p1',
  voornaam: 'Dries',
  achternaam: 'van Geijstelen Forier',
  naam_vbl: 'Dries van Geijstelen Forier',
  naam_bron: 'afgeleid',
  rel_guid: null,
  lid_nr: null,
  geboortedatum: '2010-03-17',
  geboortedatum_bron: 'club',
  ...over,
});

test('een lid wordt herkend aan zijn relatie-GUID', () => {
  const gevonden = zoekPersoon(speler(), [persoon({ rel_guid: 'REL-1' })]);
  assert.equal(gevonden.hoe, 'relguid');
  assert.equal(gevonden.persoon.id, 'p1');
});

test('zonder relatie-GUID wordt er op naam en geboortedatum gekoppeld', () => {
  const gevonden = zoekPersoon(speler(), [persoon()]);
  assert.equal(gevonden.hoe, 'naam en geboortedatum');
});

test('twee personen met dezelfde naam geven twijfel, geen keuze', () => {
  const gevonden = zoekPersoon(speler(), [persoon(), persoon({ id: 'p2' })]);
  assert.ok(gevonden.twijfel);
  assert.equal(gevonden.persoon, undefined);
  assert.equal(gevonden.twijfel.length, 2);
});

test('dezelfde naam met een andere geboortedatum geeft twijfel', () => {
  // Vermoedelijk een broer, een naamgenoot, of een tikfout. Niet raden.
  const gevonden = zoekPersoon(speler(), [persoon({ geboortedatum: '2012-05-01' })]);
  assert.ok(gevonden.twijfel);
  assert.match(gevonden.hoe, /andere geboortedatum/);
});

test('iemand met een andere relatie-GUID wordt nooit gekoppeld', () => {
  // Dat zijn twee verschillende leden van de bond, hoe gelijk de namen ook zijn.
  const gevonden = zoekPersoon(speler(), [persoon({ rel_guid: 'REL-9' })]);
  assert.equal(gevonden.hoe, 'nieuw');
  assert.equal(gevonden.persoon, null);
});

test('accenten en dubbele spaties maken bij het matchen niet uit', () => {
  const lid = speler({ relGuid: null, naam: 'Otto  Muñiz Espinoza', sGebDat: '02-11-2010' });
  const p = persoon({ id: 'p9', voornaam: 'Otto', achternaam: 'Muniz Espinoza', geboortedatum: '2010-11-02' });
  assert.equal(zoekPersoon(lid, [p]).persoon.id, 'p9');
});

test('de velden worden afgeleid zoals afgesproken', () => {
  const v = velden(speler());
  assert.equal(v.voornaam, 'Dries');
  assert.equal(v.achternaam, 'van Geijstelen Forier');
  assert.equal(v.geboortedatum, '2010-03-17');
  assert.equal(v.naam_vbl, 'Dries van Geijstelen Forier');
});

test('een onleesbare geboortedatum wordt gemeld, niet stil genegeerd', () => {
  const plan = maakLedenplan({ spelers: [speler({ sGebDat: '31-02-2010' })] });
  assert.equal(plan.onleesbare_datums.length, 1);
  assert.equal(plan.nieuw[0].geboortedatum, null);
});

test('een ontbrekende geboortedatum is geen fout', () => {
  const plan = maakLedenplan({ spelers: [speler({ sGebDat: null })] });
  assert.equal(plan.onleesbare_datums.length, 0);
});

test('een handmatig rechtgezette naam wordt niet overschreven', () => {
  // Precies waar de bron-vlag voor bestaat: een dubbele voornaam met een spatie
  // wordt één keer rechtgezet en blijft daarna staan.
  const plan = maakLedenplan({
    spelers: [speler({ naam: 'Anna Maria Peeters', relGuid: 'REL-7', sGebDat: '01-01-2011' })],
    personen: [
      persoon({
        id: 'p7',
        rel_guid: 'REL-7',
        voornaam: 'Anna Maria',
        achternaam: 'Peeters',
        naam_vbl: 'iets anders',
        naam_bron: 'club',
        geboortedatum: '2011-01-01',
      }),
    ],
  });
  // Het lidnummer mag wél ingevuld worden; de naam niet.
  assert.deepEqual(plan.bijwerken[0].verschillen, ['lidnummer']);
  assert.equal(plan.bijwerken[0].voornaam, 'Anna');
});

test('een geboortedatum met bron club blijft staan', () => {
  const plan = maakLedenplan({
    spelers: [speler({ sGebDat: '18-03-2010' })],
    personen: [persoon({ rel_guid: 'REL-1', geboortedatum_bron: 'club' })],
  });
  assert.ok(
    !plan.bijwerken.some((b) => b.verschillen.includes('geboortedatum')),
    'de datum van de club hoort te blijven staan'
  );
});

test('een geboortedatum van de bond wordt wel bijgewerkt', () => {
  const plan = maakLedenplan({
    spelers: [speler({ sGebDat: '18-03-2010' })],
    personen: [persoon({ rel_guid: 'REL-1', geboortedatum_bron: 'vbl' })],
  });
  assert.ok(plan.bijwerken[0].verschillen.includes('geboortedatum'));
});

test('een lege spelerslijst haalt niemand uit de ploeg', () => {
  // Aan het begin van een seizoen loopt de bond weken achter. Dat is de normale
  // toestand, geen reden om een ploeg leeg te maken.
  const plan = maakLedenplan({
    spelers: [],
    inPloeg: [
      { persoon_id: 'p1', rel_guid: 'REL-1', bij_bond: 1 },
      { persoon_id: 'p2', rel_guid: 'REL-2', bij_bond: 1 },
    ],
  });
  assert.equal(plan.uit_ploeg.length, 0);
  assert.equal(plan.genegeerd_uit_ploeg.length, 2);
  assert.equal(plan.status, 'deels');
  assert.match(plan.melding, /achterloopt/);
});

test('meer dan een derde weg wordt genegeerd', () => {
  const inPloeg = Array.from({ length: 9 }, (_, i) => ({
    persoon_id: `p${i}`,
    rel_guid: `REL-${i}`,
    bij_bond: 1,
  }));
  const spelers = inPloeg.slice(0, 5).map((r, i) => speler({ relGuid: r.rel_guid, naam: `Speler ${i}` }));
  const plan = maakLedenplan({ spelers, inPloeg });
  assert.equal(plan.uit_ploeg.length, 0);
  assert.equal(plan.genegeerd_uit_ploeg.length, 4);
});

test('één speler minder wordt wel doorgevoerd', () => {
  const inPloeg = Array.from({ length: 9 }, (_, i) => ({
    persoon_id: `p${i}`,
    rel_guid: `REL-${i}`,
    bij_bond: 1,
  }));
  const spelers = inPloeg.slice(0, 8).map((r, i) => speler({ relGuid: r.rel_guid, naam: `Speler ${i}` }));
  const plan = maakLedenplan({ spelers, inPloeg });
  assert.equal(plan.uit_ploeg.length, 1);
  assert.equal(plan.status, 'ok');
});

test('staf komt als eigen soort in het plan', () => {
  const plan = maakLedenplan({
    staf: [{ lidNr: '48713', relGuid: 'REL-C1', naam: 'Dieter Devroey', tvCaC: 'Coach' }],
  });
  assert.equal(plan.nieuw.length, 1);
  assert.equal(plan.nieuw[0].soort, 'staf');
  assert.equal(plan.nieuw[0].geboortedatum, null, 'de staflijst heeft geen geboortedatum');
});

test('een handmatig toegevoegde coach wordt nooit weggesynchroniseerd', () => {
  const plan = maakLedenplan({
    staf: [{ relGuid: 'REL-C1', naam: 'Dieter Devroey' }],
    rollen: [
      { persoon_id: 'p20', rel_guid: 'REL-C9', bron: 'club' },
      { persoon_id: 'p21', rel_guid: 'REL-C8', bron: 'vbl' },
    ],
  });
  assert.equal(plan.rollen_weg.length, 1);
  assert.equal(plan.rollen_weg[0].persoon_id, 'p21');
});

test('een lege staflijst haalt geen enkele coachrol weg', () => {
  const plan = maakLedenplan({
    staf: [],
    rollen: [{ persoon_id: 'p21', rel_guid: 'REL-C8', bron: 'vbl' }],
  });
  assert.equal(plan.rollen_weg.length, 0);
});

test('twijfelgevallen zetten de ronde op deels', () => {
  const plan = maakLedenplan({
    spelers: [speler({ relGuid: null })],
    personen: [persoon(), persoon({ id: 'p2' })],
  });
  assert.equal(plan.status, 'deels');
  assert.equal(plan.twijfel.length, 1);
  assert.equal(plan.nieuw.length, 0, 'bij twijfel wordt er niemand aangemaakt');
});
