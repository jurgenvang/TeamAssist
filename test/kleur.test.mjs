// De contrastcontrole voor de clubaccentkleur.
//
// Het belangrijkste hier: een afgekeurde kleur wordt geweigerd, nooit
// stilzwijgend aangepast. Een club moet weten dat haar kleur niet werkt, niet
// een andere kleur krijgen zonder het te merken.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  geldigeHex, contrastMetWit, contrastTussen, kiesLeesbareTekstkleur,
  keurAccentkleurGoed, keurAchtergrondkleurGoed,
} from '../src/lib/kleur.js';

test('een geldige hexkleur wordt herkend', () => {
  assert.equal(geldigeHex('#a4232b'), true);
  assert.equal(geldigeHex('#ABCDEF'), true);
});

test('ongeldige waarden worden geweigerd', () => {
  for (const w of ['geel', '#12345', '#gggggg', 'a4232b', '', null, undefined]) {
    assert.equal(geldigeHex(w), false, `'${w}' hoort ongeldig te zijn`);
  }
});

test('zwart en donkere kleuren hebben een hoog contrast met wit', () => {
  assert.ok(contrastMetWit('#000000') > 20);
});

test('wit zelf heeft geen contrast met wit', () => {
  assert.ok(contrastMetWit('#ffffff') < 1.1);
});

test('een lichte kleur zoals geel wordt afgekeurd', () => {
  const uit = keurAccentkleurGoed('#ffff00');
  assert.equal(uit.ok, false);
  assert.match(uit.reden, /contrast/);
});

test('een donkere clubkleur wordt goedgekeurd', () => {
  const uit = keurAccentkleurGoed('#a4232b');
  assert.equal(uit.ok, true);
  assert.ok(uit.contrast >= 4.5);
});

test('een ongeldige hexwaarde wordt geweigerd vóór het contrast berekend wordt', () => {
  const uit = keurAccentkleurGoed('niet-geldig');
  assert.equal(uit.ok, false);
  assert.equal(uit.contrast, undefined);
});

test('de functie verzint nooit een vervangkleur', () => {
  // Geen enkel geretourneerd veld mag een kleur zijn die niet de invoer was.
  const uit = keurAccentkleurGoed('#ffff00');
  assert.ok(!('kleur' in uit) && !('voorgesteld' in uit));
});

test('contrastTussen werkt symmetrisch', () => {
  assert.equal(contrastTussen('#000000', '#ffffff'), contrastTussen('#ffffff', '#000000'));
});

test('kiesLeesbareTekstkleur kiest zwart voor een felle merkkleur', () => {
  // Het echte logo-oranje van de club, met het oog geschat: leest beter met
  // zwarte tekst dan met witte.
  assert.equal(kiesLeesbareTekstkleur('#f5821f'), '#000000');
});

test('kiesLeesbareTekstkleur kiest wit voor een donkere kleur', () => {
  assert.equal(kiesLeesbareTekstkleur('#0d1a2b'), '#ffffff');
});

test('keurAchtergrondkleurGoed keurt het logo-oranje goed, waar keurAccentkleurGoed het afkeurt', () => {
  // Dit is precies de reden dat er twee functies bestaan: een felle merkkleur
  // faalt als accent (te weinig contrast met wit) maar werkt als achtergrond
  // met de juiste tekstkleur erop.
  const alsAccent = keurAccentkleurGoed('#f5821f');
  const alsAchtergrond = keurAchtergrondkleurGoed('#f5821f');
  assert.equal(alsAccent.ok, false);
  assert.equal(alsAchtergrond.ok, true);
  assert.equal(alsAchtergrond.tekstkleur, '#000000');
});

test('zelfs de slechtst denkbare grijswaarde haalt nog net de contrastgrens', () => {
  // Wiskundige garantie: met de beste van zwart of wit als tekstkleur is er
  // geen enkele geldige hexkleur die deze controle om reden van contrast kan
  // laten falen. Getoetst over de volledige reeks grijswaarden.
  let slechtsteContrast = Infinity;
  for (let v = 0; v <= 255; v++) {
    const hex = '#' + [v, v, v].map((x) => x.toString(16).padStart(2, '0')).join('');
    const uit = keurAchtergrondkleurGoed(hex);
    assert.equal(uit.ok, true, `${hex} zou nooit geweigerd mogen worden`);
    slechtsteContrast = Math.min(slechtsteContrast, uit.contrast);
  }
  assert.ok(slechtsteContrast >= 4.5);
  assert.ok(slechtsteContrast < 4.7, 'de grens ligt maar net erboven, dat hoort zo');
});

test('een felle, verzadigde kleur zoals rood of groen wordt ook goedgekeurd', () => {
  for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']) {
    assert.equal(keurAchtergrondkleurGoed(hex).ok, true, `${hex} hoort goedgekeurd te worden`);
  }
});

test('keurAchtergrondkleurGoed verzint nooit een vervangkleur', () => {
  const uit = keurAchtergrondkleurGoed('#808080');
  assert.ok(!('kleur' in uit) && !('voorgesteld' in uit));
});

test('een ongeldige hex wordt door keurAchtergrondkleurGoed geweigerd vóór er iets berekend wordt', () => {
  const uit = keurAchtergrondkleurGoed('niet-geldig');
  assert.equal(uit.ok, false);
  assert.equal(uit.contrast, undefined);
});
