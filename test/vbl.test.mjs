// De client voor de API van Basketbal Vlaanderen.
//
// De antwoorden hier zijn nagebootst naar een echte respons van
// `BVBL1125J16  2`: dertien spelers en twee coaches, met de velden zoals ze
// werkelijk terugkwamen.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  teamDetailUrl,
  orgDetailUrl,
  haalVbl,
  zoekPloegGuids,
  sleutelpaden,
  vatPloegSamen,
} from '../src/lib/vbl.js';

const J16 = 'BVBL1125J16  2';

const PLOEGANTWOORD = [
  {
    guid: J16,
    naam: 'J16 B',
    spelers: [
      { lidNr: '717331', relGuid: 'REL-1', naam: 'Dries van Geijstelen Forier', sGebDat: '17-03-2010', sAanslDat: '01-09-2018', ma: 'N' },
      { lidNr: '730885', relGuid: 'REL-2', naam: 'Otto Muñiz Espinoza', sGebDat: '02-11-2010', sAanslDat: '01-09-2021', ma: 'J' },
      { lidNr: '725314', relGuid: 'REL-3', naam: 'Max Cuyvers', sGebDat: '25-06-2010', sAanslDat: '01-09-2019', ma: 'N' },
    ],
    tvlijst: [
      { lidNr: '48713', relGuid: 'REL-C1', naam: 'Dieter Devroey', tvCaC: 'Coach', tvNr: 1 },
      { lidNr: '601903', relGuid: 'REL-C2', naam: 'Mathias Vanduffel', tvCaC: 'Coach', tvNr: 2 },
    ],
  },
];

test('de twee spaties in een ploeg-GUID worden als %20%20 verstuurd', () => {
  // Een + wordt door deze server niet als spatie gelezen. Dat leverde eerder
  // generieke WCF-fouten op die op een storing leken.
  const url = teamDetailUrl(J16);
  assert.ok(url.includes('BVBL1125J16%20%202'), url);
  assert.ok(!url.includes('+'));
});

test('de club-URL is de andere parameternaam', () => {
  // TeamDetailByGuid gebruikt teamguid, OrgDetailByGuid gebruikt issguid.
  assert.ok(orgDetailUrl('BVBL1125').includes('issguid=BVBL1125'));
  assert.ok(teamDetailUrl(J16).includes('teamguid='));
});

test('een leeg antwoord is een fout, geen lege ploeg', async () => {
  const leeg = async () => new Response('', { status: 200 });
  await assert.rejects(() => haalVbl('https://x', leeg), /leeg antwoord/);
});

test('een XML-foutpagina wordt herkend als geen JSON', async () => {
  // Wisseq antwoordt zo bij een ongeldige GUID. Zou dit als storing gelezen
  // worden, dan blijft iemand naar het netwerk zoeken terwijl de GUID fout is.
  const xml = async () => new Response('<html><body>Request Error</body></html>', { status: 200 });
  await assert.rejects(() => haalVbl('https://x', xml), /geen JSON/);
});

test('een 500 wordt doorgegeven met de status erbij', async () => {
  const stuk = async () => new Response('nee', { status: 500 });
  await assert.rejects(() => haalVbl('https://x', stuk), /status 500/);
});

test('ploeg-GUIDs worden op vorm gevonden, niet op pad', async () => {
  const org = { clubs: [{ guid: 'BVBL1125', ploegen: [{ tGuid: 'BVBL1125J16  2' }, { tGuid: 'BVBL1125G12  1' }] }] };
  assert.deepEqual(zoekPloegGuids(org, 'BVBL1125'), ['BVBL1125G12  1', 'BVBL1125J16  2']);
});

test('de club-GUID zelf telt niet mee als ploeg', () => {
  const org = { guid: 'BVBL1125', teams: [{ guid: 'BVBL1125J16  2' }] };
  assert.deepEqual(zoekPloegGuids(org, 'BVBL1125'), ['BVBL1125J16  2']);
});

test('GUIDs van een andere club worden genegeerd', () => {
  const org = { teams: [{ guid: 'BVBL1053J16  1' }, { guid: 'BVBL1125J16  2' }] };
  assert.deepEqual(zoekPloegGuids(org, 'BVBL1125'), ['BVBL1125J16  2']);
});

test('de sleutelpaden tonen ook velden binnen een lijst', () => {
  const paden = sleutelpaden(PLOEGANTWOORD);
  assert.ok(paden.includes('spelers.ma'));
  assert.ok(paden.includes('tvlijst.tvCaC'));
  assert.ok(paden.includes('spelers.sGebDat'));
});

test('de samenvatting telt waarden zonder namen te tonen', () => {
  const s = vatPloegSamen(PLOEGANTWOORD);
  assert.equal(s.spelers.aantal, 3);
  assert.deepEqual(s.spelers.ma, { N: 2, J: 1 });
  assert.equal(s.staf.aantal, 2);
  assert.deepEqual(s.staf.tvCaC, { Coach: 2 });

  // Dit is de kern: hier gaan gegevens van minderjarigen over de lijn, dus er
  // hoort geen naam in te zitten.
  const tekst = JSON.stringify(s);
  assert.ok(!tekst.includes('Dries'), 'geen namen in de samenvatting');
  assert.ok(!tekst.includes('Muñiz'));
  assert.ok(!tekst.includes('Devroey'));
});

test('de samenvatting geeft voorbeelden van velden met een onbekend formaat', () => {
  const s = vatPloegSamen(PLOEGANTWOORD);
  assert.equal(s.spelers.gebdat_voorbeelden[0], '17-03-2010');
  assert.ok(s.spelers.aansldat_voorbeelden.length > 0);
});

test('de samenvatting telt hoeveel spelers een sleutel van de bond dragen', () => {
  const s = vatPloegSamen(PLOEGANTWOORD);
  assert.equal(s.spelers.met_relguid, 3);
  assert.equal(s.spelers.met_lidnr, 3);
});

test('een lege waarde valt niet weg in de telling', () => {
  const s = vatPloegSamen([{ spelers: [{ ma: null }, { ma: 'J' }], tvlijst: [] }]);
  assert.deepEqual(s.spelers.ma, { '(leeg)': 1, J: 1 });
});

test('een antwoord zonder spelers of staf breekt niets', () => {
  const s = vatPloegSamen([{ guid: J16, naam: 'J16 B' }]);
  assert.equal(s.spelers.aantal, 0);
  assert.equal(s.staf.aantal, 0);
});
