// De sjabloonroutes.
//
// Het zwaartepunt: exporteren geeft precies terug wat er staat, importeren
// wijzigt standaard niets, en een onbekende id maakt nooit een nieuwe speler
// aan — die verwerpen was gemakkelijk te toetsen in sjabloonplan.test.mjs,
// maar hier gaat het om wat er echt in de databank belandt.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { ROUTES } from '../src/index.js';
import { sjabloonExporteren, sjabloonImporteren } from '../src/routes/admin/sjabloon.js';
import { csvLezen } from '../src/lib/csv.js';

const T1 = 'BVBL1125J16  2';
const seizoen = { code: '2026-27', naam: '2026-2027' };
const beheerder = { id: 'p-admin' };

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam) VALUES ('${T1}', '2026-27', 'J16 B');
    INSERT INTO personen (id, voornaam, achternaam, naam_vbl, lid_nr, geboortedatum)
         VALUES ('p1', 'Dries', 'van Geijstelen Forier', 'Dries van Geijstelen Forier', '717331', '2010-03-17');
    INSERT INTO personen (id, voornaam, achternaam, lid_nr, geboortedatum)
         VALUES ('p2', 'Otto', 'Muñiz Espinoza', '730885', '2010-11-02');
    INSERT INTO team_spelers (persoon_id, team_guid, seizoen) VALUES
      ('p1', '${T1}', '2026-27'), ('p2', '${T1}', '2026-27');
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p-admin', 'Beheer', 'der');
  `);
  return db;
}

async function exporteer(db, team = T1) {
  const res = await sjabloonExporteren({
    db, seizoen, request: new Request(`https://x/api/admin/sjabloon?team=${encodeURIComponent(team)}`),
  });
  return { status: res.status, tekst: await res.text(), headers: res.headers };
}

async function importeer(db, csv, { team = T1, uitvoeren = false } = {}) {
  const vraag = new URLSearchParams({ team });
  if (uitvoeren) vraag.set('uitvoeren', '1');
  const res = await sjabloonImporteren({
    db, persoon: beheerder, seizoen,
    request: new Request(`https://x/api/admin/sjabloon?${vraag}`, { method: 'POST', body: csv }),
  });
  return { status: res.status, body: await res.json() };
}

test('de routes vragen personen.beheren', () => {
  for (const route of ROUTES.filter((r) => r.pad === '/api/admin/sjabloon')) {
    assert.equal(route.recht, 'personen.beheren');
    assert.notEqual(route.publiek, true);
  }
});

test('exporteren geeft een CSV met de juiste content-type', async () => {
  const db = zetKlaar();
  const uit = await exporteer(db);
  assert.equal(uit.status, 200);
  assert.match(uit.headers.get('content-type'), /text\/csv/);
  assert.match(uit.headers.get('content-disposition'), /attachment/);
});

test('de export bevat de spelers vooraf ingevuld, met een lege naam een verrassing zou zijn', async () => {
  const db = zetKlaar();
  const uit = await exporteer(db);
  const rijen = csvLezen(uit.tekst);
  assert.equal(rijen.length, 2);
  const dries = rijen.find((r) => r.voornaam === 'Dries');
  assert.equal(dries.lidnummer, '717331');
  assert.equal(dries.naam_bond, 'Dries van Geijstelen Forier');
  assert.equal(dries.geboortedatum, '2010-03-17');
  assert.equal(dries.email_speler, '', 'nog niet ingevuld, dus leeg');
});

test('exporteren voor een onbestaande ploeg geeft 404', async () => {
  const db = zetKlaar();
  const uit = await exporteer(db, 'BVBL9999ZZZ  1');
  assert.equal(uit.status, 404);
});

test('een droogloop bij het importeren schrijft niets weg', async () => {
  const db = zetKlaar();
  const uit = await exporteer(db);
  const rijen = csvLezen(uit.tekst);
  rijen[0].email_speler = 'dries@example.org';
  const csv = uit.tekst.split('\r\n')[0] + '\r\n' +
    rijen.map((r) => Object.values(r).join(',')).join('\r\n');

  const importUit = await importeer(db, csv);
  assert.equal(importUit.body.droogloop, true);
  const rij = db._sqlite.prepare(`SELECT email FROM personen WHERE id = 'p1'`).get();
  assert.equal(rij.email, null);
});

test('rondtrip: exporteren, een veld wijzigen, importeren met uitvoeren', async () => {
  const db = zetKlaar();
  const uit = await exporteer(db);

  // De echte export gebruiken en er via csvLezen/aanpassen/opnieuw opbouwen
  // doorheen gaan zou de eigen CSV-module dubbel testen; hier volstaat een
  // simpele, met de hand opgebouwde CSV die de kolomvolgorde van de route
  // volgt.
  const csv =
    'id,lidnummer,naam_bond,voornaam,achternaam,geboortedatum,email_speler,email_ouder,tel_vast,tel_gsm,straat,nummer,bus,postcode,gemeente\r\n' +
    'p1,717331,Dries van Geijstelen Forier,Dries,van Geijstelen Forier,2010-03-17,dries@example.org,ouder@example.org,,0470123456,,,,,\r\n' +
    'p2,730885,Otto Muñiz Espinoza,Otto,Muñiz Espinoza,2010-11-02,,,,,,,,,\r\n';

  const droogloop = await importeer(db, csv);
  assert.equal(droogloop.body.spelerwijzigingen.length, 1);
  assert.equal(droogloop.body.nieuweOuderkoppelingen.length, 1);

  await importeer(db, csv, { uitvoeren: true });

  const dries = db._sqlite.prepare(`SELECT * FROM personen WHERE id = 'p1'`).get();
  assert.equal(dries.email, 'dries@example.org');
  assert.equal(dries.tel_gsm, '0470123456');

  const ouder = db._sqlite.prepare(`SELECT * FROM personen WHERE email = 'ouder@example.org'`).get();
  assert.ok(ouder, 'de ouder hoort aangemaakt te zijn');
  assert.equal(ouder.voornaam, '', 'de naam is onbekend en blijft leeg tot een beheerder ze invult');

  const koppeling = db._sqlite.prepare(`SELECT * FROM ouder_kind WHERE kind_id = 'p1'`).get();
  assert.equal(koppeling.ouder_id, ouder.id);
});

test('een onbekende id maakt geen nieuwe speler aan, ook niet bij uitvoeren', async () => {
  const db = zetKlaar();
  const csv =
    'id,lidnummer,naam_bond,voornaam,achternaam,geboortedatum,email_speler,email_ouder,tel_vast,tel_gsm,straat,nummer,bus,postcode,gemeente\r\n' +
    'onbekend,999999,Iemand Anders,Iemand,Anders,2010-01-01,iemand@example.org,,,,,,,,\r\n';

  const uit = await importeer(db, csv, { uitvoeren: true });
  assert.equal(uit.body.rijfouten.length, 1);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM personen`).get().n;
  assert.equal(aantal, 3, 'enkel de drie personen die er al waren');
});

test('een tweede import op hetzelfde bestand maakt geen dubbele ouderkoppeling', async () => {
  const db = zetKlaar();
  const csv =
    'id,lidnummer,naam_bond,voornaam,achternaam,geboortedatum,email_speler,email_ouder,tel_vast,tel_gsm,straat,nummer,bus,postcode,gemeente\r\n' +
    'p1,717331,Dries van Geijstelen Forier,Dries,van Geijstelen Forier,2010-03-17,,ouder@example.org,,,,,,,\r\n';

  await importeer(db, csv, { uitvoeren: true });
  await importeer(db, csv, { uitvoeren: true });

  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM ouder_kind WHERE kind_id = 'p1'`).get().n;
  assert.equal(aantal, 1);
});

test('een koppeling die uit het bestand verdwijnt, wordt gesignaleerd maar niet verwijderd', async () => {
  const db = zetKlaar();
  const metOuder =
    'id,lidnummer,naam_bond,voornaam,achternaam,geboortedatum,email_speler,email_ouder,tel_vast,tel_gsm,straat,nummer,bus,postcode,gemeente\r\n' +
    'p1,717331,Dries van Geijstelen Forier,Dries,van Geijstelen Forier,2010-03-17,,ouder@example.org,,,,,,,\r\n';
  await importeer(db, metOuder, { uitvoeren: true });

  const zonderOuder = metOuder.replace('ouder@example.org', '');
  const uit = await importeer(db, zonderOuder, { uitvoeren: true });

  assert.equal(uit.body.overgeslagenOuders.length, 1);
  const koppeling = db._sqlite.prepare(`SELECT * FROM ouder_kind WHERE kind_id = 'p1'`).get();
  assert.ok(koppeling, 'de koppeling hoort te blijven bestaan');
});

test('importeren voor een onbestaande ploeg geeft 404', async () => {
  const db = zetKlaar();
  const uit = await importeer(db, 'id\r\n', { team: 'BVBL9999ZZZ  1' });
  assert.equal(uit.status, 404);
});

test('een leeg bestand geeft een duidelijke fout', async () => {
  const db = zetKlaar();
  const uit = await importeer(db, '   ');
  assert.equal(uit.status, 400);
});

test('elke uitvoering met resultaat komt in het logboek', async () => {
  const db = zetKlaar();
  const csv =
    'id,lidnummer,naam_bond,voornaam,achternaam,geboortedatum,email_speler,email_ouder,tel_vast,tel_gsm,straat,nummer,bus,postcode,gemeente\r\n' +
    'p1,717331,Dries van Geijstelen Forier,Dries,van Geijstelen Forier,2010-03-17,dries@example.org,,,,,,,,\r\n';
  await importeer(db, csv, { uitvoeren: true });
  const regel = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.match(regel.wat, /sjabloon ingelezen/);
  assert.equal(regel.wie, 'p-admin');
});
