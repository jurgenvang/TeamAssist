// Mijn agenda (T21): trainingen, wedstrijden, fluiten en taken van het gezin,
// in één lijst, met de botsing tussen spelen en fluiten.
//
// Tegen het echte schema en de echte route. Datums relatief tegenover vandaag
// (learnings.md: een vaste datum in een test is een tijdbom).

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { rechtenVoor } from '../src/lib/rechten-db.js';
import { agenda, markeerBotsingen, grensDatum } from '../src/routes/agenda.js';
import { officialsWedstrijden, aantalTeBeantwoorden } from '../src/officials/routes.js';
import { brusselDatum, plusDagen } from '../src/lib/klok.js';
import { sectieVoor, grensMaand } from '../public/js/officials-hulp.js';

const seizoen = { code: '2026-27', naam: '2026-2027' };
const dag = (n) => plusDagen(brusselDatum(), n);
const C = 'BVBL1125';

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, naam_kort, categorie, gevolgd, officials) VALUES
      ('${C}G12  1', '2026-27', 'Bears G12 A', 'U12 A', 'G12', 1, 1),
      ('${C}G14  1', '2026-27', 'Bears G14 A', 'U14 A', 'G14', 1, 1),
      ('${C}G10  2', '2026-27', 'Bears G10 B', 'U10 B', 'G10', 0, 1);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('ouder', 'Olga', 'Kind', 'o@x.be'), ('max', 'Max', 'Kind', NULL), ('mia', 'Mia', 'Kind', NULL),
      ('vreemd', 'Vic', 'Vreemd', 'v@x.be'), ('admin', 'Ad', 'Min', 'a@x.be');
    INSERT INTO rollen (persoon_id, rol) VALUES ('max', 'YO'), ('admin', 'ADMIN'), ('vreemd', 'YOPLUS');
    INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('ouder', 'max'), ('ouder', 'mia');
    INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES
      ('max', '${C}G12  1', '2026-27'), ('mia', '${C}G12  1', '2026-27'), ('vreemd', '${C}G14  1', '2026-27');
    INSERT INTO zalen (id, naam, vbl_acc_guid) VALUES ('tb', 'Sporthal Ter Bank', 'A1');
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander, locatie_tekst, vbl_acc_guid) VALUES
      ('SPEEL', '${C}G12  1', '2026-27', '${dag(3)}', '10:00', 0, 'Tienen G12', 'Sporthal Tienen', 'A9'),
      ('FLUIT', '${C}G10  2', '2026-27', '${dag(3)}', '11:00', 1, 'Diest G10', 'Sporthal Ter Bank', 'A1'),
      ('LATER', '${C}G10  2', '2026-27', '${dag(5)}', '11:00', 1, 'Lier G10', 'Sporthal Ter Bank', 'A1'),
      ('OPEN1', '${C}G10  2', '2026-27', '${dag(6)}', '11:00', 1, 'Gent G10', 'Sporthal Ter Bank', 'A1'),
      ('OPEN14', '${C}G14  1', '2026-27', '${dag(6)}', '14:00', 1, 'Gent G14', 'Sporthal Ter Bank', 'A1'),
      ('FORF', '${C}G10  2', '2026-27', '${dag(7)}', '11:00', 1, 'Aarschot G10', 'Sporthal Ter Bank', 'A1'),
      ('VOORBIJ', '${C}G12  1', '2026-27', '${dag(-2)}', '10:00', 1, 'Oud G12', 'Sporthal Ter Bank', 'A1'),
      ('VER', '${C}G10  2', '2026-27', '${dag(90)}', '11:00', 1, 'Ver G10', 'Sporthal Ter Bank', 'A1');
    INSERT INTO officials_wedstrijd (wedstrijd_id, cat_code, scope, scope_reden, forfait)
      SELECT id, CASE WHEN team_guid LIKE '%G14%' THEN 'G14' WHEN team_guid LIKE '%G12%' THEN 'G12' ELSE 'G10' END, 1, 'auto',
             CASE wedstrijd_guid WHEN 'FORF' THEN 'uit' END
        FROM wedstrijden WHERE thuis = 1;
    -- Max fluit FLUIT (toegewezen) en LATER (vrijgegeven: telt niet), en zei 'ja' op niets anders.
    INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, status) SELECT id, 'max', 'toegewezen' FROM wedstrijden WHERE wedstrijd_guid = 'FLUIT';
    INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, status) SELECT id, 'max', 'vrijgegeven' FROM wedstrijden WHERE wedstrijd_guid = 'LATER';
    INSERT INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status) SELECT 'max', id, 'ja' FROM wedstrijden WHERE wedstrijd_guid = 'LATER';
    -- De ouder doet de klok bij FLUIT (dezelfde wedstrijd die Max fluit: andere persoon, geen botsing voor hem).
    INSERT INTO wedstrijdtaken (wedstrijd_id, taak, persoon_id) SELECT id, 'klok', 'ouder' FROM wedstrijden WHERE wedstrijd_guid = 'FLUIT';
    INSERT INTO trainingen (team_guid, seizoen, datum, begin, einde, zaal_id, status) VALUES
      ('${C}G12  1', '2026-27', '${dag(1)}', '18:00', '19:30', 'tb', 'gepland'),
      ('${C}G12  1', '2026-27', '${dag(2)}', '18:00', '19:30', 'tb', 'zaal_niet_beschikbaar'),
      ('${C}G12  1', '2026-27', '${dag(-1)}', '18:00', '19:30', 'tb', 'gepland');
    INSERT INTO aanwezigheden (soort, activiteit_id, team_guid, seizoen, persoon_id, hoedanigheid, opgave_status, opgave_reden)
      SELECT 'training', id, team_guid, seizoen, 'mia', 'SPELER', 'afwezig', 'ziek' FROM trainingen WHERE datum = '${dag(1)}';
  `);
  return db;
}

async function ctx(db, id) {
  const persoon = db._sqlite.prepare('SELECT * FROM personen WHERE id = ?').get(id);
  return { db, env: {}, seizoen, persoon, rechten: await rechtenVoor(db, id, seizoen.code), request: new Request('https://x/api/mij/agenda') };
}
const haal = async (db, id) => (await agenda(await ctx(db, id))).json();

test('een ouder ziet het hele gezin in één lijst, in volgorde, met voor wie', async () => {
  const db = zetKlaar();
  const r = await haal(db, 'ouder');
  assert.equal(r.tonen, true);
  assert.equal(r.gezin, true);
  const kort = r.agenda.map((i) => `${i.soort}:${i.voor.id}:${i.datum === dag(1) ? 'd1' : i.datum === dag(2) ? 'd2' : i.datum === dag(3) ? 'd3' : '?'}`);
  assert.deepEqual(kort, [
    // Twee kinderen in dezelfde ploeg: elk hun eigen training, met hun eigen opgave.
    'training:max:d1', 'training:mia:d1',
    'training:max:d2', 'training:mia:d2',
    'wedstrijd:max:d3', 'wedstrijd:mia:d3',
    'fluiten:max:d3', 'taak:ouder:d3',
  ]);
  const mia = r.agenda.find((i) => i.soort === 'training' && i.voor.id === 'mia' && i.datum === dag(1));
  assert.deepEqual([mia.opgave_status, mia.opgave_reden, mia.locatie], ['afwezig', 'ziek', 'Sporthal Ter Bank']);
  assert.equal(r.agenda.find((i) => i.datum === dag(2)).status, 'zaal_niet_beschikbaar', 'een training die niet doorgaat, blijft zichtbaar');
  const taak = r.agenda.find((i) => i.soort === 'taak');
  assert.deepEqual([taak.taak_naam, taak.voor.ik, taak.ploeg], ['Klok', true, 'U10 B']);
});

test('fluiten: enkel wat aangeduid is, niet wat vrijgegeven of enkel beantwoord is', async () => {
  const db = zetKlaar();
  const r = await haal(db, 'ouder');
  const fluiten = r.agenda.filter((i) => i.soort === 'fluiten');
  assert.equal(fluiten.length, 1);
  assert.equal(fluiten[0].tegenstander, 'Diest G10');
  assert.equal(fluiten[0].opkomst, '10:40');
  assert.match(fluiten[0].wedstrijdblad, /wedguid=FLUIT$/);
});

test('niets van vóór vandaag', async () => {
  const db = zetKlaar();
  const r = await haal(db, 'ouder');
  assert.ok(!r.agenda.some((i) => i.datum < brusselDatum()));
});

test('de botsing: Max speelt om 10 uur elders en fluit om 11 uur — bij beide, en enkel daar', async () => {
  const db = zetKlaar();
  const r = await haal(db, 'ouder');
  const speel = r.agenda.find((i) => i.soort === 'wedstrijd' && i.voor.id === 'max');
  const fluit = r.agenda.find((i) => i.soort === 'fluiten');
  assert.equal(speel.botsingen.length, 1);
  assert.match(speel.botsingen[0], /^fluiten om 11:00/);
  assert.match(fluit.botsingen[0], /^wedstrijd om 10:00/);
  // Mia speelt dezelfde wedstrijd maar fluit niet; de ouder doet de klok bij
  // een wedstrijd waar hij zelf niet speelt: geen botsing.
  assert.deepEqual(r.agenda.find((i) => i.soort === 'wedstrijd' && i.voor.id === 'mia').botsingen, []);
  assert.deepEqual(r.agenda.find((i) => i.soort === 'taak').botsingen, []);
});

test('markeerBotsingen: training met wedstrijd niet, taak bij de eigen wedstrijd niet, andere persoon niet', () => {
  const p = { id: 'p', naam: 'P' };
  const q = { id: 'q', naam: 'Q' };
  const items = markeerBotsingen([
    { soort: 'training', voor: p, datum: '2026-11-14', uur: '10:00', acc: 'A1' },
    { soort: 'wedstrijd', voor: p, datum: '2026-11-14', uur: '10:30', acc: 'A1', wedstrijd_id: 7 },
    { soort: 'taak', voor: p, datum: '2026-11-14', uur: '10:30', acc: 'A1', wedstrijd_id: 7, taak_naam: 'Klok' },
    { soort: 'fluiten', voor: q, datum: '2026-11-14', uur: '10:30', acc: 'A1', wedstrijd_id: 8 },
    // Zelfde zaal: 2 uur marge; andere zaal: 2,5 uur.
    { soort: 'fluiten', voor: p, datum: '2026-11-14', uur: '12:15', acc: 'A2', wedstrijd_id: 9 },
  ]);
  // training: met de klok (30 min, zelfde zaal) en met fluiten elders (2u15);
  // wedstrijd: enkel met fluiten elders — niet met de training, niet met de
  // taak bij zichzelf; taak: met de training en fluiten elders; q: niets.
  assert.deepEqual(items.map((i) => i.botsingen.length), [2, 1, 2, 0, 3]);
  assert.deepEqual(items[0].botsingen, ['klok om 10:30', 'fluiten om 12:15']);
  assert.deepEqual(items[1].botsingen, ['fluiten om 12:15']);
  assert.deepEqual(items[2].botsingen, ['training om 10:00', 'fluiten om 12:15'], 'de taak botst niet met de eigen wedstrijd');
});

test('nog te beantwoorden: per official van het gezin, met diens eigen rechten', async () => {
  const db = zetKlaar();
  const r = await haal(db, 'ouder');
  // Max is YO: enkel U10/U12. OPEN1 telt; OPEN14 (U14) niet, FORF niet, LATER
  // niet (beantwoord), VER niet (na deze en volgende maand) — tenzij die maand
  // er nog bij hoort.
  const ver = dag(90) < grensDatum(brusselDatum()) ? 1 : 0;
  assert.deepEqual(r.te_beantwoorden, [{ id: 'max', naam: 'Max Kind', ik: false, aantal: 1 + ver }]);
});

test('nog te beantwoorden telt precies wat Aanduidingen als open toont, vóór de grens', async () => {
  const db = zetKlaar();
  for (const [wie, vanaf14] of [['max', false], ['vreemd', true]]) {
    const c = await ctx(db, wie);
    const lijst = (await (await officialsWedstrijden(c)).json()).wedstrijden;
    const grens = grensMaand();
    const open = lijst.filter((w) => sectieVoor(w) === 'open' && w.datum.slice(0, 7) < grens).length;
    assert.equal(await aantalTeBeantwoorden(db, seizoen.code, wie, vanaf14, grensDatum(brusselDatum())), open, wie);
  }
});

test('grensDatum: de eerste dag na deze en volgende maand, ook over de jaargrens', () => {
  assert.equal(grensDatum('2026-11-11'), '2027-01-01');
  assert.equal(grensDatum('2026-12-31'), '2027-02-01');
  assert.equal(grensDatum('2026-01-31'), '2026-03-01');
});

test('wie speelt noch fluit noch een taak heeft, krijgt geen agenda', async () => {
  const db = zetKlaar();
  const r = await haal(db, 'admin');
  assert.equal(r.tonen, false);
  assert.deepEqual(r.agenda, []);
});

test('een ander gezin blijft buiten beeld, ook in dezelfde club', async () => {
  const db = zetKlaar();
  const r = await haal(db, 'vreemd');
  assert.equal(r.gezin, false);
  assert.ok(r.agenda.every((i) => i.voor.id === 'vreemd'));
  assert.ok(r.tonen, 'een YO+ zonder iets gepland ziet toch zijn agenda, met wat er te beantwoorden is');
  assert.deepEqual(r.te_beantwoorden.map((o) => [o.id, o.ik]), [['vreemd', true]]);
});
