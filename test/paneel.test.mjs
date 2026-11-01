// Panelen (0.40.1): wat het naammenu opent, staat over de pagina heen, zoals
// in YOAssist — niet onderaan het tabblad dat toevallig openstond. Altijd
// hoogstens één tegelijk.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABBLADEN } from '../public/js/navigatie.js';

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');
const html = lees('../public/index.html');
const app = lees('../public/js/app.js');

const PERSOONLIJK = ['berichtenscherm', 'vergoedingscherm', 'voorkeuren', 'testrolscherm'];
const BEHEER = TABBLADEN.filter((t) => t.inMenu).map((t) => `tab-${t.id}`);

function sectie(id) {
  const start = html.indexOf(`<section id="${id}"`);
  assert.ok(start >= 0, id);
  return html.slice(start, html.indexOf('</section>', start));
}

test('elk scherm uit het naammenu is een paneel, met een titel en een ×', () => {
  for (const id of [...PERSOONLIJK, ...BEHEER]) {
    const s = sectie(id);
    const kop = s.slice(0, s.indexOf('>'));
    assert.match(kop, /class="paneel( breed)?"/, `${id} is een paneel`);
    assert.match(kop, /hidden/, `${id} staat standaard dicht`);
    assert.match(s, /<div class="paneel-kop"><h2>[^<]+<\/h2><button type="button" class="sluit" data-sluit/, `${id} heeft een kop met ×`);
  }
  assert.ok(html.includes('id="paneelachtergrond"'));
});

test('niemand zet een paneel nog rechtstreeks open of dicht', () => {
  // Zou een scherm zichzelf met .hidden openen, dan blijft het vorige paneel
  // staan en de achtergrond weg — precies de fout van 0.40.0.
  const bronnen = ['../public/js/app.js', '../public/js/schermen/berichten.js', '../public/js/schermen/mijn-vergoeding.js',
    '../public/js/schermen/voorkeuren.js'].map(lees).join('\n');
  for (const id of [...PERSOONLIJK, ...BEHEER]) {
    assert.ok(!new RegExp(`el\\('${id}'\\)\\.hidden =`).test(bronnen), id);
  }
  assert.match(app, /openPaneel\('testrolscherm'\)/);
});

test('de tabbalk raakt de panelen niet', () => {
  const nav = lees('../public/js/navigatie.js');
  assert.match(nav, /for \(const tab of TABBLADEN\.filter\(\(t\) => !t\.inMenu\)\)/);
});

// --- het gedrag, met een nagemaakte DOM -------------------------------------

function nepDom(ids) {
  const knopen = new Map(ids.map((id) => [id, { id, hidden: true, scrollTop: 5 }]));
  const luisteraars = {};
  const klassen = new Set();
  globalThis.document = {
    getElementById: (id) => knopen.get(id),
    querySelectorAll: () => [],
    addEventListener: (soort, f) => { luisteraars[soort] = f; },
    body: { classList: { add: (k) => klassen.add(k), remove: (k) => klassen.delete(k) } },
  };
  knopen.get('paneelachtergrond').addEventListener = (soort, f) => { luisteraars.achtergrond = f; };
  return { knopen, luisteraars, klassen };
}

test('één paneel tegelijk; sluiten met Escape of de achtergrond', async () => {
  const { knopen, luisteraars, klassen } = nepDom(['voorkeuren', 'berichtenscherm', 'paneelachtergrond']);
  const { openPaneel, sluitPaneel, koppelPanelen, paneelOpen, bijSluitenVan } = await import('../public/js/paneel.js');
  koppelPanelen();

  openPaneel('voorkeuren');
  assert.deepEqual([knopen.get('voorkeuren').hidden, knopen.get('paneelachtergrond').hidden, klassen.has('paneel-open')], [false, false, true]);
  assert.equal(knopen.get('voorkeuren').scrollTop, 0, 'een paneel opent bovenaan');

  openPaneel('berichtenscherm');
  assert.equal(knopen.get('voorkeuren').hidden, true, 'het vorige paneel gaat dicht');
  assert.equal(paneelOpen(), 'berichtenscherm');

  let gesloten = 0;
  bijSluitenVan('berichtenscherm', () => { gesloten += 1; });
  luisteraars.keydown({ key: 'Escape' });
  assert.deepEqual([knopen.get('berichtenscherm').hidden, knopen.get('paneelachtergrond').hidden, klassen.has('paneel-open'), gesloten],
    [true, true, false, 1]);

  openPaneel('voorkeuren');
  luisteraars.achtergrond();
  assert.equal(paneelOpen(), null);
  sluitPaneel();
  assert.equal(gesloten, 1, 'twee keer sluiten doet niets meer');
});
