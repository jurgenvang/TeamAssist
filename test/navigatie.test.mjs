// De navigatie.
//
// Welke tabbladen er staan, volgt uit de rechten die de backend teruggeeft. Zo
// blijft er één plaats waar bepaald wordt wat iemand mag — en toont het scherm
// nooit een tabblad waar de backend toch nee op zegt.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bouwRechten, beperkTot } from '../src/lib/rechten.js';

// De module leest uit het DOM bij het bouwen, dus hier wordt enkel de zuivere
// keuzefunctie getest. Die uit het bestand halen houdt de test los van een
// browser.
const bron = readFileSync(new URL('../public/js/navigatie.js', import.meta.url), 'utf8');
const { TABBLADEN, zichtbareTabbladen } = await import(
  `data:text/javascript,${encodeURIComponent(
    bron.replace(/^import .*$/m, '').replace(/export function bouwNavigatie[\s\S]*$/, '')
  )}`
);

const J16 = 'BVBL1125J16  2';

test('een beheerder ziet alle tabbladen', () => {
  const rechten = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] }).overzicht();
  assert.deepEqual(zichtbareTabbladen(rechten).map((t) => t.id), TABBLADEN.map((t) => t.id));
});

test('een coach ziet geen beheer en geen personen', () => {
  const rechten = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: J16 }] }).overzicht();
  assert.deepEqual(zichtbareTabbladen(rechten).map((t) => t.id), ['mij', 'ploegen']);
});

test('een speler ziet enkel het overzicht en zijn ploeg', () => {
  const rechten = bouwRechten({ ploegenAlsSpeler: [J16] }).overzicht();
  assert.deepEqual(zichtbareTabbladen(rechten).map((t) => t.id), ['mij', 'ploegen']);
});

test('wie geen enkele rol heeft, houdt enkel het overzicht', () => {
  assert.deepEqual(zichtbareTabbladen(bouwRechten().overzicht()).map((t) => t.id), ['mij']);
});

test('een beheerder die als coach kijkt, verliest de beheertabbladen', () => {
  // De navigatie volgt de versmalde rechten, dus het scherm klopt met wat de
  // backend zou toelaten.
  const echt = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] });
  const rechten = beperkTot(echt, 'COACH', J16).overzicht();
  assert.deepEqual(zichtbareTabbladen(rechten).map((t) => t.id), ['mij', 'ploegen']);
});

test('het overzicht heeft geen recht nodig', () => {
  assert.equal(TABBLADEN.find((t) => t.id === 'mij').recht, null);
});
