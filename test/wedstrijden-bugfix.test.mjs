// Twee fouten uit het logboek van de echte Worker (oktober 2026), die elke
// synchronisatie opnieuw een ploeg lieten mislukken:
//  - DSE 1: 'NOT NULL constraint failed: wedstrijden.begin' — de bond haalde
//    het uur weg bij een wedstrijd die we al kenden;
//  - ROL 2: 'UNIQUE constraint failed: wedstrijden.wedstrijd_guid' — een
//    wedstrijd tussen twee eigen ploegen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { wedstrijdenSync } from '../src/routes/admin/wedstrijden.js';

const T1 = 'BVBL1125ROL  1';
const T2 = 'BVBL1125ROL  2';
const seizoen = { code: '2026-27', naam: '2026-2027' };
const persoon = { id: 'p-admin' };

const ONDERLING = {
  guid: 'W9', tTGUID: T1, tTNaam: 'ROL A', tUGUID: T2, tUNaam: 'ROL B',
  datumString: '14-11-2026', beginTijd: '14.00', accGUID: 'ACC1', accNaam: 'Sporthal A',
  gespeeld: 'N', wedOff: [],
};

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd) VALUES ('${T1}', '2026-27', 'ROL A', 'ROL', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd) VALUES ('${T2}', '2026-27', 'ROL B', 'ROL', 1);
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p-admin', 'A', 'B');
  `);
  return db;
}

async function sync(db, perPloeg) {
  const oude = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const guid = decodeURIComponent(new URL(String(url)).searchParams.get('teamguid') ?? '');
    return new Response(JSON.stringify(perPloeg(guid)), { status: 200 });
  };
  try {
    const res = await wedstrijdenSync({
      db, persoon, seizoen, request: new Request('https://x/x?uitvoeren=1', { method: 'POST' }),
    });
    return await res.json();
  } finally {
    globalThis.fetch = oude;
  }
}

const mislukt = (uit) => uit.ploegen.filter((p) => p.status === 'fout');

test('een wedstrijd tussen twee eigen ploegen staat bij beide ploegen', async () => {
  const db = zetKlaar();
  const uit = await sync(db, () => [ONDERLING]);
  assert.deepEqual(mislukt(uit), []);

  const rijen = db._sqlite
    .prepare(`SELECT team_guid, thuis, tegenstander FROM wedstrijden ORDER BY team_guid`)
    .all()
    .map((r) => ({ ...r }));
  assert.deepEqual(rijen, [
    { team_guid: T1, thuis: 1, tegenstander: 'ROL B' },
    { team_guid: T2, thuis: 0, tegenstander: 'ROL A' },
  ]);

  // En een tweede ronde verandert daar niets aan: geen dubbels, geen fout.
  const nog = await sync(db, () => [ONDERLING]);
  assert.deepEqual(mislukt(nog), []);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM wedstrijden`).get().n, 2);
});

test('een wijziging aan een onderlinge wedstrijd raakt enkel de rij van die ploeg', async () => {
  const db = zetKlaar();
  await sync(db, () => [ONDERLING]);
  // Enkel de bevraging voor T1 levert een nieuw uur; die voor T2 nog het oude.
  await sync(db, (guid) => [guid === T1 ? { ...ONDERLING, beginTijd: '16.00' } : ONDERLING]);
  const uren = db._sqlite.prepare(`SELECT team_guid, begin FROM wedstrijden ORDER BY team_guid`).all();
  assert.equal(uren[0].begin, '16:00');
  assert.equal(uren[1].begin, '14:00');
});

test('een wedstrijd waar de ploeg niet in speelt, wordt niet opgenomen', async () => {
  // TeamMatchesByGuid mengt competities; wat thuis noch uit bij deze ploeg
  // hoort, zou anders als uitwedstrijd tegen de thuisploeg verschijnen.
  const db = zetKlaar();
  const vreemd = { ...ONDERLING, guid: 'W10', tTGUID: 'BVBL1053ROL  1', tUGUID: 'BVBL1077ROL  1' };
  const uit = await sync(db, (guid) => (guid === T1 ? [vreemd] : []));
  assert.deepEqual(mislukt(uit), []);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM wedstrijden`).get().n, 0);
});

test('een gekende wedstrijd waarvan de bond het uur weghaalt, laat de ploeg niet mislukken', async () => {
  const db = zetKlaar();
  await sync(db, (guid) => (guid === T1 ? [ONDERLING] : []));
  const uit = await sync(db, (guid) => (guid === T1 ? [{ ...ONDERLING, beginTijd: '' }] : []));
  assert.deepEqual(mislukt(uit), []);

  // Het oude uur blijft staan: liever een uur dat mogelijk verschuift dan een
  // wedstrijd die verdwijnt. De wedstrijd geldt als gezien, niet als verdwenen.
  const rij = db._sqlite.prepare(`SELECT begin, bij_bond FROM wedstrijden WHERE team_guid = ?`).get(T1);
  assert.equal(rij.begin, '14:00');
  assert.equal(rij.bij_bond, 1);
  const ploeg = uit.ploegen.find((p) => p.ploeg === T1);
  assert.equal(ploeg.onvolledig.length, 1);
});

test('de tegenstander alsnog aanvullen werkt de rij bij, maar meldt niets', async () => {
  // Tot 0.30.1 bleef de tegenstander bij elke thuiswedstrijd leeg. De eerste
  // sync daarna mag de begeleiding geen bericht per thuiswedstrijd sturen.
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander,
                             locatie_tekst, vbl_acc_guid, wijzigingshash)
    VALUES ('W9', '${T1}', '2026-27', '2026-11-14', '14:00', 1, NULL, 'Sporthal A', 'ACC1',
            '2026-11-14|14:00|Sporthal A||1');
  `);
  const uit = await sync(db, (guid) => (guid === T1 ? [ONDERLING] : []));
  const ploeg = uit.ploegen.find((p) => p.ploeg === T1);
  assert.equal(ploeg.gewijzigd.length, 1);
  assert.equal(ploeg.gewijzigd[0].meldbaar, false);
  assert.equal(db._sqlite.prepare(`SELECT tegenstander FROM wedstrijden WHERE team_guid = ?`).get(T1).tegenstander, 'ROL B');
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM logboek WHERE wat LIKE 'wedstrijd gewijzigd%'`).get().n, 0);
});

test('wijzigt er iets en komt de uitslag tegelijk binnen, dan staat ze er meteen', async () => {
  const db = zetKlaar();
  await sync(db, (guid) => (guid === T1 ? [ONDERLING] : []));
  const gespeeld = { ...ONDERLING, locatie_tekst: 'x', accNaam: 'Andere zaal', gespeeld: 'G', uitslag: ' 60- 55' };
  await sync(db, (guid) => (guid === T1 ? [gespeeld] : []));
  const rij = db._sqlite.prepare(`SELECT locatie_tekst, uitslag FROM wedstrijden WHERE team_guid = ?`).get(T1);
  assert.equal(rij.locatie_tekst, 'Andere zaal');
  assert.equal(rij.uitslag, '60- 55');
});
