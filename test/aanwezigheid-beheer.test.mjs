// Wat een coach, coördinator of beheerder doet met aanwezigheid.
//
// Het zwaartepunt: PLOEGV kan bekijken maar niet vaststellen of uitsluiten —
// dat volgt uit de rechten die al sinds 0.1.0 vastliggen (architectuur 8.3) —
// en 'niet geselecteerd' wordt nooit als afwezig vastgesteld door de app
// zelf.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { bouwRechten } from '../src/lib/rechten.js';
import {
  aanwezigheidTonen, vaststellen, uitsluiten, selectieZetten, selectiePubliceren,
} from '../src/routes/admin/aanwezigheid-beheer.js';

const T1 = 'BVBL1125J16  2';
const seizoen = { code: '2026-27', naam: '2026-2027' };

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, selectie_aan) VALUES ('${T1}', '2026-27', 'J16 B', 1);
    INSERT INTO personen (id, voornaam, achternaam) VALUES
      ('p1', 'Dries', 'van Geijstelen'), ('p2', 'Otto', 'Muñiz'), ('p-coach', 'Coach', 'Naam');
    INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES
      ('p1', '${T1}', '2026-27'), ('p2', '${T1}', '2026-27');
    INSERT INTO trainingen (team_guid, seizoen, datum, begin, einde, locatie_tekst)
         VALUES ('${T1}', '2026-27', '2026-09-10', '18:30', '20:00', 'A');
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis)
         VALUES ('W1', '${T1}', '2026-27', '2026-09-12', '10:30', 1);
  `);
  return db;
}

const coachRechten = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: T1 }] });
const ploegvRechten = bouwRechten({ rollen: [{ rol: 'PLOEGV', team_guid: T1 }] });
const vreemdeRechten = bouwRechten();

function verzoek(pad, body) {
  return new Request(`https://x${pad}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined });
}

test('een coach ziet de aanwezigheden, met spelers die nog niets opgaven erbij', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  const res = await aanwezigheidTonen({
    db, rechten: coachRechten,
    request: verzoek(`/x?soort=training&activiteit=${training.id}`),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.spelers.length, 2, 'ook wie nog niet antwoordde, hoort erbij');
});

test('wie geen recht heeft op de ploeg, ziet niets', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  const res = await aanwezigheidTonen({
    db, rechten: vreemdeRechten,
    request: verzoek(`/x?soort=training&activiteit=${training.id}`),
  });
  assert.equal(res.status, 403);
});

test('een coach kan aanwezigheid vaststellen', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  const res = await vaststellen({
    db, persoon: { id: 'p-coach' }, rechten: coachRechten,
    request: verzoek('/x', { soort: 'training', activiteit_id: training.id, persoon_id: 'p1', status: 'aanwezig' }),
  });
  assert.equal(res.status, 200);
  const rij = db._sqlite.prepare(`SELECT vaststelling_status FROM aanwezigheden`).get();
  assert.equal(rij.vaststelling_status, 'aanwezig');
});

test('PLOEGV kan niet vaststellen', () => {
  // Vastgelegd sinds de rechtenlaag zelf (0.1.0): PLOEGV configureert mee
  // maar stelt geen aanwezigheden vast.
  assert.equal(ploegvRechten.mag('team.aanwezigheid.vaststellen', T1), false);
});

test('PLOEGV krijgt via de route ook echt geen toegang tot vaststellen', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  const res = await vaststellen({
    db, persoon: { id: 'p-ploegv' }, rechten: ploegvRechten,
    request: verzoek('/x', { soort: 'training', activiteit_id: training.id, persoon_id: 'p1', status: 'aanwezig' }),
  });
  assert.equal(res.status, 403);
});

test('vaststellen zonder voorafgaande opgave maakt een nieuwe rij aan', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  await vaststellen({
    db, persoon: { id: 'p-coach' }, rechten: coachRechten,
    request: verzoek('/x', { soort: 'training', activiteit_id: training.id, persoon_id: 'p1', status: 'te_laat' }),
  });
  const rij = db._sqlite.prepare(`SELECT * FROM aanwezigheden`).get();
  assert.equal(rij.opgave_status, null, 'er was geen opgave, en die wordt niet verzonnen');
  assert.equal(rij.vaststelling_status, 'te_laat');
});

test('uitsluiten zonder reden wordt geweigerd', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  const res = await uitsluiten({
    db, persoon: { id: 'p-coach' }, rechten: coachRechten,
    request: verzoek('/x', { soort: 'training', activiteit_id: training.id, persoon_id: 'p1', uitgesloten: true }),
  });
  assert.equal(res.status, 400);
});

test('uitsluiten met reden wordt gelogd, ook het terugdraaien', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  await uitsluiten({
    db, persoon: { id: 'p-coach' }, rechten: coachRechten,
    request: verzoek('/x', { soort: 'training', activiteit_id: training.id, persoon_id: 'p1', uitgesloten: true, reden: 'disciplinair' }),
  });
  await uitsluiten({
    db, persoon: { id: 'p-coach' }, rechten: coachRechten,
    request: verzoek('/x', { soort: 'training', activiteit_id: training.id, persoon_id: 'p1', uitgesloten: false }),
  });
  const regels = db._sqlite.prepare(`SELECT * FROM logboek WHERE wat LIKE '%uitgesloten%' OR wat LIKE '%teruggedraaid%'`).all();
  assert.equal(regels.length, 2);
});

test('PLOEGV kan niemand uitsluiten', () => {
  assert.equal(ploegvRechten.mag('speler.uitsluiten', T1), false);
});

test('een selectie kan enkel spelers van de eigen ploeg bevatten', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`INSERT INTO personen (id, voornaam, achternaam) VALUES ('p-elders', 'X', 'Y')`);
  const wed = db._sqlite.prepare(`SELECT id FROM wedstrijden`).get();
  const res = await selectieZetten({
    db, persoon: { id: 'p-coach' }, rechten: coachRechten,
    request: verzoek('/x', { wedstrijd_id: wed.id, persoon_ids: ['p1', 'p-elders'] }),
  });
  assert.equal(res.status, 400);
});

test('een geldige selectie wordt weggeschreven', async () => {
  const db = zetKlaar();
  const wed = db._sqlite.prepare(`SELECT id FROM wedstrijden`).get();
  await selectieZetten({
    db, persoon: { id: 'p-coach' }, rechten: coachRechten,
    request: verzoek('/x', { wedstrijd_id: wed.id, persoon_ids: ['p1', 'p2'] }),
  });
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM wedstrijdselecties`).get().n;
  assert.equal(aantal, 2);
});

test('een tweede keer selecteren vervangt de vorige lijst', async () => {
  const db = zetKlaar();
  const wed = db._sqlite.prepare(`SELECT id FROM wedstrijden`).get();
  await selectieZetten({
    db, persoon: { id: 'p-coach' }, rechten: coachRechten,
    request: verzoek('/x', { wedstrijd_id: wed.id, persoon_ids: ['p1', 'p2'] }),
  });
  await selectieZetten({
    db, persoon: { id: 'p-coach' }, rechten: coachRechten,
    request: verzoek('/x', { wedstrijd_id: wed.id, persoon_ids: ['p1'] }),
  });
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM wedstrijdselecties`).get().n;
  assert.equal(aantal, 1);
});

test('een klad-selectie staat niet als gepubliceerd', async () => {
  const db = zetKlaar();
  const wed = db._sqlite.prepare(`SELECT id FROM wedstrijden`).get();
  const uit = await selectieZetten({
    db, persoon: { id: 'p-coach' }, rechten: coachRechten,
    request: verzoek('/x', { wedstrijd_id: wed.id, persoon_ids: ['p1'] }),
  });
  const body = await uit.json();
  assert.equal(body.gepubliceerd, false);
});

test('publiceren zet de vlag om', async () => {
  const db = zetKlaar();
  const wed = db._sqlite.prepare(`SELECT id FROM wedstrijden`).get();
  await selectiePubliceren({
    db, persoon: { id: 'p-coach' }, rechten: coachRechten,
    request: verzoek('/x', { wedstrijd_id: wed.id }),
  });
  const rij = db._sqlite.prepare(`SELECT selectie_gepubliceerd FROM wedstrijden`).get();
  assert.equal(rij.selectie_gepubliceerd, 1);
});

test('aanwezigheidTonen toont de klad-selectie enkel via het selectie-veld, en de begeleiding ziet ze', async () => {
  const db = zetKlaar();
  const wed = db._sqlite.prepare(`SELECT id FROM wedstrijden`).get();
  await selectieZetten({
    db, persoon: { id: 'p-coach' }, rechten: coachRechten,
    request: verzoek('/x', { wedstrijd_id: wed.id, persoon_ids: ['p1'] }),
  });
  const res = await aanwezigheidTonen({
    db, rechten: coachRechten,
    request: verzoek(`/x?soort=wedstrijd&activiteit=${wed.id}`),
  });
  const body = await res.json();
  assert.equal(body.selectie.aan, true);
  assert.equal(body.selectie.gepubliceerd, false);
  assert.deepEqual(body.selectie.geselecteerd, ['p1']);
});
