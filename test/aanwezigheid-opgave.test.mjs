// Aanwezigheid opgeven: door een speler zelf, of door een ouder namens zijn
// kind.
//
// Het zwaartepunt: iemand mag nooit namens een ander invullen zonder een
// echte ouder_kind-koppeling, en een uitgesloten speler kan zichzelf niet
// terugzetten — ook niet via deze route, niet enkel via de regelmodule.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { opgaveZetten, mijnOpgaven } from '../src/routes/aanwezigheid-opgave.js';

const T1 = 'BVBL1125J16  2';

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam) VALUES ('${T1}', '2026-27', 'J16 B');
    INSERT INTO personen (id, voornaam, achternaam) VALUES
      ('p-speler', 'Dries', 'van Geijstelen'),
      ('p-ouder', 'Ouder', 'van Dries'),
      ('p-vreemde', 'Iemand', 'Anders');
    INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES ('p-speler', '${T1}', '2026-27');
    INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('p-ouder', 'p-speler');
    INSERT INTO trainingen (team_guid, seizoen, datum, begin, einde, locatie_tekst)
         VALUES ('${T1}', '2026-27', '2099-01-01', '18:30', '20:00', 'Sporthal A');
  `);
  return db;
}

function verzoek(body) {
  return new Request('https://x/api/aanwezigheid/opgave', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function zetOp(db, aanroeperId, body) {
  const res = await opgaveZetten({ db, persoon: { id: aanroeperId }, request: verzoek(body) });
  return { status: res.status, body: await res.json() };
}

test('een speler kan voor zichzelf opgeven', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  const uit = await zetOp(db, 'p-speler', { soort: 'training', activiteit_id: training.id, status: 'aanwezig' });
  assert.equal(uit.status, 200);
  const rij = db._sqlite.prepare(`SELECT * FROM aanwezigheden`).get();
  assert.equal(rij.opgave_status, 'aanwezig');
  assert.equal(rij.hoedanigheid, 'SPELER');
  assert.equal(rij.opgave_door, 'p-speler');
});

test('een ouder kan namens zijn kind opgeven', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  const uit = await zetOp(db, 'p-ouder', {
    soort: 'training', activiteit_id: training.id, persoon_id: 'p-speler', status: 'afwezig', reden: 'ziek',
  });
  assert.equal(uit.status, 200);
  const rij = db._sqlite.prepare(`SELECT * FROM aanwezigheden`).get();
  assert.equal(rij.hoedanigheid, 'OUVO');
  assert.equal(rij.opgave_door, 'p-ouder', 'wie het invulde, niet wie het over gaat');
  assert.equal(rij.persoon_id, 'p-speler');
});

test('iemand zonder ouder_kind-koppeling mag niet namens een ander invullen', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  const uit = await zetOp(db, 'p-vreemde', {
    soort: 'training', activiteit_id: training.id, persoon_id: 'p-speler', status: 'aanwezig',
  });
  assert.equal(uit.status, 403);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM aanwezigheden`).get().n;
  assert.equal(aantal, 0);
});

test('een persoon die niet in het team speelt, kan niet opgeven', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  const uit = await zetOp(db, 'p-vreemde', { soort: 'training', activiteit_id: training.id, status: 'aanwezig' });
  assert.equal(uit.status, 403);
  assert.match(uit.body.fout, /speelt niet/);
});

test('afwezig zonder reden wordt geweigerd', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  const uit = await zetOp(db, 'p-speler', { soort: 'training', activiteit_id: training.id, status: 'afwezig' });
  assert.equal(uit.status, 400);
});

test('opnieuw opgeven werkt de bestaande rij bij in plaats van een tweede aan te maken', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  await zetOp(db, 'p-speler', { soort: 'training', activiteit_id: training.id, status: 'aanwezig' });
  await zetOp(db, 'p-speler', { soort: 'training', activiteit_id: training.id, status: 'afwezig', reden: 'ziek' });
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM aanwezigheden`).get().n;
  assert.equal(aantal, 1);
  const rij = db._sqlite.prepare(`SELECT opgave_status FROM aanwezigheden`).get();
  assert.equal(rij.opgave_status, 'afwezig');
});

test('een uitgesloten speler kan zichzelf niet meer op aanwezig zetten', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  db._sqlite.exec(`
    INSERT INTO aanwezigheden (soort, activiteit_id, team_guid, seizoen, persoon_id, hoedanigheid,
                               uitgesloten, uitgesloten_reden, uitgesloten_door, uitgesloten_tijdstip)
         VALUES ('training', ${training.id}, '${T1}', '2026-27', 'p-speler', 'SPELER',
                 1, 'disciplinair', 'p-coach', datetime('now'));
  `);
  const uit = await zetOp(db, 'p-speler', { soort: 'training', activiteit_id: training.id, status: 'aanwezig' });
  assert.equal(uit.status, 403);
  assert.match(uit.body.fout, /uitgesloten/);
});

test('na de opgavetermijn wordt de opgave geweigerd', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO trainingen (team_guid, seizoen, datum, begin, einde, locatie_tekst)
         VALUES ('${T1}', '2026-27', '2020-01-01', '18:30', '20:00', 'Sporthal A');
  `);
  const oudeTraining = db._sqlite.prepare(`SELECT id FROM trainingen WHERE datum = '2020-01-01'`).get();
  const uit = await zetOp(db, 'p-speler', { soort: 'training', activiteit_id: oudeTraining.id, status: 'aanwezig' });
  assert.equal(uit.status, 403);
  assert.match(uit.body.fout, /termijn/);
});

test('staat opgeven uit voor de ploeg, dan wordt elke opgave geweigerd', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`UPDATE teams SET opgave_toegelaten_training = 0 WHERE guid = '${T1}'`);
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  const uit = await zetOp(db, 'p-speler', { soort: 'training', activiteit_id: training.id, status: 'aanwezig' });
  assert.equal(uit.status, 403);
  assert.match(uit.body.fout, /staat uit/);
});

test('een onbestaande activiteit geeft 404', async () => {
  const db = zetKlaar();
  const uit = await zetOp(db, 'p-speler', { soort: 'training', activiteit_id: 9999, status: 'aanwezig' });
  assert.equal(uit.status, 404);
});

test('mijnOpgaven toont de eigen trainingen en die van een kind', async () => {
  const db = zetKlaar();
  const res = await mijnOpgaven({
    db, persoon: { id: 'p-ouder' }, seizoen: { code: '2026-27', naam: '2026-2027' },
  });
  const body = await res.json();
  assert.equal(body.activiteiten.length, 1);
  assert.equal(body.activiteiten[0].voor_persoon_id, 'p-speler');
  assert.equal(body.activiteiten[0].opgave_status, null, 'nog geen opgave gedaan');
});

test('mijnOpgaven geeft de naam van voor wie de activiteit is', async () => {
  const db = zetKlaar();
  const res = await mijnOpgaven({
    db, persoon: { id: 'p-ouder' }, seizoen: { code: '2026-27', naam: '2026-2027' },
  });
  const body = await res.json();
  assert.equal(body.activiteiten[0].voor_voornaam, 'Dries');
});

test('twee kinderen in dezelfde ploeg krijgen elk hun eigen rij, niet één gedeelde', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p-speler2', 'Otto', 'Muñiz');
    INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES ('p-speler2', '${T1}', '2026-27');
    INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('p-ouder', 'p-speler2');
  `);
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  await zetOp(db, 'p-speler', { soort: 'training', activiteit_id: training.id, status: 'aanwezig' });
  // p-speler2 geeft niets op — zijn rij hoort dus opgave_status: null te tonen,
  // ook al zit hij in dezelfde ploeg en dezelfde training als p-speler.

  const res = await mijnOpgaven({
    db, persoon: { id: 'p-ouder' }, seizoen: { code: '2026-27', naam: '2026-2027' },
  });
  const body = await res.json();
  assert.equal(body.activiteiten.length, 2, 'één rij per kind, niet één gedeelde rij');

  const vanSpeler1 = body.activiteiten.find((a) => a.voor_persoon_id === 'p-speler');
  const vanSpeler2 = body.activiteiten.find((a) => a.voor_persoon_id === 'p-speler2');
  assert.equal(vanSpeler1.opgave_status, 'aanwezig');
  assert.equal(vanSpeler2.opgave_status, null, "p-speler2's eigen (lege) opgave, niet die van zijn ploeggenoot");
});

test('mijnOpgaven toont ook wedstrijden, niet enkel trainingen', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis)
         VALUES ('W1', '${T1}', '2026-27', '2099-01-02', '10:30', 1);
  `);
  const res = await mijnOpgaven({
    db, persoon: { id: 'p-speler' }, seizoen: { code: '2026-27', naam: '2026-2027' },
  });
  const body = await res.json();
  assert.ok(body.activiteiten.some((a) => a.soort === 'wedstrijd'));
});

test('elke opgave komt in het logboek', async () => {
  const db = zetKlaar();
  const training = db._sqlite.prepare(`SELECT id FROM trainingen`).get();
  await zetOp(db, 'p-speler', { soort: 'training', activiteit_id: training.id, status: 'aanwezig' });
  const regel = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.match(regel.wat, /aanwezigheid opgegeven/);
});
