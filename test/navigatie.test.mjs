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
const { TABBLADEN, zichtbareTabbladen, tabbalkTabbladen, menuTabbladen } = await import(
  `data:text/javascript,${encodeURIComponent(
    bron.replace(/^import .*$/m, '').replace(/export function bouwNavigatie[\s\S]*$/, '')
  )}`
);

const J16 = 'BVBL1125J16  2';

test('een beheerder ziet alle tabbladen, behalve dat van een official', () => {
  // Beheerder zijn maakt nog geen official: wie fluit, heeft de rol YO of YO+.
  const rechten = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] }).overzicht();
  assert.deepEqual(
    zichtbareTabbladen(rechten).map((t) => t.id),
    TABBLADEN.map((t) => t.id).filter((id) => id !== 'aanduidingen')
  );
});

test('een official ziet Aanduidingen vooraan; een ouder van een official ook', () => {
  const yo = bouwRechten({ rollen: [{ rol: 'YO', team_guid: null }] }).overzicht();
  assert.deepEqual(tabbalkTabbladen(yo).map((t) => t.id), ['aanduidingen', 'mij']);
  const ouder = bouwRechten().overzicht();
  assert.deepEqual(tabbalkTabbladen(ouder).map((t) => t.id), ['mij']);
  assert.deepEqual(tabbalkTabbladen(ouder, { ouderVanOfficial: true }).map((t) => t.id), ['aanduidingen', 'mij']);
  assert.deepEqual(menuTabbladen(ouder, { ouderVanOfficial: true }), [], 'geen beheer voor een ouder');
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

test('de beheerschermen staan in het naammenu, niet in de tabbalk', () => {
  const rechten = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] }).overzicht();
  assert.deepEqual(tabbalkTabbladen(rechten).map((t) => t.id), ['mij', 'ploegen', 'personen']);
  assert.deepEqual(menuTabbladen(rechten).map((t) => t.id), ['dagelijksbeheer', 'configuratie', 'zaalbeheer']);
});

test('een coach heeft niets onder Beheer', () => {
  const rechten = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: J16 }] }).overzicht();
  assert.deepEqual(menuTabbladen(rechten), []);
});

test('een beheerder die als coach kijkt, verliest ook Beheer in het menu', () => {
  const echt = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] });
  assert.deepEqual(menuTabbladen(beperkTot(echt, 'COACH', J16).overzicht()), []);
});
