// De opruimlogica (T15): vier bewaartermijnen, en het definitief verwijderen
// van een inactieve persoon.
//
// Het zwaartepunt: een afgehandelde logboekregel verdwijnt na 365 dagen, maar
// een onafgehandelde (afgehandeld = 0) nooit, hoe oud ook. En bij het
// verwijderen van een persoon verdwijnt niet zomaar alles — team_spelers,
// rollen, ouder_kind, wedstrijdselecties, accounts en berichten gaan volledig
// mee weg, maar aanwezigheden blijft bestaan met de identiteit losgekoppeld.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { kuisLogboekOp, kuisTaakRunsOp, kuisBerichtenOp, verwijderInactievePersonenOp } from '../src/lib/opkuis.js';

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam) VALUES ('T1', '2026-27', 'J16 B');
    INSERT INTO trainingen (team_guid, seizoen, datum, begin, einde) VALUES ('T1', '2026-27', '2026-09-10', '18:00', '19:00');
  `);
  return db;
}

function dagenGeleden(n) {
  return `datetime('now', '-${n} days')`;
}

// --- logboek --------------------------------------------------------------

test('een afgehandelde logboekregel ouder dan 365 dagen wordt verwijderd', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO logboek (tijdstip, soort, wat, afgehandeld) VALUES (${dagenGeleden(366)}, 'beheer', 'oud', 1);
  `);
  const aantal = await kuisLogboekOp(db);
  assert.equal(aantal, 1);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM logboek`).get().n, 0);
});

test('een afgehandelde logboekregel jonger dan 365 dagen blijft staan', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO logboek (tijdstip, soort, wat, afgehandeld) VALUES (${dagenGeleden(364)}, 'beheer', 'recent', 1);
  `);
  await kuisLogboekOp(db);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM logboek`).get().n, 1);
});

test('een onafgehandelde logboekregel verdwijnt nooit, ook niet na jaren', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO logboek (tijdstip, soort, wat, afgehandeld) VALUES (${dagenGeleden(3000)}, 'fout', 'nog steeds open', 0);
  `);
  await kuisLogboekOp(db);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM logboek`).get().n, 1, 'afgehandeld = 0 is heilig, ongeacht leeftijd');
});

// --- taak_runs --------------------------------------------------------------

test('taak_runs ouder dan 30 dagen wordt verwijderd, jonger blijft staan', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO taak_runs (taak, geeindigd, status) VALUES ('wedstrijden-sync', ${dagenGeleden(31)}, 'ok');
    INSERT INTO taak_runs (taak, geeindigd, status) VALUES ('wedstrijden-sync', ${dagenGeleden(29)}, 'ok');
  `);
  const aantal = await kuisTaakRunsOp(db);
  assert.equal(aantal, 1);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM taak_runs`).get().n, 1);
});

test('de laatste geslaagde run van een taak blijft staan, hoe oud ook', async () => {
  // Zo bleek in oktober 2026 niet meer na te gaan wanneer de supabase-ping
  // voor het laatst lukte: alles van vóór de maand mislukkingen was gewist.
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO taak_runs (taak, geeindigd, status) VALUES ('supabase-ping', ${dagenGeleden(60)}, 'ok');
    INSERT INTO taak_runs (taak, geeindigd, status, melding) VALUES ('supabase-ping', ${dagenGeleden(59)}, 'ok', 'laatste ok');
    INSERT INTO taak_runs (taak, geeindigd, status) VALUES ('supabase-ping', ${dagenGeleden(40)}, 'fout');
    INSERT INTO taak_runs (taak, geeindigd, status) VALUES ('supabase-ping', ${dagenGeleden(1)}, 'fout');
    INSERT INTO taak_runs (taak, geeindigd, status) VALUES ('teams-sync', ${dagenGeleden(45)}, 'ok');
  `);
  const aantal = await kuisTaakRunsOp(db);
  assert.equal(aantal, 2, 'enkel de oudere ok en de oude fout van de ping');
  const over = db._sqlite.prepare(`SELECT taak, status, melding FROM taak_runs ORDER BY id`).all().map((r) => ({ ...r }));
  assert.deepEqual(over, [
    { taak: 'supabase-ping', status: 'ok', melding: 'laatste ok' },
    { taak: 'supabase-ping', status: 'fout', melding: null },
    { taak: 'teams-sync', status: 'ok', melding: null },
  ]);
});

// --- berichten --------------------------------------------------------------

test('berichten ouder dan 120 dagen wordt verwijderd, jonger blijft staan', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p1', 'Anna', 'Peeters', 'a@b.c');
    INSERT INTO berichten (persoon_id, kanaal, onderwerp, verzonden) VALUES ('p1', 'mail', 'oud', ${dagenGeleden(121)});
    INSERT INTO berichten (persoon_id, kanaal, onderwerp, verzonden) VALUES ('p1', 'mail', 'recent', ${dagenGeleden(119)});
  `);
  const aantal = await kuisBerichtenOp(db);
  assert.equal(aantal, 1);
  assert.equal(db._sqlite.prepare(`SELECT onderwerp FROM berichten`).get().onderwerp, 'recent');
});

// --- verwijderInactievePersonenOp -----------------------------------------

function persoonKlaarVoorVerwijdering(db, id = 'p1') {
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, email, actief, inactief_sinds)
         VALUES ('${id}', 'Anna', 'Peeters', 'a@b.c', 0, ${dagenGeleden(181)});
  `);
}

test('een persoon die 180 dagen of langer inactief is, wordt verwijderd', async () => {
  const db = zetKlaar();
  persoonKlaarVoorVerwijdering(db);
  const aantal = await verwijderInactievePersonenOp(db);
  assert.equal(aantal, 1);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM personen WHERE id = 'p1'`).get().n, 0);
});

test('een persoon die nog geen 180 dagen inactief is, blijft staan', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, email, actief, inactief_sinds)
         VALUES ('p1', 'Anna', 'Peeters', 'a@b.c', 0, ${dagenGeleden(179)});
  `);
  const aantal = await verwijderInactievePersonenOp(db);
  assert.equal(aantal, 0);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM personen WHERE id = 'p1'`).get().n, 1);
});

test('een actieve persoon wordt nooit verwijderd, ongeacht inactief_sinds', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, email, actief, inactief_sinds)
         VALUES ('p1', 'Anna', 'Peeters', 'a@b.c', 1, ${dagenGeleden(9000)});
  `);
  await verwijderInactievePersonenOp(db);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM personen WHERE id = 'p1'`).get().n, 1);
});

test('accounts, team_spelers, rollen, ouder_kind en wedstrijdselecties gaan volledig mee weg', async () => {
  const db = zetKlaar();
  persoonKlaarVoorVerwijdering(db);
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('kind1', 'Bo', 'Peeters', 'b@c.d');
    INSERT INTO accounts (sub, persoon_id, email) VALUES ('sub-1', 'p1', 'a@b.c');
    INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES ('p1', 'T1', '2026-27');
    INSERT INTO rollen (persoon_id, rol, team_guid, seizoen) VALUES ('p1', 'COACH', 'T1', '2026-27');
    INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('p1', 'kind1');
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis) VALUES ('W1', 'T1', '2026-27', '2026-09-12', '10:30', 1);
    INSERT INTO wedstrijdselecties (wedstrijd_id, persoon_id) VALUES (1, 'p1');
  `);

  await verwijderInactievePersonenOp(db);

  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM accounts WHERE persoon_id = 'p1'`).get().n, 0);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM team_spelers WHERE persoon_id = 'p1'`).get().n, 0);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM rollen WHERE persoon_id = 'p1'`).get().n, 0);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM ouder_kind WHERE ouder_id = 'p1'`).get().n, 0);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM wedstrijdselecties WHERE persoon_id = 'p1'`).get().n, 0);
});

test('ouder_kind gaat ook weg wanneer de verwijderde persoon het kind is, niet enkel als ouder', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('ouder1', 'Ida', 'Peeters', 'i@j.k')`);
  persoonKlaarVoorVerwijdering(db, 'p1'); // p1 is hier het kind
  db._sqlite.exec(`INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('ouder1', 'p1')`);

  await verwijderInactievePersonenOp(db);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM ouder_kind WHERE kind_id = 'p1'`).get().n, 0);
});

test('berichten van de verwijderde persoon gaat volledig mee weg', async () => {
  const db = zetKlaar();
  persoonKlaarVoorVerwijdering(db);
  db._sqlite.exec(`INSERT INTO berichten (persoon_id, kanaal, onderwerp) VALUES ('p1', 'mail', 'test')`);
  await verwijderInactievePersonenOp(db);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM berichten WHERE persoon_id = 'p1'`).get().n, 0);
});

test('aanwezigheden blijft bestaan, met persoon_id losgekoppeld', async () => {
  const db = zetKlaar();
  persoonKlaarVoorVerwijdering(db);
  db._sqlite.exec(`
    INSERT INTO aanwezigheden (soort, activiteit_id, team_guid, seizoen, persoon_id, hoedanigheid)
         VALUES ('training', 1, 'T1', '2026-27', 'p1', 'SPELER');
  `);
  await verwijderInactievePersonenOp(db);

  const rij = db._sqlite.prepare(`SELECT * FROM aanwezigheden`).get();
  assert.ok(rij, 'de rij zelf blijft bestaan, voor clubstatistieken');
  assert.equal(rij.persoon_id, null);
  assert.equal(rij.team_guid, 'T1', 'de rest van de rij blijft ongewijzigd');
});

test('opgave_door, uitgesloten_door en vaststelling_door worden ook losgekoppeld, ook op andermans rij', async () => {
  const db = zetKlaar();
  persoonKlaarVoorVerwijdering(db); // p1: de verwijderde persoon
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p2', 'Bo', 'Jansen', 'b@c.d');
    INSERT INTO aanwezigheden (soort, activiteit_id, team_guid, seizoen, persoon_id, hoedanigheid,
                               opgave_door, uitgesloten_reden, uitgesloten_door, vaststelling_door)
         VALUES ('training', 1, 'T1', '2026-27', 'p2', 'SPELER', 'p1', 'ziek', 'p1', 'p1');
  `);
  await verwijderInactievePersonenOp(db);

  const rij = db._sqlite.prepare(`SELECT * FROM aanwezigheden`).get();
  assert.equal(rij.persoon_id, 'p2', 'p2 zelf is niet verwijderd, blijft dus gewoon staan');
  assert.equal(rij.opgave_door, null, 'p1 stond hier enkel als opgave_door, niet als persoon_id');
  assert.equal(rij.uitgesloten_door, null);
  assert.equal(rij.vaststelling_door, null);
});

test('twee anonieme aanwezigheidsrijen voor dezelfde activiteit botsen niet met de unieke index', async () => {
  const db = zetKlaar();
  persoonKlaarVoorVerwijdering(db, 'p1');
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, email, actief, inactief_sinds)
         VALUES ('p2', 'Bo', 'Jansen', 'b@c.d', 0, ${dagenGeleden(181)});
    INSERT INTO aanwezigheden (soort, activiteit_id, team_guid, seizoen, persoon_id, hoedanigheid)
         VALUES ('training', 1, 'T1', '2026-27', 'p1', 'SPELER');
    INSERT INTO aanwezigheden (soort, activiteit_id, team_guid, seizoen, persoon_id, hoedanigheid)
         VALUES ('training', 1, 'T1', '2026-27', 'p2', 'SPELER');
  `);
  await verwijderInactievePersonenOp(db); // verwijdert zowel p1 als p2
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM aanwezigheden WHERE persoon_id IS NULL`).get().n;
  assert.equal(aantal, 2, 'beide rijen blijven bestaan, geen conflict met de unieke index');
});

test('logboek.wie wordt bewust niet losgekoppeld — een verantwoordingsspoor blijft staan', async () => {
  const db = zetKlaar();
  persoonKlaarVoorVerwijdering(db);
  db._sqlite.exec(`INSERT INTO logboek (soort, wie, wat, afgehandeld) VALUES ('beheer', 'p1', 'iets gedaan', 1)`);
  await verwijderInactievePersonenOp(db);
  const rij = db._sqlite.prepare(`SELECT wie FROM logboek`).get();
  assert.equal(rij.wie, 'p1', 'blijft verwijzen naar wie het deed, ook al bestaat die persoon niet meer');
});

test('wie een mededeling wegklikte, kan toch verwijderd worden (0.28.0)', async () => {
  const db = zetKlaar();
  persoonKlaarVoorVerwijdering(db);
  db._sqlite.exec(`
    INSERT INTO mededelingen (id, tekst, geldig_tot, gezet_door) VALUES (1, 'Nieuws', '2099-01-01T00:00:00.000Z', 'p1');
    INSERT INTO mededeling_gezien (mededeling_id, persoon_id) VALUES (1, 'p1');
  `);
  await verwijderInactievePersonenOp(db);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM mededeling_gezien WHERE persoon_id = 'p1'`).get().n, 0);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM personen WHERE id = 'p1'`).get().n, 0);
  // De mededeling zelf blijft: gezet_door is een verantwoordingsspoor, zoals logboek.wie.
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM mededelingen`).get().n, 1);
});

test('elke tabel met een foreign key naar personen wordt opgeruimd bij het verwijderen', async () => {
  // Structureel, zodat een nieuwe tabel niet stil vergeten wordt: zonder
  // opruiming blokkeert de foreign key het verwijderen van de persoon, en
  // blijft iemand die al lang weg is voor altijd in de databank.
  const { readFileSync } = await import('node:fs');
  const bron = readFileSync(new URL('../src/lib/opkuis.js', import.meta.url), 'utf8');
  const db = zetKlaar();
  const tabellen = db._sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => r.name)
    .filter((t) => t !== 'personen' &&
      db._sqlite.prepare(`PRAGMA foreign_key_list(${t})`).all().some((fk) => fk.table === 'personen'));
  assert.ok(tabellen.length > 5);
  for (const t of tabellen) {
    assert.match(bron, new RegExp(`(DELETE FROM|UPDATE) ${t}\\b`), `${t} ontbreekt in verwijderInactievePersonenOp`);
  }
});

test('wie een wedstrijdtaak had, kan verwijderd worden; de taak blijft, zonder persoon', async () => {
  const db = zetKlaar();
  persoonKlaarVoorVerwijdering(db);
  db._sqlite.exec(`
    INSERT INTO wedstrijden (id, wedstrijd_guid, team_guid, seizoen, datum, begin, thuis) VALUES (1, 'W1', 'T1', '2026-27', '2026-09-12', '10:30', 1);
    INSERT INTO wedstrijdtaken (wedstrijd_id, taak, persoon_id, toegewezen_door) VALUES (1, 'klok', 'p1', 'p1');
  `);
  await verwijderInactievePersonenOp(db);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM personen WHERE id = 'p1'`).get().n, 0);
  const taak = db._sqlite.prepare(`SELECT persoon_id, toegewezen_door FROM wedstrijdtaken`).get();
  assert.deepEqual({ ...taak }, { persoon_id: null, toegewezen_door: null });
});
