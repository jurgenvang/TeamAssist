// De frontend, gelezen als tekst.
//
// Er draait hier geen browser, dus dit vangt geen gedragsfouten. Wat het wel
// vangt: gegevens die in de HTML horen te blijven, en het terugsluipen van
// patronen die in dit project bewust vermeden worden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');
const html = lees('../public/index.html');
const app = lees('../public/js/app.js');
const apiJs = lees('../public/js/api.js');
const ploegen = lees('../public/js/schermen/ploegen.js');
const testrol = lees('../public/js/schermen/testrol.js');

const modules = [
  ...readdirSync(new URL('../public/js', import.meta.url))
    .filter((n) => n.endsWith('.js'))
    .map((n) => lees(`../public/js/${n}`)),
  ...readdirSync(new URL('../public/js/schermen', import.meta.url))
    .filter((n) => n.endsWith('.js'))
    .map((n) => lees(`../public/js/schermen/${n}`)),
];

test('er staat geen sleutel of projectadres hard in de pagina', () => {
  for (const bron of [html, ...modules]) {
    assert.ok(!/supabase\.co/.test(bron), 'geen vast Supabase-adres');
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(bron), 'geen ingebakken JWT of sleutel');
  }
});

test('de frontend haalt geen code van een derde partij', () => {
  // Geen buildstap betekent hier niet: nog een partij erbij. Iemand vult op dit
  // scherm zijn e-mailadres in.
  assert.ok(!/<script[^>]+\ssrc\s*=\s*["']https?:/i.test(html), 'geen extern script');
  assert.ok(!/<link[^>]+href\s*=\s*["']https?:/i.test(html), 'geen externe stylesheet');
});

test('de tokens worden uit de URL gehaald na aanmelden', () => {
  assert.ok(apiJs.includes('history.replaceState'), 'het fragment hoort opgeruimd te worden');
});

test('toetsenbordfocus blijft zichtbaar', () => {
  assert.ok(lees('../public/stijl.css').includes(':focus-visible'));
});

test('de aanmeldlink wordt via de eigen route gevraagd', () => {
  assert.ok(apiJs.includes("'/api/aanmeldlink'"));
  for (const bron of modules) {
    assert.ok(!bron.includes('/auth/v1/otp'), 'de frontend praat niet meer rechtstreeks met Auth');
  }
});

test('elke uitkomst van /api/mij wordt uitgelegd', () => {
  for (const status of [401, 403, 409]) {
    assert.ok(app.includes(`uitkomst.status === ${status}`), `${status} hoort gemeld te worden`);
  }
  assert.ok(app.includes('geen uitleg'), 'ook een onbekende status hoort iets te tonen');
});

test('de sessie wordt enkel bij een 401 weggegooid', () => {
  const begin = app.indexOf("const uitkomst = await api('/api/mij')");
  const eind = app.indexOf('// --- knoppen');
  const inStart = app.slice(begin, eind);
  assert.equal((inStart.match(/bewaarSessie\(null\)/g) ?? []).length, 1);
  assert.ok(inStart.includes('uitkomst.status === 401'));
});

test('elke oproep naar de eigen API loopt via api()', () => {
  // Een kale fetch vernieuwt een verlopen token niet, en dan lijkt een knop het
  // niet te doen zonder dat er iets te zien is.
  for (const bron of modules) {
    if (bron === apiJs) continue;
    const kaal = bron.match(/fetch\(['"`]\/api\//g) ?? [];
    assert.equal(kaal.length, 0, 'geen kale fetch naar een eigen route buiten api.js');
  }
});

test('waarden uit de databank worden ontsmet voor ze in HTML komen', () => {
  // Namen komen van de bond en uit invoervelden. Rechtstreeks in een sjabloon
  // plakken laat een naam met een punthaak het scherm breken.
  assert.ok(ploegen.includes('veilig(p.naam)'));
  assert.ok(ploegen.includes('veilig(r.achternaam)'));
});

test('de testrol gaat in een kop mee, niet in de URL', () => {
  assert.ok(apiJs.includes("'x-teamassist-rol'"));
  assert.ok(apiJs.includes("'x-teamassist-team'"));
});

test('een ploegrol vraagt om een ploeg', () => {
  // Zonder ploeg weigert de rechtenlaag elk ploegrecht; dan lijkt de app leeg.
  assert.ok(testrol.includes('CLUBBREED'));
  assert.ok(testrol.includes('Kies er ook een ploeg bij'));
});

test('de stand van de testrol blijft zichtbaar', () => {
  assert.ok(testrol.includes('Je kijkt als'));
  assert.ok(html.includes('id="testbalk"'));
});

test('de navigatie volgt uit de rechten, niet uit een rollijst', () => {
  const nav = lees('../public/js/navigatie.js');
  assert.ok(nav.includes("recht: 'systeem.beheren'"));
  assert.ok(!nav.includes("=== 'ADMIN'"), 'geen rolvergelijking in de frontend');
});

test('de trainingenmodule gebruikt api() en geen kale fetch', () => {
  const bron = readdirSync(new URL('../public/js/schermen', import.meta.url)).includes('trainingen.js')
    ? lees('../public/js/schermen/trainingen.js')
    : '';
  assert.ok(bron.includes("import { api }"));
  assert.ok(!bron.includes('fetch('));
});

test('waarden in de trainingenmodule worden ontsmet', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.includes('veilig(z.naam)'));
  assert.ok(bron.includes('veilig(r.zaal_naam'));
});

test('reeksen aanmaken en genereren tonen eerst een droogloop', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.includes('confirm('), 'genereren vraagt bevestiging vóór het uitvoert');
});

test('wedstrijden synchroniseren toont eerst een droogloop', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.includes('synchroniseerWedstrijden'));
  assert.ok(bron.match(/synchroniseerWedstrijden[\s\S]*?confirm\(/), 'moet bevestigen vóór uitvoeren');
});

test('de synchronisatieknop voor wedstrijden werkt op de getoonde ploeg', () => {
  const app = lees('../public/js/app.js');
  assert.ok(app.includes('getHuidigWedstrijdenTeam()'), 'anders synchroniseert de knop alle ploegen in plaats van de getoonde');
});

test('de topbalk toont clubnaam en logo, geen hardcoded clubnaam meer in JS', () => {
  assert.ok(html.includes('id="clublogo"'));
  assert.ok(html.includes('id="clubnaam"'));
  assert.ok(html.includes('id="topbalkrollen"'), 'rol(len) hoort onder de naam te staan, zoals bij YOAssist');
});

test('het beheermenu is gesplitst zoals bij YOAssist', () => {
  const nav = lees('../public/js/navigatie.js');
  assert.ok(nav.includes("id: 'dagelijksbeheer'"));
  assert.ok(nav.includes("id: 'configuratie'"));
  assert.ok(html.includes('id="tab-dagelijksbeheer"'));
  assert.ok(html.includes('id="tab-configuratie"'));
});

test('de huisstijl-fetch loopt via api.js, net als de aanmeldlink', () => {
  const huisstijl = lees('../public/js/huisstijl.js');
  assert.ok(!huisstijl.includes('fetch('), 'geen kale fetch in huisstijl.js zelf');
  assert.ok(huisstijl.includes('haalBranding'));
});

test('een afgekeurde kleur laat het scherm herladen in plaats van de foute waarde te tonen', () => {
  const bron = lees('../public/js/schermen/instellingen.js');
  assert.ok(bron.includes("invoer.type === 'color'"));
  assert.ok(bron.match(/invoer\.type === 'color'[\s\S]{0,260}laadInstellingen\(\)/));
});

test('een kleur wissen bewaart een lege waarde, geen geraden vervangkleur', () => {
  const bron = lees('../public/js/schermen/instellingen.js');
  assert.ok(bron.includes("waarde: ''"));
});

test('het brandingvoorstel toont het logo als afbeelding, niet enkel de URL als tekst', () => {
  const bron = lees('../public/js/schermen/instellingen.js');
  assert.ok(bron.includes("createElement('img')"), 'het logo hoort zichtbaar te zijn, geen kale link');
  assert.ok(bron.includes('logoImg.src = b.logo_url'));
});

test('een logo dat niet laadt, valt terug op tekst in plaats van kapot te blijven staan', () => {
  const bron = lees('../public/js/schermen/instellingen.js');
  assert.ok(bron.includes("addEventListener('error'"), 'geen zichtbaar gebroken-afbeelding-icoon');
  assert.ok(bron.match(/logoImg\.addEventListener\('error'[\s\S]{0,150}logoImg\.remove\(\)/));
});

test('de topbalk gebruikt CSS-variabelen voor kleur en tekst, met een nette terugval', () => {
  const css = lees('../public/stijl.css');
  assert.ok(css.includes('var(--topbalk-achtergrond, transparent)'));
  assert.ok(css.includes('var(--topbalk-tekst, var(--inkt))'));
});

test('huisstijl.js past de topbalkkleur toe zonder ze zelf te herberekenen', () => {
  const bron = lees('../public/js/huisstijl.js');
  assert.ok(bron.includes('kleur_topbalk'));
  assert.ok(bron.includes('kleur_topbalk_tekst'));
  assert.ok(!bron.includes('kiesLeesbareTekstkleur'), 'de tekstkleur komt van de backend, niet van een eigen berekening in de frontend');
});

test('het voorstelscherm biedt zowel accent- als topbalkkleur aan wanneer beide bruikbaar zijn', () => {
  const bron = lees('../public/js/schermen/instellingen.js');
  assert.ok(bron.includes('shirt_kleur_bruikbaar_topbalk'));
  assert.ok(bron.includes("'clubkleur_topbalk'"));
});

test('het sjabloon downloaden gebruikt apiRuw, geen kale link naar een beveiligde route', () => {
  const bron = lees('../public/js/schermen/ploegen.js');
  assert.ok(bron.includes('apiRuw('), 'de route vraagt een token, dus een gewone <a href> volstaat niet');
  assert.ok(bron.includes('createObjectURL'), 'het bestand wordt lokaal aangeboden na het ophalen');
});

test('het sjabloon uploaden toont eerst een droogloop', () => {
  const bron = lees('../public/js/schermen/ploegen.js');
  assert.ok(bron.match(/uploadSjabloon[\s\S]*?confirm\(/), 'uitvoeren vraagt bevestiging');
  assert.ok(bron.includes('&uitvoeren=1'));
});

test('een JSON-lichaam op de sjabloonroute wordt nooit met JSON.stringify verstuurd', () => {
  // apiRuw stuurt platte tekst; JSON.stringify() op een CSV-string zou de
  // aanhalingstekens verdubbelen en het bestand onbruikbaar maken.
  const bron = lees('../public/js/api.js');
  const start = bron.indexOf('export async function apiRuw');
  const eind = bron.indexOf('export async function', start + 1);
  const apiRuwBlok = bron.slice(start, eind);
  assert.ok(!apiRuwBlok.includes('JSON.stringify'));
});

test('rijfouten en overgeslagen ouderkoppelingen worden getoond, niet verzwegen', () => {
  const bron = lees('../public/js/schermen/ploegen.js');
  assert.ok(bron.includes('rijfouten'));
  assert.ok(bron.includes('overgeslagenOuders'));
});

test('uitsluiten vraagt altijd een reden vóór de oproep', () => {
  const bron = lees('../public/js/schermen/aanwezigheid-beheer.js');
  assert.ok(bron.match(/if \(!alUitgesloten\)[\s\S]{0,120}prompt\(/), 'een reden hoort verplicht te zijn, ook in de frontend');
});

test('publiceren van een selectie vraagt bevestiging', () => {
  const bron = lees('../public/js/schermen/aanwezigheid-beheer.js');
  assert.ok(bron.match(/publiceerSelectie[\s\S]*?confirm\(/));
});

test('de opgave- en beheerschermen ontsmetten namen voor ze in HTML komen', () => {
  const opgave = lees('../public/js/schermen/mijn-opgaven.js');
  const beheer = lees('../public/js/schermen/aanwezigheid-beheer.js');
  assert.ok(opgave.includes('veilig('));
  assert.ok(beheer.includes('veilig(s.voornaam)'));
});

test('elke oproep in de nieuwe aanwezigheidsmodules loopt via api()', () => {
  for (const bestand of ['mijn-opgaven.js', 'aanwezigheid-beheer.js']) {
    const bron = lees(`../public/js/schermen/${bestand}`);
    assert.ok(!bron.match(/fetch\(['"`]\/api\//), `geen kale fetch in ${bestand}`);
  }
});
