// Nazicht in de browser: elk tabblad en elk paneel, voor één persoon, tegen de
// echte handlers op een testdatabank met verzonnen gegevens (0.46.1).
//
// Het script meldt JavaScript-fouten, elk antwoord met status 400 of hoger en
// elk element dat rechts buiten het scherm valt, en bewaart van elk scherm een
// schermafdruk. Kijk die na: het script ziet geen lelijk scherm, enkel een
// kapot.
//
//   node tools/nazicht.mjs <persoon> <breedte> <licht|donker> [poort] [map]
//
// Personen: jurgen (ADMIN, YO+, coach, ouder van max), ann (YO+), max (speler, YO),
// petra (ouder), carl (enkel coach), yara (YOADM), finn (FINADM), nul (geen
// rol). Draai het minstens als carl en petra op 390: wat een beheerder ziet,
// zegt niets over wat een coach of ouder ziet.
//
// Vraagt Playwright met Chromium; geen deel van `npm test`. Staat Playwright
// niet naast het project, zet dan PLAYWRIGHT_MAP op de map met node_modules.
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const { chromium } = createRequire(process.env.PLAYWRIGHT_MAP ?? '/opt/node-tools/node_modules/')('playwright');
const TA = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const { maakDb } = await import(`${TA}/test/d1.mjs`);
const { rechtenVoor } = await import(`${TA}/src/lib/rechten-db.js`);
const { ROUTES } = await import(`${TA}/src/index.js`);
const { VERSIE } = await import(`${TA}/src/versie.js`);
const SZ = { code: '2026-27', naam: '2026-2027' };
const dag = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const C = 'BVBL1125';
const [wie = 'jurgen', breedteRuw = '390', modus = 'licht', poort = '8810', map = join(tmpdir(), 'teamassist-nazicht')] = process.argv.slice(2);
const breedte = Number(breedteRuw);
const UIT = join(map, `${wie}-${breedte}-${modus}`);
mkdirSync(UIT, { recursive: true });

const db = maakDb();
db._sqlite.exec(`
  INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
  UPDATE instellingen SET waarde = 'uit' WHERE sleutel = 'bericht_modus';
  INSERT INTO teams (guid, seizoen, naam, naam_kort, categorie, gevolgd, officials) VALUES
    ('${C}G12  1', '2026-27', 'AB InBev Leuven Bears G12 A', 'U12 A', 'G12', 1, 1),
    ('${C}G14  1', '2026-27', 'AB InBev Leuven Bears G14 A', 'U14 A', 'G14', 1, 1),
    ('${C}HSE  1', '2026-27', 'AB InBev Leuven Bears HSE A', 'HSE A', 'HSE', 1, 1),
    ('${C}G10  2', '2026-27', 'AB InBev Leuven Bears G10 B', 'U10 B', 'G10', 0, 1),
    ('${C}M12  1', '2026-27', 'AB InBev Leuven Bears M12 A', 'M12 A', 'M12', 0, 1);
  INSERT INTO personen (id, voornaam, achternaam, email, tel_gsm, geboortedatum) VALUES
    ('jurgen', 'Bram', 'Beheerder', 'j@x.be', '0470123456', '1975-01-01'),
    ('ann', 'Anna', 'Voorbeeld', 'ann@x.be', '0471222333', '2005-01-01'),
    ('max', 'Milan', 'Voorbeeld', 'max@x.be', NULL, '2013-05-05'),
    ('petra', 'Petra', 'Van den Broeck-Vandersmissen', 'petra@x.be', NULL, '1980-01-01'),
    ('lena', 'Lena', 'Van den Broeck', NULL, NULL, '2012-03-03'),
    ('carl', 'Carl', 'Coach', 'carl@x.be', '0499000000', '1985-01-01'),
    ('yara', 'Yara', 'Adm', 'yara@x.be', NULL, '1990-01-01'),
    ('finn', 'Finn', 'Geld', 'finn@x.be', NULL, '1970-01-01'),
    ('nul', 'Niels', 'Niemand', 'nul@x.be', NULL, '1999-01-01');
  INSERT INTO rollen (persoon_id, rol, team_guid, seizoen) VALUES
    ('jurgen', 'ADMIN', NULL, NULL), ('jurgen', 'YOPLUS', NULL, NULL), ('jurgen', 'COACH', '${C}G14  1', '2026-27'),
    ('ann', 'YOPLUS', NULL, NULL), ('max', 'YO', NULL, NULL), ('carl', 'COACH', '${C}G12  1', '2026-27'),
    ('yara', 'YOADM', NULL, NULL), ('finn', 'FINADM', NULL, NULL);
  INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('jurgen', 'max'), ('petra', 'lena');
  INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES ('max', '${C}G12  1', '2026-27'), ('lena', '${C}G14  1', '2026-27');
  INSERT INTO zalen (id, naam, adres, vbl_acc_guid) VALUES ('tb', 'Sporthal Ter Bank', 'Tervuursevest, Leuven', 'A1'), ('kl', 'Sportoase Kessel-Lo', NULL, 'A2');
  INSERT INTO zaal_blokken (zaal_id, seizoen, weekdag, begin, einde) VALUES ('tb', '2026-27', 2, '18:00', '20:00'), ('tb', '2026-27', 2, '20:00', '22:00'), ('tb', '2026-27', 4, '17:00', '18:30'), ('kl', '2026-27', 3, '18:00', '19:30');
  INSERT INTO trainingsreeksen (team_guid, seizoen, weekdag, begin, einde, zaal_id, van, tot) VALUES ('${C}G12  1', '2026-27', 2, '18:30', '19:45', 'tb', '2026-09-01', '2027-06-30');
  INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander, locatie_tekst, vbl_acc_guid, uitslag) VALUES
    ('M0', '${C}G12  1', '2026-27', '${dag(-6)}', '10:00', 1, 'Tienen G12', 'Sporthal Ter Bank', 'A1', ' 45- 40'),
    ('M0b', '${C}G14  1', '2026-27', '${dag(-6)}', '14:00', 0, 'Koninklijke Basketbalclub Sint-Katelijne-Waver G14 B', 'Sporthal De Zeven Zillen Sint-Katelijne-Waver', 'A7', ' 38- 61'),
    ('M1', '${C}G12  1', '2026-27', '${dag(1)}', '10:00', 1, 'Aarschot G12', 'Sporthal Ter Bank', 'A1', NULL),
    ('M2', '${C}G14  1', '2026-27', '${dag(1)}', '14:00', 1, 'Gent G14', 'Sporthal Ter Bank', 'A1', NULL),
    ('M3', '${C}G10  2', '2026-27', '${dag(2)}', '11:00', 1, 'Diest G10', 'Sportoase Kessel-Lo', 'A2', NULL),
    ('M4', '${C}M12  1', '2026-27', '${dag(8)}', '09:30', 1, 'Aarschot M12', 'Sporthal Ter Bank', 'A1', NULL),
    ('M5', '${C}G14  1', '2026-27', '${dag(9)}', '16:00', 1, 'Lier G14', 'Sporthal Ter Bank', 'A1', NULL),
    ('M6', '${C}HSE  1', '2026-27', '${dag(1)}', '20:30', 1, 'Kangoeroes Mechelen', 'Sporthal Ter Bank', 'A1', NULL),
    ('U1', '${C}G12  1', '2026-27', '${dag(8)}', '13:30', 0, 'Kortrijk G12', 'Sporthal Lange Munte', 'A9', NULL),
    ('M7', '${C}G14  1', '2026-27', '${dag(45)}', '16:00', 1, 'Later G14', 'Sporthal Ter Bank', 'A1', NULL),
    ('M8', '${C}G14  1', '2026-27', '${dag(80)}', '16:00', 1, 'Veel later G14', 'Sporthal Ter Bank', 'A1', NULL);
  INSERT INTO officials_wedstrijd (wedstrijd_id, cat_code, off_aantal, off_namen, scope, scope_reden, forfait)
    SELECT id, substr(team_guid, 9, 3),
      CASE wedstrijd_guid WHEN 'M5' THEN 1 WHEN 'M6' THEN 2 ELSE 0 END,
      CASE wedstrijd_guid WHEN 'M5' THEN '["Piet Peeters"]' WHEN 'M6' THEN '["Piet Peeters","Jan Janssens"]' ELSE '[]' END,
      CASE wedstrijd_guid WHEN 'M6' THEN 0 ELSE 1 END,
      CASE WHEN substr(team_guid, 9, 3) IN ('G14','HSE') THEN 'woensdag' ELSE 'auto' END,
      CASE wedstrijd_guid WHEN 'M4' THEN 'uit' END
    FROM wedstrijden WHERE thuis = 1;
  INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, toegewezen_door) SELECT id, 'jurgen', 'jurgen' FROM wedstrijden WHERE wedstrijd_guid IN ('M1', 'M0');
  INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, toegewezen_door) SELECT id, 'ann', 'jurgen' FROM wedstrijden WHERE wedstrijd_guid IN ('M1', 'M0');
  INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, toegewezen_door) SELECT id, 'max', 'jurgen' FROM wedstrijden WHERE wedstrijd_guid = 'M3';
  INSERT INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status) SELECT 'jurgen', id, 'ja' FROM wedstrijden WHERE wedstrijd_guid = 'M3';
  INSERT INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status) SELECT 'jurgen', id, 'nee' FROM wedstrijden WHERE wedstrijd_guid = 'M5';
  INSERT INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status) SELECT 'ann', id, 'ja' FROM wedstrijden WHERE wedstrijd_guid = 'M2';
  INSERT INTO officials_problemen (wedstrijd_id, persoon_id, bericht) SELECT id, 'ann', 'Ik ben die dag toch op weekend met de scouts, sorry voor het late bericht.' FROM wedstrijden WHERE wedstrijd_guid = 'M1';
  INSERT INTO wedstrijdtaken (wedstrijd_id, taak) SELECT id, 'klok' FROM wedstrijden WHERE wedstrijd_guid IN ('M1', 'M2');
  INSERT INTO wedstrijdtaken (wedstrijd_id, taak) SELECT id, '24seconden' FROM wedstrijden WHERE wedstrijd_guid = 'M2';
  UPDATE wedstrijdtaken SET persoon_id = 'jurgen' WHERE taak = 'klok' AND wedstrijd_id = (SELECT id FROM wedstrijden WHERE wedstrijd_guid = 'M2');
  UPDATE wedstrijdtaken SET persoon_id = 'petra' WHERE taak = '24seconden';
  INSERT INTO trainingen (team_guid, seizoen, datum, begin, einde, zaal_id, status) VALUES
    ('${C}G12  1', '2026-27', '${dag(0)}', '18:30', '19:45', 'tb', 'gepland'), ('${C}G12  1', '2026-27', '${dag(4)}', '18:30', '19:45', 'tb', 'gepland'),
    ('${C}G12  1', '2026-27', '${dag(11)}', '18:30', '19:45', 'tb', 'zaal_niet_beschikbaar'),
    ('${C}G14  1', '2026-27', '${dag(1)}', '11:30', '13:00', 'kl', 'gepland'), ('${C}G14  1', '2026-27', '${dag(5)}', '19:00', '20:30', 'tb', 'gepland');
  INSERT INTO aanwezigheden (soort, activiteit_id, team_guid, seizoen, persoon_id, hoedanigheid, opgave_status, opgave_reden)
    SELECT 'training', id, team_guid, seizoen, 'lena', 'SPELER', 'afwezig', 'ziek' FROM trainingen WHERE team_guid LIKE '%G14%' AND datum = '${dag(5)}';
  INSERT INTO officials_volg_clubs (guid, naam, toegevoegd_door) VALUES ('BVBL1053', 'Lions Leuven', 'jurgen');
  INSERT INTO officials_volg_wedstrijden (guid, club_guid, club_naam, thuis_naam, uit_naam, datum, uur, cat_code, vbl_aantal, vbl_naam, bond_officials) VALUES
    ('R1', 'BVBL1053', 'Lions Leuven', 'Lions J16 A', 'Gent J16', '${dag(1)}', '10:00', 'J16', 0, NULL, 0),
    ('R2', 'BVBL1053', 'Lions Leuven', 'Lions HSE A', 'Aarschot HSE', '${dag(1)}', '20:30', 'HSE', 1, 'Piet Peeters', 1),
    ('R3', 'BVBL1053', 'Lions Leuven', 'Lions M14 A', 'Diest M14', '${dag(8)}', '14:00', 'M14', 0, NULL, NULL);
  INSERT INTO officials_vbl_lijsten (ontvangen, onderwerp, weekend_van, weekend_tot, aantal_rijen, eigen, meldingen, status, verwerkt_op) VALUES
    ('2026-11-18 13:36:00', 'Wedstrijden zonder scheidsrechter', '2026-11-21', '2026-11-22', 12, '[1,2]', '{"nietGekoppeld":[1]}', 'verwerkt', '2026-11-18 14:00:00');
  INSERT INTO berichten (persoon_id, kanaal, onderwerp, inhoud, soort, kort, gelezen_op) VALUES
    ('jurgen', 'mail', 'Je bent aangeduid', 'Je fluit zaterdag om 10:00 U12 A – Aarschot G12 in Sporthal Ter Bank. Wees er om 09:40.\n\nhttps://teamassist.clubassist.org', 'wedstrijd', 'Je fluit zaterdag om 10:00 U12 A – Aarschot G12', NULL),
    ('jurgen', 'mail', 'Mijn club — 1 wijziging', 'Bij de ploegen die je volgt in Mijn club:\n\n• U12 A thuis tegen Tienen G12 (za 14/11): 45-40', 'wedstrijd', 'U12 A thuis tegen Tienen G12 (za 14/11): 45-40', '2026-11-15 10:00:00'),
    ('max', 'mail', 'Je bent aangeduid', 'Je fluit zondag om 11:00.', 'wedstrijd', 'Je fluit zondag om 11:00 U10 B – Diest G10', NULL);
  INSERT INTO mededelingen (tekst, link, link_tekst, doelgroep, geldig_tot, gezet_door) VALUES
    ('Zaterdag 28 november is er een clubfeest in de kantine na de laatste wedstrijd. Iedereen welkom, ook ouders en supporters!', 'https://example.org/feest', 'Meer info', 'iedereen', '2099-01-01T00:00:00Z', 'jurgen');
  UPDATE personen SET verborgen_tabs = '[]', donkere_modus = '${modus}' WHERE 1;
`);

const fouten = [];
const slecht = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${poort}`);
  if (url.pathname.startsWith('/api/')) {
    let body = ''; for await (const c of req) body += c;
    const persoon = db._sqlite.prepare('SELECT * FROM personen WHERE id = ?').get(wie);
    const rechten = await rechtenVoor(db, wie, SZ.code);
    const vast = { '/api/config': { versie: VERSIE, supabase_url: 'https://v', supabase_publishable_key: 'x' }, '/api/sessie/vernieuw': { access_token: 't' } };
    const route = ROUTES.find((r) => r.methode === req.method && (r.prefix ? url.pathname.startsWith(r.pad) : r.pad === url.pathname));
    let a;
    try {
      if (vast[url.pathname]) a = new Response(JSON.stringify(vast[url.pathname]));
      else if (!route) a = new Response('{"fout":"geen route"}', { status: 404 });
      else if (route.recht && !rechten.mag(route.recht, route.team ? route.team(new Request(url)) : null)) a = new Response(JSON.stringify({ fout: 'geen recht' }), { status: 403 });
      else a = await route.doe({ db, env: {}, seizoen: SZ, persoon, rechten, request: new Request(url, { method: req.method, body: req.method === 'POST' ? body : undefined }) });
    } catch (e) {
      a = new Response(JSON.stringify({ fout: String(e.message) }), { status: 500 });
    }
    if (a.status >= 400) slecht.push(`${a.status} ${req.method} ${url.pathname}${url.search}`);
    res.writeHead(a.status, { 'content-type': 'application/json' }); res.end(await a.text()); return;
  }
  const f = join(TA, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' }[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(Number(poort), r));
globalThis.fetch = async () => { throw new TypeError('geen netwerk in het nazicht'); };

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: breedte, height: 800 } });
p.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
p.on('dialog', (d) => d.dismiss());

// Wat breder is dan het scherm of buiten beeld valt: een horizontale schuifbalk
// op de pagina, of een element dat rechts uitsteekt (de tabbalk mag schuiven).
const meet = async (naam) => {
  const r = await p.evaluate(() => {
    const breed = document.documentElement.clientWidth;
    const uit = [];
    const zichtbaar = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length; };
    for (const e of document.querySelectorAll('body *')) {
      if (!zichtbaar(e) || e.closest('nav#navigatie') || e.closest('[hidden]')) continue;
      const k = e.getBoundingClientRect();
      if (k.width && (k.right > breed + 1 || k.left < -1)) {
        uit.push(`${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${e.className && typeof e.className === 'string' ? `.${e.className.split(' ').join('.')}` : ''} [${Math.round(k.left)}..${Math.round(k.right)}]`);
      }
    }
    return { scroll: document.documentElement.scrollWidth > breed + 1, uit: uit.slice(0, 6), n: uit.length };
  });
  if (r.scroll || r.n) console.log(`  ⚠ ${naam}: ${r.scroll ? 'pagina schuift horizontaal; ' : ''}${r.n} element(en) buiten beeld: ${r.uit.join(' | ')}`);
};
const foto = async (naam) => { await p.waitForTimeout(450); await meet(naam); await p.screenshot({ path: `${UIT}/${naam}.png`, fullPage: true }); };

await p.goto(`http://localhost:${poort}/`);
await p.waitForSelector('#navigatie button, #tab-mij:not([hidden])', { timeout: 5000 }).catch(() => {});
await p.waitForTimeout(600);
const tabs = await p.$$eval('#navigatie button', (x) => x.map((y) => y.dataset.tab));
console.log(`${wie} ${breedte} ${modus} — tabs: ${tabs.join(', ') || '(geen tabbalk)'}`);
await foto('00-start');
for (const t of tabs) {
  await p.$eval(`#navigatie button[data-tab="${t}"]`, (k) => k.click());
  await foto(`tab-${t}`);
  if (t === 'ploegen') {
    for (const k of await p.$$('#ploegenlijf button[data-toon]')) {
      if ((await k.getAttribute('data-toon')).includes('G14')) { await k.click(); break; }
    }
    await p.waitForTimeout(700);
    await foto('tab-ploegen-ploeg');
    const a = await p.$('#wedstrijdenlijst [data-aanwezigheid]');
    if (a) { await a.click(); await p.waitForTimeout(600); await foto('tab-ploegen-aanwezigheid'); }
  }
  if (t === 'mijnclub') { await p.click('#mijnclubkies'); await foto('tab-mijnclub-kiezer'); await p.click('#mijnclubkies'); }
  if (t === 'cluboverzicht') {
    const v = await p.$('#cluboverzichtlijst [data-voorbij]');
    if (v) { await v.click(); await foto('tab-cluboverzicht-voorbij'); }
  }
}
// Het naammenu en elk paneel.
if (await p.$('#naammenuknop')) {
  await p.click('#naammenuknop');
  await foto('menu');
  const items = await p.$$eval('#naammenu button:not([hidden])', (x) => x.map((y) => y.id || `beheer:${y.dataset.scherm}`));
  console.log(`  menu: ${items.join(', ')}`);
  await p.click('#naammenuknop');
  for (const it of items) {
    if (it === 'naammenu-afmelden') continue;
    if (await p.$eval('#naammenu', (m) => m.hidden)) await p.click('#naammenuknop');
    const sel = it.startsWith('beheer:') ? `#naammenu-beheer [data-scherm="${it.slice(7)}"]` : `#${it}`;
    await p.click(sel, { timeout: 3000 }).catch((e) => fouten.push(`klik ${it}: ${e.message.split('\n')[0]}`));
    await p.waitForTimeout(500);
    // Alle uitklapsecties open, om ze te zien.
    await p.$$eval('.paneel:not([hidden]) details', (d) => d.forEach((x) => { x.open = true; }));
    // Een paneel schuift binnenin: het scherm even zo hoog maken als zijn inhoud.
    const h = await p.evaluate(() => Math.max(...[...document.querySelectorAll('.paneel:not([hidden])')].map((x) => x.scrollHeight), 800));
    await p.setViewportSize({ width: breedte, height: Math.min(h + 40, 9000) });
    await p.waitForTimeout(200);
    await meet(`paneel-${it}`);
    await p.screenshot({ path: `${UIT}/paneel-${it.replace('naammenu-', '').replace('beheer:', '')}.png` });
    await p.setViewportSize({ width: breedte, height: 800 });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(150);
  }
}
console.log(`  fouten: ${JSON.stringify(fouten)}`);
console.log(`  foute antwoorden: ${JSON.stringify([...new Set(slecht)])}`);
console.log(`  schermafdrukken: ${UIT}`);
await b.close(); server.close();
