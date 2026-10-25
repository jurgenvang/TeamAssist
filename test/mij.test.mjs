// /api/mij: wie ben ik, en wat mag ik.
//
// Hier enkel wat het naammenu nodig heeft om 'Kijken als …' te tonen. De
// rechten zelf hebben hun eigen testreeks in rechten.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { mij } from '../src/routes/mij.js';
import { bouwRechten, beperkTot } from '../src/lib/rechten.js';

const J16 = 'BVBL1125J16  2';
const seizoen = { code: '2026-27', naam: '2026-2027' };

function zetKlaar(testrolToegelaten) {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p1', 'Anna', 'Peeters', 'a@b.c');
  `);
  // Het schema zet de rij zelf al klaar; voor 'ontbreekt' wordt ze gewist.
  db._sqlite.exec(`DELETE FROM instellingen WHERE sleutel = 'testrol_toegelaten'`);
  if (testrolToegelaten !== undefined) {
    db._sqlite.exec(`INSERT INTO instellingen (sleutel, waarde) VALUES ('testrol_toegelaten', '${testrolToegelaten}')`);
  }
  return db;
}

const persoon = { id: 'p1', voornaam: 'Anna', achternaam: 'Peeters', email: 'a@b.c' };
const admin = () => bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] });

async function vraag(db, rechten) {
  const res = await mij({ db, persoon, rechten, seizoen });
  return res.json();
}

test('een beheerder ziet de testrol in het menu als de instelling aanstaat', async () => {
  const body = await vraag(zetKlaar('1'), admin());
  assert.equal(body.testrol_mogelijk, true);
});

test('staat de instelling uit, dan biedt het menu de testrol niet aan', async () => {
  assert.equal((await vraag(zetKlaar('0'), admin())).testrol_mogelijk, false);
});

test('een ontbrekende instellingsrij geldt als uit', async () => {
  assert.equal((await vraag(zetKlaar(), admin())).testrol_mogelijk, false);
});

test('een coach krijgt de testrol nooit aangeboden, ook niet met de instelling aan', async () => {
  const coach = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: J16 }] });
  assert.equal((await vraag(zetKlaar('1'), coach)).testrol_mogelijk, false);
});

test('tijdens een lopende testrol staat ze niet in het menu: de testbalk is de weg terug', async () => {
  const versmald = beperkTot(admin(), 'COACH', J16);
  assert.equal((await vraag(zetKlaar('1'), versmald)).testrol_mogelijk, false);
});
