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

test('Overzicht staat altijd vooraan, ook voor een official (T22); een ouder van een official ziet Aanduidingen ook', () => {
  const yo = bouwRechten({ rollen: [{ rol: 'YO', team_guid: null }] }).overzicht();
  assert.deepEqual(tabbalkTabbladen(yo).map((t) => t.id), ['mij', 'mijnclub', 'aanduidingen']);
  const ouder = bouwRechten().overzicht();
  assert.deepEqual(tabbalkTabbladen(ouder).map((t) => t.id), ['mij', 'mijnclub']);
  assert.deepEqual(tabbalkTabbladen(ouder, { ouderVanOfficial: true }).map((t) => t.id), ['mij', 'mijnclub', 'aanduidingen']);
  // Iemand met alles: Overzicht eerst, de rest in de beslisde volgorde.
  const alles = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }, { rol: 'YOPLUS', team_guid: null }] }).overzicht();
  assert.deepEqual(tabbalkTabbladen(alles, { verborgen: [] }).map((t) => t.id), ['mij', 'mijnclub', 'aanduidingen', 'cluboverzicht', 'regio', 'ploegen', 'personen']);
  assert.deepEqual(menuTabbladen(ouder, { ouderVanOfficial: true }), [], 'geen beheer voor een ouder');
});

test('een coach ziet geen beheer en geen personen', () => {
  const rechten = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: J16 }] }).overzicht();
  assert.deepEqual(zichtbareTabbladen(rechten).map((t) => t.id), ['mij', 'mijnclub', 'ploegen']);
});

test('een speler ziet het overzicht en Mijn club, niet het scherm van de begeleiding', () => {
  // Tot 0.46.0 kreeg een speler of ouder het tabblad Ploegen (team.bekijken),
  // maar geen enkele route erachter gaf hem iets: het bleef leeg.
  const rechten = bouwRechten({ ploegenAlsSpeler: [J16] }).overzicht();
  assert.deepEqual(zichtbareTabbladen(rechten).map((t) => t.id), ['mij', 'mijnclub']);
  const ouder = bouwRechten({ ploegenViaKind: [J16] }).overzicht();
  assert.deepEqual(zichtbareTabbladen(ouder).map((t) => t.id), ['mij', 'mijnclub']);
  const pv = bouwRechten({ rollen: [{ rol: 'PLOEGV', team_guid: J16 }] }).overzicht();
  assert.deepEqual(zichtbareTabbladen(pv).map((t) => t.id), ['mij', 'mijnclub', 'ploegen']);
});

test('wie geen enkele rol heeft, houdt enkel het overzicht', () => {
  assert.deepEqual(zichtbareTabbladen(bouwRechten().overzicht()).map((t) => t.id), ['mij', 'mijnclub']);
});

test('een beheerder die als coach kijkt, verliest de beheertabbladen', () => {
  // De navigatie volgt de versmalde rechten, dus het scherm klopt met wat de
  // backend zou toelaten.
  const echt = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] });
  const rechten = beperkTot(echt, 'COACH', J16).overzicht();
  assert.deepEqual(zichtbareTabbladen(rechten).map((t) => t.id), ['mij', 'mijnclub', 'ploegen']);
});

test('het overzicht heeft geen recht nodig', () => {
  assert.equal(TABBLADEN.find((t) => t.id === 'mij').recht, null);
});

test('de beheerschermen staan in het naammenu, niet in de tabbalk', () => {
  const rechten = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] }).overzicht();
  assert.deepEqual(tabbalkTabbladen(rechten).map((t) => t.id), ['mij', 'mijnclub', 'cluboverzicht', 'regio', 'ploegen', 'personen']);
  assert.deepEqual(menuTabbladen(rechten).map((t) => t.id), ['vergoedingen', 'dagelijksbeheer', 'configuratie', 'zaalbeheer']);
});

test('wie de officials beheert, ziet het Cluboverzicht in de tabbalk, en geen clubbeheer', () => {
  const yoadm = bouwRechten({ rollen: [{ rol: 'YOADM', team_guid: null }] }).overzicht();
  assert.deepEqual(tabbalkTabbladen(yoadm).map((t) => t.id), ['mij', 'mijnclub', 'cluboverzicht', 'regio']);
  // Dagelijks beheer en Configuratie, maar enkel met de secties van de
  // officials (data-recht); Zaalbeheer niet (0.41.0).
  assert.deepEqual(menuTabbladen(yoadm).map((t) => t.id), ['vergoedingen', 'dagelijksbeheer', 'configuratie']);
  // De penningmeester sluit de maand af, maar beheert de officials niet.
  const finadm = bouwRechten({ rollen: [{ rol: 'FINADM', team_guid: null }] }).overzicht();
  assert.ok(!tabbalkTabbladen(finadm).some((t) => t.id === 'cluboverzicht'));
  assert.deepEqual(menuTabbladen(finadm).map((t) => t.id), ['vergoedingen']);
  const yo = bouwRechten({ rollen: [{ rol: 'YO', team_guid: null }] }).overzicht();
  assert.ok(!tabbalkTabbladen(yo).some((t) => t.id === 'cluboverzicht'), 'een official ziet het niet');
  assert.deepEqual(menuTabbladen(yo), [], 'ook geen Vergoedingen club');
});

test('een coach heeft niets onder Beheer', () => {
  const rechten = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: J16 }] }).overzicht();
  assert.deepEqual(menuTabbladen(rechten), []);
});

test('een beheerder die als coach kijkt, verliest ook Beheer in het menu', () => {
  const echt = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] });
  assert.deepEqual(menuTabbladen(beperkTot(echt, 'COACH', J16).overzicht()), []);
});

// --- T22: de tabbalk als het blok van YOAssist, op één rij die schuift -------------

test('T22: de tabbalk is één rij die schuift, nooit over meerdere regels', () => {
  const css = readFileSync(new URL('../public/stijl.css', import.meta.url), 'utf8');
  const nav = css.slice(css.indexOf('\nnav {'), css.indexOf('}', css.indexOf('\nnav {')));
  assert.match(nav, /overflow-x: auto/);
  assert.ok(!/flex-wrap:\s*wrap/.test(nav), 'geen tweede regel');
  assert.match(nav, /background: var\(--tabs-vlak\)/, 'het grijze blok van YOAssist');
  const knop = css.slice(css.indexOf('\nnav button {'), css.indexOf('}', css.indexOf('\nnav button {')));
  assert.match(knop, /white-space: nowrap/, 'een tabblad breekt niet af');
  assert.match(knop, /flex: 1 0 auto/, 'weinig tabbladen vullen de breedte, veel tabbladen schuiven');
  assert.match(css, /nav button\[aria-current='true'\] \{\s*background: var\(--kaart\)/, 'het gekozen tabblad als wit vlak');
});

test('T22: het gekozen tabblad schuift in beeld, en een rand vervaagt waar er nog meer is', () => {
  const bron = readFileSync(new URL('../public/js/navigatie.js', import.meta.url), 'utf8');
  assert.match(bron, /nav\.scrollTo\(\{ left:/);
  assert.match(bron, /classList\.toggle\('meer-rechts'/);
  assert.match(bron, /classList\.toggle\('meer-links'/);
});
