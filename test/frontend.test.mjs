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
  assert.match(bron, /import \{ api(, apiRuw)? \} from/);
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

test('beheer bestaat uit drie schermen, waaronder zaalbeheer, en die staan in het naammenu', () => {
  const nav = lees('../public/js/navigatie.js');
  assert.ok(nav.includes("id: 'dagelijksbeheer', naam: 'Dagelijks beheer', recht: 'systeem.beheren', inMenu: true"));
  assert.ok(nav.includes("id: 'zaalbeheer', naam: 'Zaalbeheer', recht: 'systeem.beheren', inMenu: true"));
  assert.ok(nav.includes("id: 'configuratie', naam: 'Configuratie', recht: 'systeem.beheren', inMenu: true"));
  assert.ok(html.includes('id="tab-dagelijksbeheer"'));
  assert.ok(html.includes('id="tab-zaalbeheer"'));
  assert.ok(html.includes('id="tab-configuratie"'));
});

test('zalen, periodes en de sjablonen staan samen onder zaalbeheer, niet meer verspreid', () => {
  const start = html.indexOf('id="tab-zaalbeheer"');
  const eind = html.indexOf('id="tab-dagelijksbeheer"');
  assert.ok(start !== -1 && eind !== -1 && start < eind, 'zaalbeheer moet vóór dagelijksbeheer in de HTML staan');
  const zaalbeheerBlok = html.slice(start, eind);
  for (const id of ['zalenlijf', 'sluitingzaal', 'zaalsjabloondownload', 'reeksensjabloondownload', 'periodeslijf', 'periodesoort']) {
    assert.ok(zaalbeheerBlok.includes(`id="${id}"`), `${id} hoort binnen tab-zaalbeheer te staan`);
  }
});

test('dagelijks beheer bevat enkel nog de VBL-diagnose, geen periodes meer', () => {
  const start = html.indexOf('id="tab-dagelijksbeheer"');
  const eind = html.indexOf('<script', start);
  const blok = html.slice(start, eind === -1 ? undefined : eind);
  assert.ok(blok.includes('id="diagnoseteam"'));
  assert.ok(!blok.includes('id="periodeslijf"'), 'periodes zijn verhuisd naar zaalbeheer');
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

test('de topbalk is standaard de donkere YOAssist-strook, een ingestelde clubkleur wint', () => {
  const css = lees('../public/stijl.css');
  assert.ok(css.includes('var(--topbalk-achtergrond, #12161c)'));
  assert.ok(css.includes('var(--topbalk-tekst, #ffffff)'));
});

test('het accent in de appnaam volgt de tekstkleur van een clubkleur, niet het vaste amber', () => {
  const css = lees('../public/stijl.css');
  assert.ok(css.includes('var(--merk-accent, #e8a317)'));
  const bron = lees('../public/js/huisstijl.js');
  assert.match(bron, /if \(gegevens\.kleur_topbalk\) {[\s\S]{0,250}setProperty\('--merk-accent', tekst\)/);
  assert.match(bron, /removeProperty\('--merk-accent'\)/);
});

test('de kopstrook staat buiten <main> en blijft bovenaan bij het scrollen', () => {
  assert.ok(html.indexOf('<header class="topbalk">') < html.indexOf('<main>'));
  const css = lees('../public/stijl.css');
  const blok = css.slice(css.indexOf('.topbalk {'), css.indexOf('.topbalk {') + 300);
  assert.match(blok, /position:\s*sticky/);
  assert.match(blok, /safe-area-inset-top/);
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

test('een periode kan nu handmatig aangemaakt worden, met soort examens beschikbaar', () => {
  assert.ok(html.includes('id="periodesoort"'));
  assert.ok(html.includes('<option value="examens">'));
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.includes('export async function maakPeriode'));
  assert.ok(bron.includes("api('/api/admin/periodes', 'POST'"));
});

test('een periode verwijderen vraagt bevestiging en is enkel zichtbaar bij handmatige periodes', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.match(/data-periode-verwijderen[\s\S]*?confirm\(/));
  assert.ok(bron.includes("p.bron === 'club'"), 'de knop hoort enkel bij handmatige periodes te staan');
});

test('een zaalblok kan verwijderd worden, met bevestiging', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.match(/data-blok-verwijderen[\s\S]*?confirm\(/));
});

test('een zaalsluiting kan gemeld worden vanuit het scherm', () => {
  assert.ok(html.includes('id="sluitingzaal"'));
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.includes('export async function maakSluiting'));
});

test('geen twee elementen in index.html delen dezelfde id', () => {
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const gezien = new Set();
  const dubbel = [];
  for (const id of ids) {
    if (gezien.has(id)) dubbel.push(id);
    gezien.add(id);
  }
  assert.deepEqual(dubbel, []);
});

test('beide nieuwe sjablonen tonen eerst een droogloop vóór uitvoeren', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.match(/uploadZaalsjabloon[\s\S]*?confirm\(/));
  assert.ok(bron.match(/uploadReeksensjabloon[\s\S]*?confirm\(/));
});

test('onbekende teams en zalen worden getoond, niet verzwegen', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.includes('onbekendeTeams'));
  assert.ok(bron.includes('onbekendeZalen'));
  assert.ok(bron.includes('verdwenenBlokken'));
  assert.ok(bron.includes('verdwenenReeksen'));
});

test('de sjabloondownloads gebruiken apiRuw, geen kale link', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  const downloadBlok = bron.slice(bron.indexOf('async function downloadCsv'), bron.indexOf('function leesBestand'));
  assert.ok(downloadBlok.includes('apiRuw'));
  assert.ok(downloadBlok.includes('createObjectURL'));
});

test('het versienummer staat ook in de topbalk, niet enkel in de footer', () => {
  assert.ok(html.includes('id="topbalkversie"'));
  const app = lees('../public/js/app.js');
  assert.ok(app.includes("el('topbalkversie')"));
  assert.ok(app.includes('config.versie'));
});

test('feestdag is een keuzeoptie bij het handmatig toevoegen van een periode', () => {
  assert.ok(html.includes('<option value="feestdag">feestdag</option>'));
});

test('feestdagen ophalen toont eerst een droogloop', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.match(/synchroniseerFeestdagen[\s\S]*?confirm\(/));
});

test('open_op_feestdagen per zaal is een schakelaar die meteen bewaart', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.includes('data-open-feestdagen'));
  assert.ok(bron.includes("api('/api/admin/zalen/feestdagen'"));
});

test('een fout bij het zetten van open_op_feestdagen draait de schakelaar terug', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.match(/data-open-feestdagen[\s\S]{0,400}invoer\.checked = !invoer\.checked/));
});

test('de dichtstbevolkte secties zijn samenvouwbaar met <details>, geen kale <h2>/<h3> meer in die twee tabbladen', () => {
  const configStart = html.indexOf('id="tab-configuratie"');
  const configEind = html.indexOf('id="tab-zaalbeheer"');
  const configBlok = html.slice(configStart, configEind);
  // De paneelkop (het scherm zelf) telt niet: het gaat om de secties erin.
  assert.ok(!configBlok.includes('<h2>'), 'Configuratie hoort geen kale h2 meer te hebben, enkel <summary>');
  assert.match(configBlok, /<summary>Instellingen<\/summary>/);

  const zaalStart = html.indexOf('id="tab-zaalbeheer"');
  const zaalEind = html.indexOf('id="tab-dagelijksbeheer"');
  const zaalBlok = html.slice(zaalStart, zaalEind);
  assert.ok(!zaalBlok.includes('<h2>') && !zaalBlok.includes('<h3>'), 'Zaalbeheer hoort geen kale koppen meer te hebben');
  assert.match(zaalBlok, /<summary>Zalen<\/summary>/);
  assert.match(zaalBlok, /<summary>Schoolvakanties en examens<\/summary>/);
});

test('de kleine, veelgebruikte secties staan standaard open, de rest dicht', () => {
  const html2 = html;
  // Instellingen en Zalen/Schoolvakanties zijn de kern van hun tabblad en
  // staan open; iets als het sjabloon of de testrol staat standaard dicht.
  assert.match(html2, /<details open>\s*<summary>Instellingen<\/summary>/);
  assert.match(html2, /<details open>\s*<summary>Zalen<\/summary>/);
  assert.match(html2, /<details>\s*<summary>Zaaluren-sjabloon<\/summary>/);
});

test('het persoonsscherm toont de ploegen van iemand, met een koppel- en ontkoppelmogelijkheid', () => {
  assert.ok(html.includes('id="persoonploegenlijf"'));
  assert.ok(html.includes('id="persoonteamkeuze"'));
  assert.ok(html.includes('id="persoonteamkoppelen"'));
  const bron = lees('../public/js/schermen/persoon.js');
  assert.ok(bron.includes('data-team-ontkoppelen'));
  assert.ok(bron.includes("api('/api/admin/persoon/team-koppelen'"));
  assert.ok(bron.includes("api('/api/admin/persoon/team-ontkoppelen'"));
});

test('ontkoppelen is enkel zichtbaar bij een handmatige koppeling, niet bij een VBL-koppeling', () => {
  const bron = lees('../public/js/schermen/persoon.js');
  assert.ok(bron.match(/pl\.bron === 'club'[\s\S]{0,150}data-team-ontkoppelen/), 'de ontkoppelknop hoort enkel bij bron club te tonen');
});

test('ontkoppelen vraagt bevestiging vóór het echt gebeurt', () => {
  const bron = lees('../public/js/schermen/persoon.js');
  assert.ok(bron.match(/data-team-ontkoppelen[\s\S]*?confirm\(/));
});

test('de teamkeuze bij een persoon gebruikt de verkorte naam wanneer die er is', () => {
  const bron = lees('../public/js/schermen/persoon.js');
  assert.ok(bron.includes('t.naam_kort ?? t.naam'));
});

test('een cijfercode intypen is een alternatief voor de aanmeldlink, tegen misbruik van iOS/PWA', () => {
  assert.ok(html.includes('id="codesectie"'));
  assert.ok(html.includes('id="codeform"'));
  assert.ok(html.includes('id="code"'));
  const bron = lees('../public/js/api.js');
  assert.ok(bron.includes('export async function verifieerCode'));
  assert.ok(bron.includes("type: 'email'"), "Supabase verwacht type 'email' voor een cijfercode, 'magiclink' is verouderd");
});

test('verifieerCode gaat rechtstreeks naar Supabase, niet via de eigen route', () => {
  const bron = lees('../public/js/api.js');
  const start = bron.indexOf('export async function verifieerCode');
  const eind = bron.indexOf('\nexport ', start + 10);
  const functie = bron.slice(start, eind === -1 ? undefined : eind);
  assert.match(functie, /\/auth\/v1\/verify/);
  assert.ok(!functie.includes("fetch('/api/"), 'geen omweg via de eigen backend voor het verifiëren');
});

test('de link- en de codeflow komen samen in dezelfde afrondingslogica', () => {
  const bron = lees('../public/js/app.js');
  assert.ok(bron.includes('async function voltooiAanmelding'));
  assert.ok(bron.includes('await voltooiAanmelding()'));
  // Beide plekken die tokens binnenkrijgen, roepen dezelfde functie aan —
  // geen tweede kopie van de /api/mij-afhandeling die uit de pas kan lopen.
  const aantalAanroepen = (bron.match(/voltooiAanmelding\(\)/g) || []).length;
  assert.ok(aantalAanroepen >= 2, 'zowel de URL-tokenflow als de codeflow roepen voltooiAanmelding aan');
});

test('het naammenu heeft Beheer bovenaan en het persoonlijke deel eronder, zoals bij YOAssist', () => {
  assert.ok(html.includes('id="naammenu"'));
  assert.ok(html.includes('id="naammenuknop"'));
  const beheer = html.indexOf('id="naammenu-beheer-kop"');
  const scheiding = html.indexOf('id="naammenu-scheiding"');
  const voorkeuren = html.indexOf('id="naammenu-voorkeuren"');
  assert.ok(beheer !== -1 && beheer < scheiding && scheiding < voorkeuren);
  assert.ok(html.includes('id="naammenu-afmelden"'));
});

test('de kop Beheer en de scheiding staan standaard verborgen', () => {
  for (const id of ['naammenu-beheer-kop', 'naammenu-scheiding', 'naammenu-testrol']) {
    const start = html.indexOf(`id="${id}"`);
    assert.match(html.slice(start, html.indexOf('>', start)), /hidden/, id);
  }
});

test('de knoppen onder Beheer komen uit de rechten, niet uit een vaste lijst in app.js', () => {
  assert.ok(app.includes('menuTabbladen(rechten)'));
  assert.ok(!app.includes("huidigeKies('zaalbeheer')"), 'geen vaste knop per scherm meer');
  assert.match(app, /naammenu-beheer-kop'\)\.hidden = !iets/);
});

test('Kijken als … staat enkel in het menu als de backend zegt dat het werkt', () => {
  assert.match(app, /bouwBeheermenu\(rechten, gegevens\.testrol_mogelijk === true\)/);
  assert.match(app, /naammenu-testrol'\)\.hidden = !testrolMogelijk/);
  // Niet meer bij Configuratie: daar blijft enkel de instelling zelf.
  const configBlok = html.slice(html.indexOf('id="tab-configuratie"'), html.indexOf('id="tab-zaalbeheer"'));
  assert.ok(!configBlok.includes('id="testrolrol"'));
  assert.ok(html.includes('id="testrolscherm"'));
});

test('de beheerschermen hebben een titel, want er licht geen tabblad op', () => {
  assert.match(html, /id="tab-configuratie" hidden>\s*<h2 class="paneelkop">Configuratie<\/h2>/);
  assert.match(html, /id="tab-zaalbeheer" hidden>\s*<h2 class="paneelkop">Zaalbeheer<\/h2>/);
  assert.match(html, /id="tab-dagelijksbeheer" hidden>\s*<h2 class="paneelkop">Dagelijks beheer<\/h2>/);
});

test('de oude losse afmeldknop op Overzicht bestaat niet meer, enkel die in het naammenu', () => {
  assert.ok(!html.includes('id="afmelden"'));
  assert.ok(html.includes('id="naammenu-afmelden"'));
});

test('klikken buiten het naammenu sluit het', () => {
  const app = lees('../public/js/app.js');
  assert.ok(app.includes("document.addEventListener('click'"));
  assert.match(app, /ik\.contains\(e\.target\)/);
});

test('Mijn voorkeuren toont dark mode en het communicatiekanaal', () => {
  assert.ok(html.includes('id="voorkeurmodus"'));
  assert.ok(html.includes('id="voorkeurkanaal"'));
  assert.ok(html.includes('id="voorkeurenbewaren"'));
  const bron = lees('../public/js/schermen/voorkeuren.js');
  assert.ok(bron.includes("api('/api/mij/voorkeuren'"));
});

test('de donkere modus wordt vóór het aanmelden al toegepast, uit localStorage', () => {
  const bron = lees('../public/js/schermen/voorkeuren.js');
  assert.ok(bron.includes('export function pasDonkereModusToe'));
  assert.match(bron, /localStorage\.getItem\(OPSLAG_MODUS\)/);
  const app = lees('../public/js/app.js');
  assert.match(app, /pasDonkereModusToe\(\);\s*\n\s*pasHuisstijlToe\(\)/);
});

test('bij het aanmelden wint de databank, niet de lokale opslag', () => {
  const app = lees('../public/js/app.js');
  assert.match(app, /pasDonkereModusToe\(gegevens\.persoon\.donkere_modus\)/);
});

test('de knoppen onder Beheer gebruiken de kies-functie van bouwNavigatie', () => {
  assert.ok(app.includes('huidigeKies = bouwNavigatie'));
  assert.match(app, /huidigeKies\(knop\.dataset\.scherm\)/);
});

test('dark mode gebruikt de accentkleur enkel als achtergrond, niet als tekst op de donkere pagina', () => {
  const css = lees('../public/stijl.css');
  assert.match(css, /\[data-modus="donker"\]\s*\.rollen li\s*{[^}]*background:\s*var\(--accent\)/);
  const huisstijl = lees('../public/js/huisstijl.js');
  assert.ok(huisstijl.includes('--accent-tekst-op-vlak'));
});

test('de topbalk centreert de twee kanten in plaats van bovenaan uit te lijnen', () => {
  const css = lees('../public/stijl.css');
  const blok = css.slice(css.indexOf('.topbalk-rij {'), css.indexOf('.topbalk-rij {') + 200);
  assert.match(blok, /align-items:\s*center/);
});

test('het persoonsscherm toont rollen, met een koppel- en ontkoppelmogelijkheid (T11)', () => {
  assert.ok(html.includes('id="persoonrollenlijf"'));
  assert.ok(html.includes('id="persoonrolkeuze"'));
  assert.ok(html.includes('id="persoonrolteam"'));
  assert.ok(html.includes('id="persoonrolkoppelen"'));
  const bron = lees('../public/js/schermen/persoon.js');
  assert.ok(bron.includes('data-rol-ontkoppelen'));
  assert.ok(bron.includes("api('/api/admin/persoon/rol-koppelen'"));
  assert.ok(bron.includes("api('/api/admin/persoon/rol-ontkoppelen'"));
});

test('een clubbrede rol verbergt het teamveld bij het koppelen van een rol', () => {
  const bron = lees('../public/js/schermen/persoon.js');
  assert.ok(bron.includes("const CLUBBREDE_ROLLEN = ['ADMIN', 'FINADM']"));
  assert.ok(bron.includes('toonRolteamveld'));
});

test('ontkoppelen van een rol is enkel zichtbaar bij een handmatige koppeling, en vraagt bevestiging', () => {
  const bron = lees('../public/js/schermen/persoon.js');
  assert.ok(bron.match(/r\.bron === 'club'[\s\S]{0,150}data-rol-ontkoppelen/));
  assert.ok(bron.match(/data-rol-ontkoppelen[\s\S]*?confirm\(/));
});

test('COACH is een keuzeoptie bij het handmatig koppelen van een rol', () => {
  assert.ok(html.includes('<option value="COACH">COACH</option>'));
});

test('een backup kan gedownload worden bij Configuratie (T14)', () => {
  assert.ok(html.includes('id="backupdownload"'));
  assert.ok(html.includes('id="backupmelding"'));
  const bron = lees('../public/js/schermen/instellingen.js');
  assert.ok(bron.includes('export async function downloadBackup'));
  assert.ok(bron.includes("apiRuw('/api/admin/backup'"));
});

test('de backup gebruikt apiRuw en createObjectURL, geen kale link naar de route', () => {
  const bron = lees('../public/js/schermen/instellingen.js');
  const start = bron.indexOf('export async function downloadBackup');
  const functie = bron.slice(start);
  assert.ok(functie.includes('createObjectURL'));
});

test('blokken bij Zaalbeheer staan gegroepeerd per weekdag, als losse blokjes (T17)', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.includes('function blokkenPerDag'));
  assert.ok(bron.includes('dagblokken'));
  assert.ok(bron.includes('class="blokjes"'));
  // Geen komma-gescheiden join meer voor de weergave van blokken.
  const functie = bron.slice(bron.indexOf('function blokkenPerDag'), bron.indexOf('export async function laadZalen'));
  assert.ok(!functie.includes("join(', ')"), 'niet langer één regel doorlopende, komma-gescheiden tekst');
});

test('elk blokje behoudt het bestaande verwijderkruisje', () => {
  const bron = lees('../public/js/schermen/trainingen.js');
  assert.ok(bron.includes('data-blok-verwijderen'));
});

test('de blokjes-CSS gebruikt neutrale kleuren, geen accentkleur — geen rolbadge', () => {
  const css = lees('../public/stijl.css');
  const blok = css.slice(css.indexOf('.blokjes li {'), css.indexOf('.blokjes li {') + 300);
  assert.ok(!blok.includes('var(--accent)'), 'roosterinformatie, geen rolbadge');
  assert.ok(blok.includes('var(--vlak)') || blok.includes('var(--lijn)'));
});

test('het aanwezigheidsscherm toont een taakblok bij een wedstrijd (T1)', () => {
  assert.ok(html.includes('id="taakblok"'));
  assert.ok(html.includes('id="taaklijf"'));
  assert.ok(html.includes('id="taakmelding"'));
  const bron = lees('../public/js/schermen/aanwezigheid-beheer.js');
  assert.ok(bron.includes('async function toonTaken'));
  assert.ok(bron.includes("api('/api/admin/wedstrijdtaken/toewijzen'"));
});

test('het taakblok blijft weg bij een training en bij een wedstrijd zonder taakslots', () => {
  const bron = lees('../public/js/schermen/aanwezigheid-beheer.js');
  const fn = bron.slice(bron.indexOf('async function toonTaken'));
  assert.match(fn, /soort !== 'wedstrijd'[\s\S]{0,120}hidden = true/);
  assert.match(fn, /!uit\.body\?\.taken\?\.length[\s\S]{0,80}hidden = true/);
});

test('de kandidatenlijst komt van de eigen smalle route, niet van personenZoeken', () => {
  const bron = lees('../public/js/schermen/aanwezigheid-beheer.js');
  assert.ok(bron.includes('/api/admin/wedstrijdtaken/kandidaten'));
  assert.ok(!bron.includes("api('/api/admin/personen')"), 'die route vraagt personen.beheren, wat een coach niet heeft');
});

// --- 0.28.0: Mijn berichten, het bolletje en de mededeling ------------------

const berichtenJs = lees('../public/js/schermen/berichten.js');
const mededelingJs = lees('../public/js/schermen/mededeling-beheer.js');

test('het bolletje staat op de naamknop en gaat rechtstreeks naar Mijn berichten, zonder het menu', () => {
  const ik = html.slice(html.indexOf('id="topbalkik"'), html.indexOf('id="naammenu"'));
  assert.ok(ik.includes('id="berichtenbadge"'));
  assert.match(app, /el\('berichtenbadge'\)\.addEventListener\('click', \(e\) => {\s*e\.stopPropagation\(\);[\s\S]{0,60}toonBerichten\(\)/);
});

test('Mijn berichten staat in het persoonlijke deel van het naammenu', () => {
  const scheiding = html.indexOf('id="naammenu-scheiding"');
  const berichten = html.indexOf('id="naammenu-berichten"');
  assert.ok(berichten > scheiding && berichten < html.indexOf('id="naammenu-voorkeuren"'));
});

test('de teller ververst enkel als het tabblad zichtbaar is, en meteen bij terugkeren', () => {
  assert.match(berichtenJs, /setInterval\(\(\) => {\s*if \(document\.visibilityState === 'visible'\) ververTeller\(\)/);
  assert.match(berichtenJs, /addEventListener\('visibilitychange'/);
});

test('een bericht wordt pas gelezen bij het aantikken, niet bij het openen van de lijst', () => {
  const toon = berichtenJs.slice(berichtenJs.indexOf('export async function toonBerichten'), berichtenJs.indexOf('async function openBericht'));
  assert.ok(!toon.includes('/api/berichten/gelezen'), 'de lijst openen markeert niets');
  const open = berichtenJs.slice(berichtenJs.indexOf('async function openBericht'));
  assert.match(open, /api\('\/api\/berichten\/gelezen', 'POST', { id:/);
});

test('links in een bericht worden klikbaar ná het ontsmetten, en enkel http(s)', async () => {
  const { veilig } = await import('../public/js/hulp.js');
  const bron = berichtenJs.slice(berichtenJs.indexOf('export function metLinks'), berichtenJs.indexOf('function datumTekst'));
  const metLinks = new Function('veilig', `${bron.replace('export ', '')}; return metLinks;`)(veilig);
  const uit = metLinks('Zie https://club.be/a?b=1&c=2 <script>x</script> javascript:alert(1)');
  assert.match(uit, /<a href="https:\/\/club\.be\/a\?b=1&amp;c=2"/);
  assert.ok(!uit.includes('<script>'), 'eigen HTML blijft tekst');
  assert.ok(!/href="javascript/.test(uit));
});

test('de banner zet tekst als tekst, en een link enkel als hij met http(s) begint', () => {
  assert.match(berichtenJs, /el\('mededelingtekst'\)\.textContent = m\.tekst/);
  assert.match(berichtenJs, /if \(m\.link && \/\^https\?:\\\/\\\/\/\.test\(m\.link\)\)/);
});

test('een mededeling plaatsen kan pas na de droogloop, en elke wijziging verbergt Plaatsen weer', () => {
  assert.match(html, /id="mededelingplaatsen" hidden/);
  const voor = mededelingJs.slice(mededelingJs.indexOf('export async function bereidMededelingVoor'), mededelingJs.indexOf('export async function plaatsMededeling'));
  assert.ok(!voor.includes('uitvoeren'), 'voorbereiden voert nooit uit');
  assert.match(voor, /el\('mededelingplaatsen'\)\.hidden = false/);
  assert.match(mededelingJs, /addEventListener\('input', \(\) => { el\('mededelingplaatsen'\)\.hidden = true; }\)/);
  assert.match(mededelingJs, /confirm\('Deze mededeling nu plaatsen\?/);
});

test('de mededeling-beheerroutes en de berichtenroutes lopen via api()', () => {
  for (const bron of [berichtenJs, mededelingJs]) {
    assert.ok(!/fetch\(/.test(bron));
  }
});
