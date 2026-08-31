// Het aanvragen van een aanmeldlink.
//
// Twee dingen worden hier bewaakt. Dat er niets vertrekt naar een adres dat
// niet bij de club hoort — anders is deze route een gratis mailmachine op ons
// quota. En dat het antwoord altijd hetzelfde is, want anders wordt ze een
// manier om uit te zoeken wie er lid is, met namen van minderjarigen erachter.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { aanmeldlink, vraagLinkAan, normaliseerEmail } from '../src/routes/aanmeldlink.js';

const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('p-jurgen', 'Jurgen', 'van Geijstelen', 'jurgen@example.org'),
      ('p-weg',    'Weg',    'Gegaan',         'weg@example.org');
    UPDATE personen SET actief = 0 WHERE id = 'p-weg';
  `);
  return db;
}

function verzoek(email) {
  return new Request('https://teamassist.example/api/aanmeldlink', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

function nepSupabase() {
  const opgeroepen = [];
  return {
    opgeroepen,
    fetcher: async (url, opties) => {
      opgeroepen.push({ url, opties });
      return new Response('{}', { status: 200 });
    },
  };
}

async function doe(db, email, fetcher) {
  const oudeFetch = globalThis.fetch;
  if (fetcher) globalThis.fetch = fetcher;
  try {
    const antwoord = await aanmeldlink({ db, env: ENV, request: verzoek(email) });
    return { status: antwoord.status, body: await antwoord.json() };
  } finally {
    globalThis.fetch = oudeFetch;
  }
}

test('een bekend adres krijgt een link', async () => {
  const db = zetKlaar();
  const nep = nepSupabase();
  const uit = await doe(db, 'jurgen@example.org', nep.fetcher);

  assert.equal(uit.status, 200);
  assert.equal(nep.opgeroepen.length, 1);
  assert.match(nep.opgeroepen[0].url, /\/auth\/v1\/otp\?redirect_to=/);
});

test('een onbekend adres levert geen enkele oproep op', async () => {
  const db = zetKlaar();
  const nep = nepSupabase();
  await doe(db, 'vreemde@example.org', nep.fetcher);
  assert.equal(nep.opgeroepen.length, 0, 'er hoort niets naar Supabase te gaan');
});

test('een adres van iemand op inactief levert niets op', async () => {
  const db = zetKlaar();
  const nep = nepSupabase();
  await doe(db, 'weg@example.org', nep.fetcher);
  assert.equal(nep.opgeroepen.length, 0);
});

test('het antwoord verklapt niet of het adres bekend is', async () => {
  // Dit is de kern: verschilt het antwoord, dan is de route te gebruiken om de
  // ledenlijst van de club af te tasten.
  const db = zetKlaar();
  const nep = nepSupabase();
  const bekend = await doe(db, 'jurgen@example.org', nep.fetcher);
  const onbekend = await doe(db, 'vreemde@example.org', nep.fetcher);
  const rommel = await doe(db, 'geen adres', nep.fetcher);

  assert.deepEqual(bekend, onbekend);
  assert.deepEqual(bekend, rommel);
});

test('een tweede aanvraag binnen de minuut stuurt niets extra', async () => {
  const db = zetKlaar();
  const nep = nepSupabase();
  await doe(db, 'jurgen@example.org', nep.fetcher);
  await doe(db, 'jurgen@example.org', nep.fetcher);
  assert.equal(nep.opgeroepen.length, 1, 'de tweede link zou de eerste ongeldig maken');
});

test('na de wachttijd kan er opnieuw een link gevraagd worden', async () => {
  const db = zetKlaar();
  const nep = nepSupabase();
  await doe(db, 'jurgen@example.org', nep.fetcher);
  db._sqlite.exec(
    `UPDATE personen SET laatste_aanmeldlink = datetime('now', '-5 minutes') WHERE id = 'p-jurgen'`
  );
  await doe(db, 'jurgen@example.org', nep.fetcher);
  assert.equal(nep.opgeroepen.length, 2);
});

test('het adres van een onbekende aanvrager komt niet in het logboek', async () => {
  // Bijhouden wie er allemaal een link probeerde, zou gegevens bewaren van
  // mensen die niets met de club te maken hebben.
  const db = zetKlaar();
  await doe(db, 'vreemde@example.org', nepSupabase().fetcher);
  const regels = db._sqlite.prepare(`SELECT * FROM logboek`).all();
  assert.equal(regels.length, 1);
  assert.ok(!JSON.stringify(regels).includes('vreemde@example.org'));
});

test('een storing bij Supabase blijft binnen en komt in het logboek', async () => {
  const db = zetKlaar();
  const stuk = async () => new Response('nee', { status: 500 });
  const uit = await doe(db, 'jurgen@example.org', stuk);

  assert.equal(uit.status, 200, 'naar buiten blijft het antwoord gelijk');
  const regel = db._sqlite.prepare(`SELECT * FROM logboek ORDER BY id DESC LIMIT 1`).get();
  assert.match(regel.wat, /niet verstuurd/);
  assert.equal(regel.afgehandeld, 0, 'dit hoort opvolging te vragen');
});

test('een mislukte poging blokkeert een nieuwe aanvraag niet', async () => {
  const db = zetKlaar();
  const stuk = async () => new Response('nee', { status: 500 });
  await doe(db, 'jurgen@example.org', stuk);
  const nep = nepSupabase();
  await doe(db, 'jurgen@example.org', nep.fetcher);
  assert.equal(nep.opgeroepen.length, 1, 'de wachttijd geldt enkel na een verstuurde link');
});

test('hoofdletters en spaties in het adres maken niet uit', async () => {
  const db = zetKlaar();
  const nep = nepSupabase();
  await doe(db, '  Jurgen@Example.ORG ', nep.fetcher);
  assert.equal(nep.opgeroepen.length, 1);
  assert.equal(normaliseerEmail('  A@B.C '), 'a@b.c');
});

test('de sleutel gaat enkel in de apikey-kop mee', async () => {
  const nep = nepSupabase();
  await vraagLinkAan(ENV, 'a@b.c', 'https://teamassist.example', nep.fetcher);
  const koppen = nep.opgeroepen[0].opties.headers;
  assert.equal(koppen.apikey, 'sb_publishable_test');
  assert.equal(koppen.authorization, undefined);
});

test('redirect_to wijst naar de app zelf, niet naar de Site URL van Supabase', async () => {
  const nep = nepSupabase();
  await vraagLinkAan(ENV, 'a@b.c', 'https://teamassist.example', nep.fetcher);
  assert.ok(
    nep.opgeroepen[0].url.endsWith(encodeURIComponent('https://teamassist.example')),
    'zonder deze parameter komt de link uit op localhost'
  );
  assert.ok(!nep.opgeroepen[0].opties.body.includes('redirect'), 'in de body wordt het genegeerd');
});
