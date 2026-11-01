// Vergoedingen club, het scherm (0.40.0, I1 fase 4c).
//
// De rekenregels en het afsluiten zelf staan in officials-facturatie.test.mjs.
// Hier: wat het scherm nodig heeft van de backend (de wedstrijd-id om weg te
// halen, wie afsloot), de weg 'weghalen = vrijgeven', de zuivere hulpjes, en
// het scherm als tekst. In Chromium bekeken tegen de echte handlers
// (WIJZIGINGEN-0.40.0.md).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maakDb } from './d1.mjs';
import { rechtenVoor } from '../src/lib/rechten-db.js';
import { facturatieVoorbeeld, facturatieAfsluiten, facturatieStaat } from '../src/officials/facturatie.js';
import { vrijgeven } from '../src/officials/routes.js';
import { naarCent, wedstrijdTekst } from '../public/js/officials-hulp.js';

const scherm = readFileSync(new URL('../public/js/schermen/vergoedingen-club.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const seizoen = { code: '2025-26', naam: '2025-2026' };

// --- de zuivere hulpjes -------------------------------------------------------

test('naarCent: zoals een beheerder een bedrag intypt', () => {
  assert.equal(naarCent('15'), 1500);
  assert.equal(naarCent('17,5'), 1750);
  assert.equal(naarCent('17,50'), 1750);
  assert.equal(naarCent('€ 20.05'), 2005);
  assert.equal(naarCent(' 0 '), 0);
  for (const fout of ['', 'vijftien', '15,555', '-5', '1.000,00', null]) assert.equal(naarCent(fout), null, String(fout));
});

test('wedstrijdTekst: dag, wedstrijd, categorie, correctie en forfait', () => {
  assert.equal(wedstrijdTekst({ datum: '2026-03-07', wedstrijd: 'G12 A - Gent', catLabel: 'U12', soort: 'wedstrijd', aantal: 1 }),
    'za 7/03 G12 A - Gent (U12)');
  assert.equal(wedstrijdTekst({ datum: '2026-03-07', wedstrijd: 'G12 A - Gent', catCode: 'G12', soort: 'correctie', aantal: -1, forfait: 'uit' }),
    'za 7/03 G12 A - Gent (G12) — correctie -1 — forfait');
});

// --- de backend, voor het scherm ----------------------------------------------

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2025-26', '2025-2026', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd, officials) VALUES ('T12', '2025-26', 'Bears G12 A', 'G12', 0, 1);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('ann', 'Ann', 'Aerts', 'ann@x.be'), ('baas', 'Bea', 'Baas', 'baas@x.be'), ('pen', 'Piet', 'Penning', 'pen@x.be');
    INSERT INTO rollen (persoon_id, rol) VALUES ('ann', 'YO'), ('baas', 'YOADM'), ('pen', 'FINADM');
  `);
  for (const [guid, datum] of [['W1', '2026-03-07'], ['W2', '2026-03-14']]) {
    db._sqlite.exec(`
      INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander)
        VALUES ('${guid}', 'T12', '2025-26', '${datum}', '14:00', 1, 'Gent');
      INSERT INTO officials_wedstrijd (wedstrijd_id, cat_code, scope) SELECT id, 'G12', 1 FROM wedstrijden WHERE wedstrijd_guid = '${guid}';
      INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, toegewezen_door) SELECT id, 'ann', 'baas' FROM wedstrijden WHERE wedstrijd_guid = '${guid}';
    `);
  }
  return db;
}
async function ctx(db, wie, { body, url = 'https://x/' } = {}) {
  return {
    db, env: {}, seizoen, persoon: { id: wie }, rechten: await rechtenVoor(db, wie, seizoen.code),
    request: new Request(url, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined }),
  };
}
const json = async (res) => ({ status: res.status, ...(await res.json()) });
const voorbeeld = async (db) => json(await facturatieVoorbeeld(await ctx(db, 'baas', { url: 'https://x/?maand=2026-03' })));

test('het voorbeeld geeft per wedstrijd de id mee, en weghalen = vrijgeven', async () => {
  const db = zetKlaar();
  const v = await voorbeeld(db);
  const [ann] = v.officials;
  assert.equal(ann.wedstrijden.length, 2);
  const id = ann.wedstrijden[0].wedstrijdId;
  assert.ok(Number.isInteger(id), 'zonder id kan het scherm niets weghalen');

  const uit = await json(await vrijgeven(await ctx(db, 'baas', { body: { wedstrijd_id: id, persoon_id: 'ann' } })));
  assert.deepEqual([uit.vrijgegeven, uit.voorbij], [true, true], 'voorbij: de official krijgt geen bericht');
  const na = await voorbeeld(db);
  assert.equal(na.officials[0].wedstrijden.length, 1);
  assert.equal(na.totaal, '€ 15,00');
});

test('de afgesloten staat zegt wie afsloot, bij naam', async () => {
  const db = zetKlaar();
  const oud = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}');
  try {
    assert.equal((await facturatieAfsluiten(await ctx(db, 'pen', { body: { maand: '2026-03', versturen: false } }))).status, 200);
  } finally {
    globalThis.fetch = oud;
  }
  const s = await json(await facturatieStaat(await ctx(db, 'pen', { url: 'https://x/?maand=2026-03' })));
  assert.equal(s.afgesloten_door_naam, 'Piet Penning');
  assert.ok(s.officials[0].wedstrijden.every((w) => w.wedstrijdId === null), 'een afgesloten maand heeft niets om weg te halen');
});

// --- het scherm, als tekst ------------------------------------------------------

test('weghalen enkel met officials.beheren, enkel werk in een open maand, na bevestiging', () => {
  assert.match(scherm, /staat\.magVrijgeven = Object\.hasOwn\(rechten, 'officials\.beheren'\)/);
  assert.match(scherm, /weghalen && staat\.magVrijgeven && w\.soort !== 'correctie' && w\.wedstrijdId/);
  const weg = scherm.slice(scherm.indexOf("querySelectorAll('[data-weg]')"));
  assert.ok(weg.indexOf('confirm(') < weg.indexOf("'/api/admin/officials/vrijgeven'"));
  // De afgesloten staat toont nooit een knop om weg te halen.
  assert.match(scherm, /\$\{r\.officials\.map\(\(o\) => officialHtml\(o\)\)\.join\(''\)\}/);
});

test('afsluiten en een tarief wijzigen enkel na bevestiging', () => {
  for (const pad of ["'/api/admin/officials/facturatie/afsluiten'", "'/api/admin/officials/tarieven', 'POST'"]) {
    const voor = scherm.slice(0, scherm.indexOf(pad));
    assert.ok(voor.lastIndexOf('confirm(') > voor.lastIndexOf('addEventListener'), pad);
  }
});

test('namen en teksten uit de databank worden ontsmet', () => {
  for (const veld of ['o.naam', 'wedstrijdTekst(w)', 't.label ?? t.code', 'regelTekst(r)', 'r.afgesloten_door_naam', 'r.verstuurd_naar']) {
    assert.ok(scherm.includes(`veilig(${veld}`), veld);
  }
});

test('het tabblad staat standaard verborgen', () => {
  const start = html.indexOf('id="tab-vergoedingen"');
  assert.ok(start > 0);
  assert.match(html.slice(start, html.indexOf('>', start)), /hidden/);
});
