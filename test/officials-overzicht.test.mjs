// Het cluboverzicht van de officials (0.39.0, I1 fase 4b).
//
// De backend tegen de databank (cijfers, groepen, voorbij, probleem), het
// venster als zuivere functie, en het scherm als tekst. Het scherm is ook in
// Chromium bekeken tegen de echte handlers (WIJZIGINGEN-0.39.0.md).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maakDb } from './d1.mjs';
import { rechtenVoor } from '../src/lib/rechten-db.js';
import { clubOverzicht } from '../src/officials/overzicht.js';
import { weekendVenster, vensterLabel, beginVorigeMaand } from '../src/officials/venster.js';

const scherm = readFileSync(new URL('../public/js/schermen/cluboverzicht.js', import.meta.url), 'utf8');
const seizoen = { code: '2026-27', naam: '2026-2027' };
const dag = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test('het venster: volledige weekends, en de vorige maand voor wie wil rechtzetten', () => {
  const v = weekendVenster(new Date('2026-10-28T10:00:00Z'), 2);
  assert.deepEqual(v.weekends, [{ zaterdag: '2026-10-31', zondag: '2026-11-01' }, { zaterdag: '2026-11-07', zondag: '2026-11-08' }]);
  assert.equal(v.tot, '2026-11-08');
  assert.equal(weekendVenster(new Date('2026-11-01T10:00:00Z'), 1).tot, '2026-11-01', 'op zondag telt dat weekend nog');
  assert.equal(vensterLabel(v), '31 okt–1 nov en 7–8 nov');
  assert.equal(beginVorigeMaand(new Date('2026-01-15T00:00:00Z')), '2025-12-01');
});

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd, officials) VALUES
      ('T12', '2026-27', 'Bears G12 A', 'G12', 0, 1), ('T16', '2026-27', 'Bears J16 A', 'J16', 0, 1),
      ('TX', '2026-27', 'Bears HSE A', 'HSE', 1, 0);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('baas', 'Bea', 'Baas', 'b@x.be'), ('ann', 'Ann', 'Aerts', 'a@x.be'), ('bert', 'Bert', 'Bos', 'bb@x.be');
    INSERT INTO rollen (persoon_id, rol) VALUES ('baas', 'YOADM'), ('ann', 'YO'), ('bert', 'YOPLUS');
  `);
  return db;
}
let nr = 0;
function wed(db, { team = 'T12', cat = 'G12', datum, scope = 1, off = 0, bond = null, forfait = null, ja = [], nee = [], op = [], thuis = 1 }) {
  nr += 1;
  db._sqlite.exec(`
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander)
      VALUES ('W${nr}', '${team}', '2026-27', '${datum}', '10:00', ${thuis}, 'Tienen');
    INSERT INTO officials_wedstrijd (wedstrijd_id, cat_code, scope, off_aantal, bond_officials, forfait)
      SELECT id, '${cat}', ${scope}, ${off}, ${bond ?? 'NULL'}, ${forfait ? `'${forfait}'` : 'NULL'} FROM wedstrijden WHERE wedstrijd_guid = 'W${nr}';
  `);
  const id = db._sqlite.prepare(`SELECT id FROM wedstrijden WHERE wedstrijd_guid = ?`).get(`W${nr}`).id;
  for (const p of ja) db._sqlite.exec(`INSERT INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status) VALUES ('${p}', ${id}, 'ja')`);
  for (const p of nee) db._sqlite.exec(`INSERT INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status) VALUES ('${p}', ${id}, 'nee')`);
  for (const p of op) db._sqlite.exec(`INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id) VALUES (${id}, '${p}')`);
  return id;
}
async function vraag(db, query = '') {
  const res = await clubOverzicht({
    db, seizoen, persoon: { id: 'baas' }, rechten: await rechtenVoor(db, 'baas', seizoen.code),
    request: new Request(`https://x/${query}`),
  });
  return res.json();
}

test('cijfers over het venster, en per wedstrijd wie kan, wie niet en wie aangeduid is', async () => {
  const db = zetKlaar();
  const za = weekendVenster(new Date()).weekends[0].zaterdag;
  const vol = wed(db, { datum: za, ja: ['ann', 'bert'], op: ['ann', 'bert'] });
  const tekort = wed(db, { datum: za, ja: ['ann'], nee: ['bert'] });
  const leeg = wed(db, { team: 'T16', cat: 'J16', datum: za });
  const bond = wed(db, { team: 'T16', cat: 'J16', datum: za, bond: 2 });
  const forfait = wed(db, { datum: za, forfait: 'uit', op: ['bert'] });
  const buiten = wed(db, { team: 'T16', cat: 'J16', datum: za, scope: 0 });
  const later = wed(db, { datum: dag(40) });
  wed(db, { team: 'TX', cat: 'HSE', datum: za });
  wed(db, { datum: za, thuis: 0 });
  const voorbij = wed(db, { datum: dag(-3), op: ['ann'] });

  const r = await vraag(db);
  const per = Object.fromEntries(r.wedstrijden.map((w) => [w.id, w]));
  assert.ok(!per[voorbij], 'zonder vraag geen voorbije');
  assert.equal(r.wedstrijden.length, 7, 'geen ploeg zonder officials, geen uitwedstrijd');
  assert.deepEqual([r.in_venster, r.in_scope, r.onvolledig, r.zonder_beschikbaren, r.met_probleem], [6, 5, 2, 2, 3]);
  assert.deepEqual(per[vol].toegewezen.map((p) => p.naam), ['Ann Aerts', 'Bert Bos']);
  assert.equal(per[vol].probleem, false);
  assert.deepEqual([per[tekort].beschikbaar.map((p) => p.id), per[tekort].niet_beschikbaar.map((p) => p.id)], [['ann'], ['bert']]);
  assert.equal(per[tekort].probleem, true);
  assert.equal(per[leeg].probleem, true);
  assert.deepEqual([per[bond].nodig, per[bond].probleem], [0, true], 'niemand beschikbaar telt nog als probleem');
  assert.deepEqual([per[forfait].nodig, per[forfait].probleem, per[forfait].toegewezen.length], [0, false, 1]);
  assert.equal(per[buiten].in_scope, false);
  assert.deepEqual([per[later].in_venster, per[later].probleem], [false, true]);
  assert.match(per[vol].wedstrijdblad, /wedguid=W/);

  const mv = await vraag(db, '?voorbij=1');
  const v = mv.wedstrijden.find((w) => w.id === voorbij);
  assert.deepEqual([v.voorbij, v.in_venster, v.probleem], [true, false, false], 'voorbij telt nooit mee');
  assert.equal(mv.in_venster, r.in_venster, 'de cijfers verschuiven niet door de schakelaar');
});

test('het scherm: ontsmet, bevestigen enkel waar de backend erom vraagt, voorstel vóór uitvoeren', () => {
  for (const veld of ['w.ploeg', 'w.tegenstander', 'o.naam', 'p.naam', 'veilig(p.bericht)']) {
    assert.ok(scherm.includes(veld.startsWith('veilig') ? veld : `veilig(${veld}`), veld);
  }
  assert.match(scherm, /status === 409 && \/bevestig\/i\.test/);
  assert.match(scherm, /return wijsAan\(id, persoonId, true\)/);
  const auto = scherm.slice(scherm.indexOf('async function automatisch'));
  assert.match(auto.slice(0, 400), /\{ dagen: 21 \}\)/, 'eerst zonder uitvoeren');
  assert.match(scherm, /\{ dagen: 21, uitvoeren: true \}/);
  assert.match(scherm, /if \(!confirm\('Deze aanduiding vrijgeven\?/);
  assert.match(scherm, /if \(!confirm\(`Een herinnering sturen/);
});
