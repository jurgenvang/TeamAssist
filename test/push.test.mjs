// Push (0.29.0, uit YOAssist): de cryptografie, de keuze van het kanaal, en
// de toestellen.
//
// Het zwaartepunt van de cryptografie: een melding die niet exact volgens
// RFC 8291 versleuteld is, gooit de browser stil weg. Daarom niet enkel de
// vorm nakijken, maar ze echt ontcijferen zoals een browser dat doet.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { maakVapidSleutels, versleutel, stuurPush, b64urlNaarBytes, bytesNaarB64url } from '../src/lib/push.js';
import { verwittig, verwittigTest } from '../src/lib/verwittigen.js';
import { pushAbonneer, pushAfmelden, pushToestellen } from '../src/routes/push.js';

const subtle = globalThis.crypto.subtle;

/** Een browserabonnement, met een echt ECDH-sleutelpaar om mee te ontcijferen. */
async function nepToestel(endpoint = 'https://fcm.googleapis.com/fcm/send/abc') {
  const paar = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return {
    endpoint,
    p256dh: bytesNaarB64url(await subtle.exportKey('raw', paar.publicKey)),
    auth: bytesNaarB64url(crypto.getRandomValues(new Uint8Array(16))),
    prive: paar.privateKey,
  };
}

async function hkdf(zout, ikm, info, lengte) {
  const sleutel = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: zout, info }, sleutel, lengte * 8));
}
const tekst = (s) => new TextEncoder().encode(s);
const samen = (...d) => { const u = new Uint8Array(d.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of d) { u.set(x, i); i += x.length; } return u; };

/** Ontcijferen zoals de browser het doet (RFC 8291, aes128gcm). */
async function ontcijfer(bytes, toestel) {
  const zout = bytes.slice(0, 16);
  const idLengte = bytes[20];
  const zenderPubliek = bytes.slice(21, 21 + idLengte);
  const versleuteld = bytes.slice(21 + idLengte);
  const zender = await subtle.importKey('raw', zenderPubliek, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const gedeeld = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: zender }, toestel.prive, 256));
  const ontvangerPubliek = b64urlNaarBytes(toestel.p256dh);
  const ikm = await hkdf(b64urlNaarBytes(toestel.auth), gedeeld, samen(tekst('WebPush: info\0'), ontvangerPubliek, zenderPubliek), 32);
  const cek = await hkdf(zout, ikm, tekst('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(zout, ikm, tekst('Content-Encoding: nonce\0'), 12);
  const sleutel = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const open = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, sleutel, versleuteld));
  assert.equal(open[open.length - 1], 2, 'laatste record eindigt op het scheidingsteken 0x02');
  return new TextDecoder().decode(open.slice(0, -1));
}

// --- cryptografie -------------------------------------------------------------

test('VAPID-sleutels hebben de vorm die browsers verwachten', async () => {
  const s = await maakVapidSleutels();
  assert.equal(b64urlNaarBytes(s.publiek).length, 65);
  assert.equal(b64urlNaarBytes(s.publiek)[0], 4, 'ongecomprimeerd punt');
  assert.equal(b64urlNaarBytes(s.prive).length, 32);
});

test('een versleutelde melding is te ontcijferen zoals een browser dat doet', async () => {
  const toestel = await nepToestel();
  const inhoud = JSON.stringify({ titel: 'Selectie bekend', tekst: 'Zaterdag 10u30 — U12 A' });
  const bytes = await versleutel(inhoud, toestel.p256dh, toestel.auth);
  assert.equal(await ontcijfer(bytes, toestel), inhoud);
});

test('een melding voor een ander toestel is niet te ontcijferen', async () => {
  const juist = await nepToestel();
  const ander = await nepToestel();
  const bytes = await versleutel('geheim', juist.p256dh, juist.auth);
  await assert.rejects(() => ontcijfer(bytes, { ...ander, auth: juist.auth }));
});

test('versturen: VAPID-header met een JWT voor de oorsprong van het endpoint', async () => {
  const toestel = await nepToestel();
  const s = await maakVapidSleutels();
  let verzoek;
  const uit = await stuurPush(toestel, { titel: 'x' }, { ...s, onderwerp: 'mailto:a@b.c' }, async (url, o) => {
    verzoek = { url, o };
    return { ok: true, status: 201 };
  });
  assert.equal(uit.verstuurd, true);
  assert.equal(verzoek.o.headers['Content-Encoding'], 'aes128gcm');
  const jwt = verzoek.o.headers.Authorization.match(/^vapid t=([^,]+), k=/)[1];
  const payload = JSON.parse(new TextDecoder().decode(b64urlNaarBytes(jwt.split('.')[1])));
  assert.equal(payload.aud, 'https://fcm.googleapis.com');
  assert.equal(payload.sub, 'mailto:a@b.c');
});

test('404 en 410 betekenen: dit abonnement bestaat niet meer; 500 niet', async () => {
  const toestel = await nepToestel();
  const s = { ...(await maakVapidSleutels()), onderwerp: 'mailto:a@b.c' };
  for (const status of [404, 410]) {
    assert.equal((await stuurPush(toestel, {}, s, async () => ({ ok: false, status }))).verlopen, true);
  }
  assert.equal((await stuurPush(toestel, {}, s, async () => ({ ok: false, status: 500 }))).verlopen, undefined);
  assert.equal((await stuurPush(toestel, {}, { onderwerp: 'x' })).reden, 'geen VAPID-sleutels');
});

// --- welk kanaal ----------------------------------------------------------------

async function zetKlaar(voorkeur, { modus = 'normaal', toestellen = 1 } = {}) {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO personen (id, voornaam, achternaam, email, kanaal_voorkeur) VALUES ('p1', 'Anna', 'P', 'anna@x.be', '${voorkeur}');
    UPDATE instellingen SET waarde = '${modus}' WHERE sleutel = 'bericht_modus';
    UPDATE instellingen SET waarde = 'test@x.be' WHERE sleutel = 'bericht_omleidadres';
  `);
  for (let i = 0; i < toestellen; i++) {
    const t = await nepToestel(`https://push.example/t${i}`);
    db._sqlite.prepare(`INSERT INTO push_abonnementen (persoon_id, endpoint, p256dh, auth) VALUES ('p1', ?, ?, ?)`).run(t.endpoint, t.p256dh, t.auth);
  }
  const env = { RESEND_API_KEY: 'x', ...(await maakVapidSleutels().then((s) => ({ VAPID_PUBLIEK: s.publiek, VAPID_PRIVE: s.prive }))) };
  return { db, env };
}

/** Vangt elke uitgaande oproep; pushdiensten antwoorden met `pushStatus`. */
function vang(pushStatus = 201) {
  const mails = [], pushes = [];
  globalThis.fetch = async (url, opties) => {
    if (String(url).includes('resend.com')) {
      mails.push(JSON.parse(opties.body));
      return new Response('{}', { status: 200 });
    }
    pushes.push(url);
    return { ok: pushStatus < 300, status: pushStatus };
  };
  return { mails, pushes };
}
const bericht = { persoon_id: 'p1', onderwerp: 'Taak', inhoud: 'Je doet de klok.\nZaterdag 10u30.', soort: 'taak' };

test("'push' met een werkend toestel: enkel push, geen mail, één rij in Mijn berichten", async () => {
  const { db, env } = await zetKlaar('push', { toestellen: 2 });
  const { mails, pushes } = vang();
  try {
    const uit = await verwittig({ db, env }, bericht);
    assert.equal(uit.push, 2);
    assert.equal(uit.mail, false);
  } finally { delete globalThis.fetch; }
  assert.equal(mails.length, 0);
  assert.equal(pushes.length, 2);
  const rijen = db._sqlite.prepare(`SELECT kanaal FROM berichten`).all();
  assert.deepEqual(rijen.map((r) => r.kanaal), ['push']);
  assert.ok(db._sqlite.prepare(`SELECT laatst_ok FROM push_abonnementen`).get().laatst_ok);
});

test("'push' maar elk toestel faalt: toch mail, en het toestel telt een mislukking", async () => {
  const { db, env } = await zetKlaar('push');
  const { mails } = vang(500);
  try {
    const uit = await verwittig({ db, env }, bericht);
    assert.equal(uit.mail, true);
  } finally { delete globalThis.fetch; }
  assert.equal(mails.length, 1);
  assert.equal(db._sqlite.prepare(`SELECT mislukt FROM push_abonnementen`).get().mislukt, 1);
  assert.match(db._sqlite.prepare(`SELECT details FROM logboek WHERE wat LIKE '%voorkeur push%'`).get().details, /geen toestel bereikbaar/);
});

test('een verlopen abonnement wordt meteen gewist', async () => {
  const { db, env } = await zetKlaar('push');
  vang(410);
  try { await verwittig({ db, env }, bericht); } finally { delete globalThis.fetch; }
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM push_abonnementen`).get().n, 0);
});

test("'beide': mail én push, maar één rij in Mijn berichten", async () => {
  const { db, env } = await zetKlaar('beide');
  const { mails, pushes } = vang();
  try { await verwittig({ db, env }, bericht); } finally { delete globalThis.fetch; }
  assert.equal(mails.length, 1);
  assert.equal(pushes.length, 1);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM berichten`).get().n, 1);
});

test("'mail': nooit push, ook niet met een ingeschreven toestel", async () => {
  const { db, env } = await zetKlaar('mail');
  const { pushes } = vang();
  try { await verwittig({ db, env }, bericht); } finally { delete globalThis.fetch; }
  assert.equal(pushes.length, 0);
});

test('omleiden: nooit push naar de echte persoon, wel de mail naar het testadres', async () => {
  const { db, env } = await zetKlaar('push', { modus: 'omleiden' });
  const { mails, pushes } = vang();
  try { await verwittig({ db, env }, bericht); } finally { delete globalThis.fetch; }
  assert.equal(pushes.length, 0);
  assert.deepEqual(mails.map((m) => m.to), ['test@x.be']);
});

test('push zonder e-mailadres werkt; zonder adres én zonder toestel is het een fout', async () => {
  const { db, env } = await zetKlaar('push');
  db._sqlite.exec(`UPDATE personen SET email = NULL`);
  vang();
  try {
    assert.equal((await verwittig({ db, env }, bericht)).verstuurd, true);
    db._sqlite.exec(`DELETE FROM push_abonnementen`);
    assert.equal((await verwittig({ db, env }, bericht)).reden, 'geen e-mailadres');
  } finally { delete globalThis.fetch; }
});

test('de testmelding gaat ook bij omleiden naar je eigen toestel, niet bij uit', async () => {
  const { db, env } = await zetKlaar('mail', { modus: 'omleiden' });
  const { pushes } = vang();
  try {
    assert.equal((await verwittigTest({ db, env }, 'p1')).verstuurd, 1);
    db._sqlite.exec(`UPDATE instellingen SET waarde = 'uit' WHERE sleutel = 'bericht_modus'`);
    assert.equal((await verwittigTest({ db, env }, 'p1')).reden, 'modus uit');
  } finally { delete globalThis.fetch; }
  assert.equal(pushes.length, 1);
});

// --- toestellen inschrijven -------------------------------------------------------

const verzoek = (body) => new Request('https://x', { method: 'POST', body: JSON.stringify(body) });
const geldig = { endpoint: 'https://push.example/nieuw', p256dh: 'BP', auth: 'au' };

test('inschrijven zet mail op beide; hetzelfde endpoint twee keer geeft één rij', async () => {
  const { db } = await zetKlaar('mail', { toestellen: 0 });
  const ctx = { db, persoon: { id: 'p1' }, request: verzoek(geldig) };
  assert.equal((await (await pushAbonneer(ctx)).json()).kanaal_voorkeur, 'beide');
  await pushAbonneer({ ...ctx, request: verzoek(geldig) });
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM push_abonnementen`).get().n, 1);
});

test('enkel https-endpoints, en alle drie de velden', async () => {
  const { db } = await zetKlaar('mail', { toestellen: 0 });
  const ctx = (b) => ({ db, persoon: { id: 'p1' }, request: verzoek(b) });
  assert.equal((await pushAbonneer(ctx({ ...geldig, endpoint: 'http://push.example/x' }))).status, 400);
  assert.equal((await pushAbonneer(ctx({ ...geldig, auth: '' }))).status, 400);
});

test('afmelden raakt enkel mijn eigen toestel; het laatste weg zet push terug op mail', async () => {
  const { db } = await zetKlaar('push', { toestellen: 0 });
  db._sqlite.exec(`
    INSERT INTO personen (id, email) VALUES ('p2', 'b@x.be');
    INSERT INTO push_abonnementen (persoon_id, endpoint, p256dh, auth) VALUES ('p2', 'https://push.example/van-p2', 'x', 'y'), ('p1', 'https://push.example/van-p1', 'x', 'y');
  `);
  const ctx = (endpoint) => ({ db, persoon: { id: 'p1' }, request: verzoek({ endpoint }) });
  assert.equal((await (await pushAfmelden(ctx('https://push.example/van-p2'))).json()).verwijderd, 0);
  const uit = await (await pushAfmelden(ctx('https://push.example/van-p1'))).json();
  assert.equal(uit.verwijderd, 1);
  assert.equal(uit.kanaal_voorkeur, 'mail');
  const lijst = await (await pushToestellen({ db, persoon: { id: 'p2' } })).json();
  assert.equal(lijst.toestellen.length, 1, 'het toestel van p2 staat er nog');
});
