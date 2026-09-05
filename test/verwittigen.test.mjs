// De enige plaats die een bericht echt naar buiten stuurt.
//
// Het zwaartepunt: elk van de drie modi doet precies wat hij moet doen, geen
// meer. 'uit' bouwt en logt maar verstuurt nooit. 'omleiden' verstuurt echt,
// maar nooit naar de echte persoon, en komt daarom nooit in `berichten`
// terecht. 'normaal' is de enige modus die 'berichten' vult.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { verwittig } from '../src/lib/verwittigen.js';

function zetKlaar(modus = 'normaal') {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p1', 'Anna', 'Peeters', 'anna@example.org');
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p-zonder-mail', 'Geen', 'Mail');
    UPDATE instellingen SET waarde = '${modus}' WHERE sleutel = 'bericht_modus';
  `);
  return db;
}

const bericht = (over = {}) => ({
  persoon_id: 'p1',
  onderwerp: 'Wedstrijd verplaatst',
  inhoud: 'Je wedstrijd van zaterdag is verplaatst naar zondag.',
  ...over,
});

function mockFetch(status = 200) {
  return async () => new Response(JSON.stringify({ id: 'msg-1' }), { status });
}

test('modus uit: er wordt niets verstuurd, wel volledig gelogd', async () => {
  const db = zetKlaar('uit');
  let gefetched = false;
  const env = { RESEND_API_KEY: 'x' };
  globalThis.fetch = async () => { gefetched = true; return new Response('{}', { status: 200 }); };
  try {
    const uit = await verwittig({ db, env }, bericht());
    assert.equal(uit.verstuurd, false);
    assert.equal(gefetched, false, 'Resend mag in modus uit nooit aangeroepen worden');
  } finally {
    delete globalThis.fetch;
  }

  const aantalBerichten = db._sqlite.prepare(`SELECT count(*) AS n FROM berichten`).get().n;
  assert.equal(aantalBerichten, 0);

  const regel = db._sqlite.prepare(`SELECT * FROM logboek WHERE wat LIKE '%modus uit%'`).get();
  assert.ok(regel, 'wel gelogd, zodat zichtbaar is wat er verstuurd zou zijn');
  assert.match(regel.details, /Wedstrijd verplaatst/);
});

test('modus omleiden: verstuurt echt, maar nooit naar de echte persoon', async () => {
  const db = zetKlaar('omleiden');
  db._sqlite.exec(`UPDATE instellingen SET waarde = 'test@voorbeeld.org' WHERE sleutel = 'bericht_omleidadres'`);

  let bestemming;
  globalThis.fetch = async (url, opties) => {
    bestemming = JSON.parse(opties.body).to;
    return new Response('{}', { status: 200 });
  };
  try {
    const uit = await verwittig({ db, env: { RESEND_API_KEY: 'x' } }, bericht());
    assert.equal(uit.verstuurd, true);
    assert.equal(bestemming, 'test@voorbeeld.org', 'nooit naar anna@example.org, ook al is dat de echte ontvanger');
  } finally {
    delete globalThis.fetch;
  }

  const aantalBerichten = db._sqlite.prepare(`SELECT count(*) AS n FROM berichten`).get().n;
  assert.equal(aantalBerichten, 0, "'Mijn berichten' zou anders iets tonen dat anna nooit ontving");
});

test('omleiden zonder ingevuld omleidadres verstuurt niets en meldt de fout', async () => {
  const db = zetKlaar('omleiden'); // bericht_omleidadres blijft leeg
  let gefetched = false;
  globalThis.fetch = async () => { gefetched = true; return new Response('{}', { status: 200 }); };
  try {
    const uit = await verwittig({ db, env: { RESEND_API_KEY: 'x' } }, bericht());
    assert.equal(uit.verstuurd, false);
    assert.equal(gefetched, false);
  } finally {
    delete globalThis.fetch;
  }
  const regel = db._sqlite.prepare(`SELECT * FROM logboek WHERE soort = 'fout'`).get();
  assert.match(regel.wat, /omleidadres/);
});

test('modus normaal: verstuurt naar de echte persoon en bewaart in berichten', async () => {
  const db = zetKlaar('normaal');
  let bestemming;
  globalThis.fetch = async (url, opties) => {
    bestemming = JSON.parse(opties.body).to;
    return new Response('{}', { status: 200 });
  };
  try {
    const uit = await verwittig({ db, env: { RESEND_API_KEY: 'x' } }, bericht());
    assert.equal(uit.verstuurd, true);
    assert.equal(bestemming, 'anna@example.org');
  } finally {
    delete globalThis.fetch;
  }

  const rij = db._sqlite.prepare(`SELECT * FROM berichten WHERE persoon_id = 'p1'`).get();
  assert.ok(rij, 'enkel in modus normaal komt het bericht in de persoonlijke lijst');
  assert.equal(rij.onderwerp, 'Wedstrijd verplaatst');
});

test('modus normaal, maar Resend geeft een fout: geen rij in berichten, wel in het logboek', async () => {
  const db = zetKlaar('normaal');
  globalThis.fetch = async () => new Response('serverfout', { status: 500 });
  try {
    const uit = await verwittig({ db, env: { RESEND_API_KEY: 'x' } }, bericht());
    assert.equal(uit.verstuurd, false);
  } finally {
    delete globalThis.fetch;
  }
  const aantalBerichten = db._sqlite.prepare(`SELECT count(*) AS n FROM berichten`).get().n;
  assert.equal(aantalBerichten, 0);
  const regel = db._sqlite.prepare(`SELECT * FROM logboek WHERE soort = 'fout'`).get();
  assert.match(regel.wat, /mislukt/);
});

test('een persoon zonder e-mailadres krijgt nooit een verzendpoging', async () => {
  const db = zetKlaar('normaal');
  let gefetched = false;
  globalThis.fetch = async () => { gefetched = true; return new Response('{}', { status: 200 }); };
  try {
    const uit = await verwittig({ db, env: { RESEND_API_KEY: 'x' } }, bericht({ persoon_id: 'p-zonder-mail' }));
    assert.equal(uit.verstuurd, false);
    assert.equal(gefetched, false);
  } finally {
    delete globalThis.fetch;
  }
  const regel = db._sqlite.prepare(`SELECT * FROM logboek WHERE soort = 'fout'`).get();
  assert.match(regel.wat, /geen e-mailadres/);
});

test('een onbekend kanaal wordt geweigerd in plaats van stilzwijgend als mail behandeld', async () => {
  const db = zetKlaar('normaal');
  await assert.rejects(
    () => verwittig({ db, env: { RESEND_API_KEY: 'x' } }, bericht({ kanaal: 'push' })),
    /push/
  );
});

test('geen bericht_modus-instelling valt terug op omleiden, niet op normaal', async () => {
  const db = maakDb();
  db._sqlite.exec(`
    DELETE FROM instellingen WHERE sleutel = 'bericht_modus';
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p1', 'Anna', 'Peeters', 'anna@example.org');
    UPDATE instellingen SET waarde = 'test@voorbeeld.org' WHERE sleutel = 'bericht_omleidadres';
  `);
  let bestemming;
  globalThis.fetch = async (url, opties) => {
    bestemming = JSON.parse(opties.body).to;
    return new Response('{}', { status: 200 });
  };
  try {
    await verwittig({ db, env: { RESEND_API_KEY: 'x' } }, bericht());
  } finally {
    delete globalThis.fetch;
  }
  assert.equal(bestemming, 'test@voorbeeld.org', 'de veilige standaard, niet rechtstreeks naar een echt adres');
});
