// CSV lezen en schrijven.
//
// Het zwaartepunt: een veld met een komma, een aanhalingsteken of een
// regeleinde mag de kolomindeling niet breken. `split(',')` zou hier stil
// falen, en dat is precies het soort fout die in dit project meermaals
// gevangen moest worden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { csvSchrijven, csvLezen } from '../src/lib/csv.js';

const KOLOMMEN = [
  { sleutel: 'naam', label: 'Naam' },
  { sleutel: 'adres', label: 'Adres' },
];

test('een gewoon veld komt zonder aanhalingstekens terug', () => {
  const csv = csvSchrijven([{ naam: 'Dries', adres: 'Kerkstraat 5' }], KOLOMMEN);
  assert.ok(!csv.includes('"'), 'geen onnodige aanhalingstekens');
});

test('een komma in een veld breekt de kolomindeling niet', () => {
  const rijen = [{ naam: 'Dries', adres: 'Bondgenotenlaan 1, bus 2' }];
  const csv = csvSchrijven(rijen, KOLOMMEN);
  const terug = csvLezen(csv);
  assert.equal(terug.length, 1, 'de komma mag geen tweede rij aanmaken');
  assert.equal(terug[0].Adres, 'Bondgenotenlaan 1, bus 2');
});

test('een aanhalingsteken in een veld komt er correct uit', () => {
  const rijen = [{ naam: 'Otto "O" Muñiz', adres: 'Kerkstraat 5' }];
  const csv = csvSchrijven(rijen, KOLOMMEN);
  const terug = csvLezen(csv);
  assert.equal(terug[0].Naam, 'Otto "O" Muñiz');
});

test('een rondtrip van schrijven en lezen levert dezelfde waarden op', () => {
  const rijen = [
    { naam: 'Dries', adres: 'Bondgenotenlaan 1, bus 2' },
    { naam: 'Anna Maria', adres: 'Kerkstraat 5' },
    { naam: 'Zonder adres', adres: '' },
  ];
  const csv = csvSchrijven(rijen, KOLOMMEN);
  const terug = csvLezen(csv);
  assert.equal(terug.length, 3);
  assert.equal(terug[0].Naam, 'Dries');
  assert.equal(terug[2].Adres, '');
});

test('zowel \\n als \\r\\n worden aanvaard', () => {
  assert.equal(csvLezen('Naam,Adres\nA,B\nC,D').length, 2);
  assert.equal(csvLezen('Naam,Adres\r\nA,B\r\nC,D').length, 2);
});

test('een volledig lege rij wordt overgeslagen', () => {
  // Excel voegt vaak een lege laatste rij toe bij het opslaan.
  const terug = csvLezen('Naam,Adres\r\nA,B\r\n,\r\n');
  assert.equal(terug.length, 1);
});

test('een bestand dat niet op een regeleinde eindigt, verliest de laatste rij niet', () => {
  const terug = csvLezen('Naam,Adres\r\nA,B');
  assert.equal(terug.length, 1);
  assert.equal(terug[0].Naam, 'A');
});

test('een lege invoer geeft een lege lijst, geen fout', () => {
  assert.deepEqual(csvLezen(''), []);
});

test('een BOM van Excel wordt weggewerkt', () => {
  const terug = csvLezen('\uFEFFNaam,Adres\r\nA,B\r\n');
  assert.equal(terug[0].Naam, 'A');
});

test('waarden worden getrimd', () => {
  const terug = csvLezen('Naam,Adres\r\n  A  , B \r\n');
  assert.equal(terug[0].Naam, 'A');
  assert.equal(terug[0].Adres, 'B');
});

test('een regeleinde binnen een aangehaald veld blijft binnen dat veld', () => {
  const terug = csvLezen('Naam,Adres\r\n"Dries\nDe Speler",Kerkstraat 5\r\n');
  assert.equal(terug.length, 1);
  assert.equal(terug[0].Naam, 'Dries\nDe Speler');
});
