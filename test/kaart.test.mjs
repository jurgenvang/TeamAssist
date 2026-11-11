// De gedeelde kaart (T21): elke lijst met wedstrijden of trainingen toont ze
// zoals YOAssist. Zonder browser: kaart.js geeft HTML terug, en de schermen
// worden als tekst gelezen om na te gaan dat ze ze ook gebruiken.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kaart, sectieKop, gegroepeerd, dagTitel, kaartlink, wedstrijdblad } from '../public/js/kaart.js';
import { toestandVan } from '../public/js/schermen/agenda.js';

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');

test('de kaart: datumblok, ploegen, thuis of uit, zaal met kaartlink, wedstrijdblad, uitslag, forfait', () => {
  const h = kaart({
    datum: '2026-11-14', uur: '10:00', ploeg: 'U12 A', tegenstander: 'Tienen', thuis: false, cat: 'U12',
    locatie: 'Sporthal Ter Bank', blad: wedstrijdblad('BVBL 1'), uitslag: '45-40', forfait: 'uit', toestand: 'ja',
  });
  assert.match(h, /<span class="dag">za<\/span><span class="nr">14<\/span><span class="uur">10:00<\/span>/);
  assert.match(h, /<span class="ploeg">U12 A<\/span> <span class="tegen">– Tienen<\/span>/);
  assert.match(h, /<span class="thuisuit">uit<\/span>/);
  assert.ok(h.includes(`href="${kaartlink('Sporthal Ter Bank')}"`));
  assert.ok(h.includes('wedguid=BVBL%201'));
  assert.match(h, /<span class="uitslag">45-40<\/span>/);
  assert.match(h, /forfait bezoekers/);
  assert.match(h, /data-toestand="ja"/);
});

test('de kaart ontsmet alles wat uit de databank komt', () => {
  const kwaad = '<img src=x onerror=alert(1)>';
  const h = kaart({ datum: '2026-11-14', uur: kwaad, ploeg: kwaad, tegenstander: kwaad, cat: kwaad, locatie: kwaad,
    uitslag: kwaad, voor: kwaad, data: { sleutel: '"><script>' } });
  assert.ok(!h.includes('<img'), 'geen ruwe HTML');
  assert.ok(!h.includes('"><script>'));
  assert.ok(h.includes('&lt;img'));
});

test('het label van het type enkel waar gevraagd, en voor wie in een gezin', () => {
  const zonder = kaart({ datum: '2026-11-14', soort: 'fluiten', ploeg: 'U10 B' });
  assert.ok(!zonder.includes('soort-label'), 'in een lijst van één soort geen label');
  assert.match(zonder, /data-soort="fluiten"/);
  const met = kaart({ datum: '2026-11-14', soort: 'taak', label: true, voor: 'Max', ploeg: 'U10 B' });
  assert.match(met, /<span class="soort-label" data-soort="taak">Taak<\/span>/);
  assert.match(met, /<span class="voor-label">voor Max<\/span>/);
  assert.ok(!kaart({ datum: '2026-11-14', ploeg: 'x', thuis: null }).includes('thuisuit'), 'thuis/uit enkel als het gekend is');
});

test('gegroepeerd per dag of per maand, met een sectiekop zoals in YOAssist', () => {
  const items = [{ datum: '2026-11-14' }, { datum: '2026-11-14' }, { datum: '2026-11-15' }, { datum: '2026-12-01' }];
  const perDag = gegroepeerd(items, () => '<i></i>');
  assert.equal((perDag.match(/class="dag-kop"/g) ?? []).length, 3);
  assert.ok(perDag.includes('za 14 november'));
  assert.equal((gegroepeerd(items, () => '', { per: 'maand' }).match(/dag-kop/g) ?? []).length, 2);
  assert.equal(dagTitel('2026-12-01'), 'di 1 december');
  assert.match(sectieKop('Je bent aangeduid', 2, 'uitleg'), /<h3>Je bent aangeduid<\/h3><span class="aantal">2<\/span>[\s\S]*sectie-uitleg/);
});

test('de toestand in Mijn agenda: geel open, groen aanwezig of vast, rood afwezig, grijs wat niet doorgaat', () => {
  assert.equal(toestandVan({ soort: 'training', status: 'gepland', opgave_status: null }), 'open');
  assert.equal(toestandVan({ soort: 'wedstrijd', status: 'gepland', opgave_status: 'aanwezig' }), 'ja');
  assert.equal(toestandVan({ soort: 'wedstrijd', status: 'gepland', opgave_status: 'afwezig' }), 'nee');
  assert.equal(toestandVan({ soort: 'wedstrijd', status: 'gepland', uitgesloten: true }), 'nee');
  assert.equal(toestandVan({ soort: 'training', status: 'afgelast', opgave_status: 'aanwezig' }), 'weg');
  assert.equal(toestandVan({ soort: 'fluiten' }), 'ja');
  assert.equal(toestandVan({ soort: 'taak' }), 'ja');
});

test('elke lijst met wedstrijden of trainingen gebruikt de gedeelde kaart, geen tabel meer', () => {
  // De regel van T21: overal zoals YOAssist. Een nieuw scherm dat wedstrijden
  // toont, hoort in deze lijst.
  for (const bestand of ['aanduidingen.js', 'regio.js', 'agenda.js', 'aanwezigheid-beheer.js', 'trainingen.js', 'cluboverzicht.js']) {
    const bron = lees(`../public/js/schermen/${bestand}`);
    assert.match(bron, /from '\.\.\/kaart\.js'/, bestand);
  }
  const html = lees('../public/index.html');
  for (const oud of ['opgavelijf', 'wedstrijdenlijf', 'aanwezigheidtrainingenlijf']) {
    assert.ok(!html.includes(`id="${oud}"`), `${oud} is een tabel van vóór T21`);
  }
  for (const nieuw of ['agendalijst', 'wedstrijdenlijst', 'aanwezigheidtrainingenlijst', 'aanwezigheidactiviteit']) {
    assert.ok(html.includes(`id="${nieuw}"`), nieuw);
  }
});

test('Mijn agenda: opgeven met de persoon van de kaart, een probleem melden namens een kind enkel bij fluiten', () => {
  const bron = lees('../public/js/schermen/agenda.js');
  assert.match(bron, /'\/api\/aanwezigheid\/opgave', 'POST', \{\s*soort: it\.soort, activiteit_id: it\.id, persoon_id: it\.voor\.id/);
  assert.match(bron, /namens: it\.voor\.ik \? null : it\.voor\.id/);
  // Een taak meldt enkel wie ze zelf heeft (wedstrijdtaken.js weigert het anders).
  assert.match(bron, /return it\.voor\.ik\s*\?/);
});
