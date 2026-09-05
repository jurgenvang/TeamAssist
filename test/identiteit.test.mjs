// Tokenverificatie en de weg van een token naar een persoon.
//
// Dit is de buitenrand van de applicatie: alles wat hier doorglipt, staat
// binnen. De tests gebruiken een echt ondertekend HS256-token, zodat het niet
// bij een nagebootste verificatie blijft.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { verifieerToken, ontleedToken, tokenUitVerzoek } from '../src/lib/supabase.js';
import { identiteitVoor } from '../src/lib/identiteit.js';

const GEHEIM = 'geheim-voor-de-test-minstens-32-tekens-lang';
const ENV = { SUPABASE_JWT_SECRET: GEHEIM, SUPABASE_URL: 'https://project.supabase.co' };

function base64url(bytes) {
  const ruw = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(ruw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function maakToken(payload, geheim = GEHEIM) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const sleutel = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(geheim),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const hand = await crypto.subtle.sign(
    'HMAC',
    sleutel,
    new TextEncoder().encode(`${header}.${body}`)
  );
  return `${header}.${body}.${base64url(new Uint8Array(hand))}`;
}

const straks = () => Math.floor(Date.now() / 1000) + 3600;
const daarnet = () => Math.floor(Date.now() / 1000) - 3600;

test('een geldig token levert sub en e-mailadres op', async () => {
  const token = await maakToken({ sub: 'sub-1', email: 'Dries@Example.org', exp: straks() });
  const uit = await verifieerToken(token, ENV);
  assert.equal(uit.sub, 'sub-1');
  // Het adres is de sleutel naar de persoon, dus altijd in kleine letters.
  assert.equal(uit.email, 'dries@example.org');
});

test('een token met een andere handtekening wordt geweigerd', async () => {
  const token = await maakToken({ sub: 'sub-1', email: 'x@example.org', exp: straks() }, 'ander-geheim');
  await assert.rejects(() => verifieerToken(token, ENV), /handtekening/);
});

test('een gewijzigde payload wordt geweigerd', async () => {
  const token = await maakToken({ sub: 'sub-1', email: 'x@example.org', exp: straks() });
  const delen = token.split('.');
  const vervalst = base64url(JSON.stringify({ sub: 'sub-999', email: 'admin@example.org', exp: straks() }));
  await assert.rejects(() => verifieerToken(`${delen[0]}.${vervalst}.${delen[2]}`, ENV));
});

test('een vervallen token wordt geweigerd', async () => {
  const token = await maakToken({ sub: 'sub-1', email: 'x@example.org', exp: daarnet() });
  await assert.rejects(() => verifieerToken(token, ENV), /vervallen/);
});

test('een token zonder e-mailadres wordt geweigerd', async () => {
  const token = await maakToken({ sub: 'sub-1', exp: straks() });
  await assert.rejects(() => verifieerToken(token, ENV), /e-mailadres/);
});

test('een token dat geen drie delen heeft, wordt geweigerd', async () => {
  await assert.rejects(() => verifieerToken('niet.eens', ENV), /drie delen/);
  await assert.rejects(() => verifieerToken('', ENV));
});

test('de header wordt niet gebruikt om de verificatiewijze te kiezen', async () => {
  // Het klassieke lek: een token met alg 'none' of een gewisselde alg dat toch
  // aanvaard wordt. De configuratie bepaalt hier de weg, niet het token.
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ sub: 'sub-1', email: 'x@example.org', exp: straks() }));
  await assert.rejects(() => verifieerToken(`${header}.${body}.`, ENV));
});

test('het token wordt uit de Authorization-header gehaald', () => {
  const met = new Request('https://x/api/mij', { headers: { authorization: 'Bearer abc.def.ghi' } });
  assert.equal(tokenUitVerzoek(met), 'abc.def.ghi');

  const zonder = new Request('https://x/api/mij');
  assert.equal(tokenUitVerzoek(zonder), null);

  const fout = new Request('https://x/api/mij', { headers: { authorization: 'Basic abc' } });
  assert.equal(tokenUitVerzoek(fout), null);
});

test('ontleden gebeurt zonder iets te vertrouwen', async () => {
  const token = await maakToken({ sub: 'sub-1', email: 'x@example.org', exp: straks() });
  const ontleed = ontleedToken(token);
  assert.equal(ontleed.payload.sub, 'sub-1');
  assert.equal(ontleed.header.alg, 'HS256');
});

// ---------------------------------------------------------------------------
// Van identiteit naar persoon
// ---------------------------------------------------------------------------

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('p-dries', 'Dries', 'van Geijstelen Forier', 'dries@example.org'),
      ('p-weg',   'Weg',   'Gegaan',                'weg@example.org');
    UPDATE personen SET actief = 0, inactief_sinds = datetime('now') WHERE id = 'p-weg';
  `);
  return db;
}

test('een eerste aanmelding koppelt zichzelf aan de persoon met dat adres', async () => {
  const db = zetKlaar();
  const uit = await identiteitVoor(db, { sub: 'sub-1', email: 'dries@example.org' });
  assert.equal(uit.status, 'ok');
  assert.equal(uit.persoon.id, 'p-dries');

  const account = db._sqlite.prepare(`SELECT * FROM accounts WHERE sub = 'sub-1'`).get();
  assert.equal(account.persoon_id, 'p-dries');
});

test('een tweede aanmelding gebruikt de bestaande koppeling', async () => {
  const db = zetKlaar();
  await identiteitVoor(db, { sub: 'sub-1', email: 'dries@example.org' });
  const uit = await identiteitVoor(db, { sub: 'sub-1', email: 'dries@example.org' });
  assert.equal(uit.persoon.id, 'p-dries');

  const aantal = db._sqlite.prepare(`SELECT count(*) AS n FROM accounts`).get();
  assert.equal(aantal.n, 1);
});

test('een onbekend adres komt in de wachtrij en krijgt geen persoon', async () => {
  const db = zetKlaar();
  const uit = await identiteitVoor(db, { sub: 'sub-9', email: 'niemand@example.org' });
  assert.equal(uit.status, 'onbekend');
  assert.equal(uit.persoon, undefined);

  const rij = db._sqlite.prepare(`SELECT * FROM aanmeldingen_wachtrij WHERE sub = 'sub-9'`).get();
  assert.equal(rij.email, 'niemand@example.org');
  assert.equal(rij.pogingen, 1);
});

test('herhaalde pogingen worden geteld en maken geen tweede rij', async () => {
  const db = zetKlaar();
  await identiteitVoor(db, { sub: 'sub-9', email: 'niemand@example.org' });
  await identiteitVoor(db, { sub: 'sub-9', email: 'niemand@example.org' });
  const rij = db._sqlite.prepare(`SELECT * FROM aanmeldingen_wachtrij WHERE sub = 'sub-9'`).get();
  assert.equal(rij.pogingen, 2);
});

test('een persoon op inactief raakt niet binnen', async () => {
  const db = zetKlaar();
  const uit = await identiteitVoor(db, { sub: 'sub-2', email: 'weg@example.org' });
  assert.equal(uit.status, 'onbekend');
});

test('een gekoppeld account dat nadien inactief wordt, raakt er ook niet meer in', async () => {
  const db = zetKlaar();
  await identiteitVoor(db, { sub: 'sub-1', email: 'dries@example.org' });
  db._sqlite.exec(`UPDATE personen SET actief = 0 WHERE id = 'p-dries'`);
  const uit = await identiteitVoor(db, { sub: 'sub-1', email: 'dries@example.org' });
  assert.equal(uit.status, 'onbekend');
});
