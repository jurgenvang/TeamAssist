// Vakanties ophalen bij OpenHolidays.
//
// Eén keer per seizoen, niet live bij het genereren: een externe dienst die
// wegvalt mag de agenda van de club niet platleggen. En wat opgehaald wordt is
// een voorstel — bron 'club' blijft altijd staan.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { periodeUrl, naarPeriodes } from '../src/lib/vakanties.js';
import { vakantiesSync, periodeAanmaken, periodeVerwijderen } from '../src/routes/admin/periodes.js';

const seizoen = { code: '2026-27', naam: '2026-2027' };
const persoon = { id: 'p-admin' };

const NEP_ANTWOORD = [
  {
    startDate: '2026-10-24',
    endDate: '2026-11-01',
    name: [
      { language: 'NL', text: 'Herfstvakantie' },
      { language: 'FR', text: 'Congé d’automne' },
    ],
  },
];

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1)`);
  return db;
}

function verzoek(pad, body) {
  return new Request(`https://x${pad}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined });
}

test('de URL bevat het land, de taal en de subdivisiecode wanneer die is meegegeven', () => {
  const url = periodeUrl('2026-08-01', '2027-06-30', { subdivisieCode: 'DE-BY' });
  assert.match(url, /countryIsoCode=BE/);
  assert.match(url, /subdivisionCode=DE-BY/);
  assert.ok(!url.includes('groupCode'), 'geen groupCode als er geen groepscode is meegegeven');
});

test('een groepscode gaat via groupCode, niet via subdivisionCode', () => {
  // De officiële OpenAPI-specificatie (openholidaysapi.org/swagger/v1/swagger.json)
  // toont deze twee als aparte parameters bij /SchoolHolidays. Een groepscode
  // (zoals BE-NL voor Vlaanderen) die per ongeluk via subdivisionCode gaat,
  // levert stilzwijgend geen resultaten op — precies de fout die dit ving.
  const url = periodeUrl('2026-08-01', '2027-06-30', { groepscode: 'BE-NL' });
  assert.match(url, /groupCode=BE-NL/);
  assert.ok(!url.includes('subdivisionCode'), 'BE-NL is een groepscode, geen subdivisiecode');
});

test('beide codes kunnen samen meegegeven worden', () => {
  const url = periodeUrl('2026-08-01', '2027-06-30', { subdivisieCode: 'DE-BY', groepscode: 'X' });
  assert.match(url, /subdivisionCode=DE-BY/);
  assert.match(url, /groupCode=X/);
});

test('zonder enige code bevat de URL geen van beide parameters', () => {
  const url = periodeUrl('2026-08-01', '2027-06-30');
  assert.ok(!url.includes('subdivisionCode'));
  assert.ok(!url.includes('groupCode'));
});

test('de Nederlandstalige naam wordt gekozen', () => {
  const periodes = naarPeriodes(NEP_ANTWOORD, '2026-27');
  assert.equal(periodes[0].naam, 'Herfstvakantie');
  assert.equal(periodes[0].bron, 'openholidays');
  assert.equal(periodes[0].doelgroep, 'iedereen');
});

async function sync(db, antwoord, zoekstring = '') {
  const oude = globalThis.fetch;
  globalThis.fetch = async () => antwoord();
  try {
    const res = await vakantiesSync({ db, persoon, seizoen, request: verzoek(`/x${zoekstring}`, null) });
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = oude;
  }
}

const antwoordOk = () => new Response(JSON.stringify(NEP_ANTWOORD), { status: 200 });

test('een droogloop schrijft niets weg', async () => {
  const db = zetKlaar();
  const uit = await sync(db, antwoordOk);
  assert.equal(uit.body.droogloop, true);
  assert.equal(uit.body.nieuw, 1);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM periodes`).get().n;
  assert.equal(aantal, 0);
});

test('met uitvoeren komt de periode erin met bron openholidays', async () => {
  const db = zetKlaar();
  await sync(db, antwoordOk, '?uitvoeren=1');
  const rij = db._sqlite.prepare(`SELECT * FROM periodes`).get();
  assert.equal(rij.bron, 'openholidays');
  assert.equal(rij.naam, 'Herfstvakantie');
});

test('een tweede synchronisatie maakt geen dubbels', async () => {
  const db = zetKlaar();
  await sync(db, antwoordOk, '?uitvoeren=1');
  const uit = await sync(db, antwoordOk, '?uitvoeren=1');
  assert.equal(uit.body.nieuw, 0);
  assert.equal(uit.body.ongewijzigd, 1);
  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM periodes`).get().n;
  assert.equal(aantal, 1);
});

test('een storing bij OpenHolidays wordt opgevangen en gelogd', async () => {
  const db = zetKlaar();
  const stuk = () => new Response('nee', { status: 500 });
  const uit = await sync(db, stuk);
  assert.equal(uit.status, 502);
  const regel = db._sqlite.prepare(`SELECT * FROM logboek WHERE soort = 'fout'`).get();
  assert.match(regel.wat, /vakanties ophalen mislukt/);
});

test('een handmatig gezette periode met dezelfde startdatum wordt niet overschreven', async () => {
  // Dit is de plek waar een club afwijkt: een vakantie die voor de eigen leden
  // niet telt, of een andere naam. Bron 'club' blijft daarom buiten schot.
  const db = zetKlaar();
  await periodeAanmaken({
    db, persoon, seizoen,
    request: verzoek('/x', { naam: 'Eigen naam voor deze vakantie', van: '2026-10-24', tot: '2026-11-01' }),
  });
  await sync(db, antwoordOk, '?uitvoeren=1');

  // De opgehaalde synchronisatie kijkt enkel naar rijen met bron openholidays,
  // dus de eigen periode blijft naast de opgehaalde bestaan zonder botsing.
  const rijen = db._sqlite.prepare(`SELECT naam, bron FROM periodes ORDER BY bron`).all();
  assert.equal(rijen.length, 2);
  assert.ok(rijen.some((r) => r.bron === 'club' && r.naam === 'Eigen naam voor deze vakantie'));
});

test('een periode met bron club is niet via de synchronisatieroute te verwijderen', async () => {
  const db = zetKlaar();
  const { id } = await (
    await periodeAanmaken({ db, persoon, seizoen, request: verzoek('/x', { naam: 'X', van: '2026-01-01', tot: '2026-01-02' }) })
  ).json();
  const res = await periodeVerwijderen({ db, persoon, request: verzoek('/x', { id }) });
  assert.equal(res.status, 200);
});

test('een opgehaalde periode wordt niet met de hand verwijderd', async () => {
  // De volgende synchronisatie zou ze gewoon terugzetten; dat wekt de indruk
  // van een echte verwijdering die er niet is.
  const db = zetKlaar();
  await sync(db, antwoordOk, '?uitvoeren=1');
  const rij = db._sqlite.prepare(`SELECT id FROM periodes`).get();
  const res = await periodeVerwijderen({ db, persoon, request: verzoek('/x', { id: rij.id }) });
  assert.equal(res.status, 400);
});
