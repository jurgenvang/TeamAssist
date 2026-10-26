// Ouder en kind (0.32.0, I1 fase 3a).
//
// Het zwaartepunt: een bericht aan een kind komt bij zijn ouders aan zolang
// dat aanstaat, en wie het mag uitzetten, volgt de regels van Jurgen —
// meerderjarig zelf, minderjarig enkel met de toestemming van elke ouder.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { isMinderjarig, meelezen, meelezenSql, magNamens } from '../src/lib/namens.js';
import { verwittig } from '../src/lib/verwittigen.js';
import { berichtenTonen, berichtenOngelezen, berichtVerwijderen } from '../src/routes/berichten.js';
import { meelezenTonen, meelezenZetten, meelezenAntwoord } from '../src/routes/meelezen.js';
import { ouderKoppelen, ouderOntkoppelen, persoonTonen } from '../src/routes/admin/persoon.js';

const seizoen = { code: '2026-27', naam: '2026-2027' };

/** Een geboortedatum `jaren` jaar geleden, plus `dagen` dagen later. */
function geboren(jaren, dagen = 0) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - jaren);
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}

// max: minderjarig, eigen adres. lies: meerderjarig. tom: zonder adres.
// mama en papa zijn ouders van alle drie; vreemde is niemands ouder.
function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2026-27', '2026-2027', 1);
    UPDATE instellingen SET waarde = 'normaal' WHERE sleutel = 'bericht_modus';
    INSERT INTO personen (id, voornaam, achternaam, email, geboortedatum) VALUES
      ('max', 'Max', 'Cuyvers', 'max@x.be', '${geboren(14)}'),
      ('lies', 'Lies', 'Cuyvers', 'lies@x.be', '${geboren(20)}'),
      ('tom', 'Tom', 'Cuyvers', NULL, '${geboren(10)}'),
      ('mama', 'Mama', 'Cuyvers', 'mama@x.be', NULL),
      ('papa', 'Papa', 'Cuyvers', 'papa@x.be', NULL),
      ('vreemde', 'Vreemde', 'X', 'v@x.be', NULL),
      ('beheer', 'Beheer', 'B', 'beheer@x.be', NULL);
    INSERT INTO ouder_kind (ouder_id, kind_id) VALUES
      ('mama', 'max'), ('papa', 'max'), ('mama', 'lies'), ('papa', 'lies'), ('mama', 'tom');
  `);
  return db;
}

const verzoek = (url, body) =>
  new Request(url ?? 'https://x', { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined });
const ctx = (db, id, body, url) => ({ db, env: { RESEND_API_KEY: 'x' }, persoon: { id }, seizoen, request: verzoek(url, body) });

/** Vangt de mails op; geeft [{to, subject, text}] terug. */
async function metMails(fn) {
  const mails = [];
  const oude = globalThis.fetch;
  globalThis.fetch = async (url, opties) => {
    if (String(url).includes('resend.com')) mails.push(JSON.parse(opties.body));
    return new Response(JSON.stringify({ id: 'm' }), { status: 200 });
  };
  try {
    await fn();
  } finally {
    globalThis.fetch = oude;
  }
  return mails;
}

const aan = (db, id) => meelezen(db._sqlite.prepare(`SELECT * FROM personen WHERE id = ?`).get(id)).aan;

// --- de regel zelf ---------------------------------------------------------------

test('minderjarig tot de dag van de achttiende verjaardag; onbekend telt als minderjarig', () => {
  assert.equal(isMinderjarig(geboren(18, 1)), true, 'morgen 18');
  assert.equal(isMinderjarig(geboren(18)), false, 'vandaag 18');
  assert.equal(isMinderjarig(null), true);
  assert.equal(isMinderjarig('onzin'), true);
});

test('de standaard: minderjarig aan, meerderjarig uit, zonder adres altijd aan; een keuze wint', () => {
  assert.equal(meelezen({ email: 'a', geboortedatum: geboren(14) }).aan, true);
  assert.equal(meelezen({ email: 'a', geboortedatum: geboren(20) }).aan, false);
  assert.equal(meelezen({ email: null, geboortedatum: geboren(20), ouders_meelezen: 0 }).aan, true, 'zonder adres');
  assert.equal(meelezen({ email: 'a', geboortedatum: geboren(14), ouders_meelezen: 0 }).aan, false);
  assert.equal(meelezen({ email: 'a', geboortedatum: geboren(20), ouders_meelezen: 1 }).aan, true);
});

test('de regel in SQL zegt hetzelfde als die in JavaScript', () => {
  const db = maakDb();
  const gevallen = [];
  for (const email of [null, 'adres']) {
    for (const gd of [null, 'onzin', geboren(14), geboren(18, 1), geboren(18), geboren(30)]) {
      for (const keuze of [null, 0, 1]) gevallen.push({ email, geboortedatum: gd, ouders_meelezen: keuze });
    }
  }
  gevallen.forEach((g, i) => {
    db._sqlite
      .prepare(`INSERT INTO personen (id, email, geboortedatum, ouders_meelezen) VALUES (?, ?, ?, ?)`)
      .run(`p${i}`, g.email && `p${i}@x.be`, g.geboortedatum, g.ouders_meelezen);
  });
  const uitSql = new Map(
    db._sqlite.prepare(`SELECT p.id, ${meelezenSql('p')} AS aan FROM personen p`).all().map((r) => [r.id, r.aan === 1])
  );
  gevallen.forEach((g, i) => assert.equal(uitSql.get(`p${i}`), meelezen(g).aan, JSON.stringify(g)));
});

test('namens handelen: voor jezelf, of als ouder; nooit voor een ander', async () => {
  const db = zetKlaar();
  assert.equal(await magNamens(db, 'mama', 'max'), true);
  assert.equal(await magNamens(db, 'max', 'max'), true);
  assert.equal(await magNamens(db, 'vreemde', 'max'), false);
  assert.equal(await magNamens(db, 'max', 'mama'), false, 'een kind niet voor zijn ouder');
});

// --- verwittig ------------------------------------------------------------------

test('een minderjarige: het bericht gaat naar hem en naar elke ouder, en staat één keer in berichten', async () => {
  const db = zetKlaar();
  const mails = await metMails(() =>
    verwittig({ db, env: { RESEND_API_KEY: 'x' } }, { persoon_id: 'max', onderwerp: 'Je fluit zaterdag', inhoud: 'Om 10 uur.' })
  );
  assert.deepEqual(mails.map((m) => m.to).sort(), ['mama@x.be', 'max@x.be', 'papa@x.be']);
  const kopie = mails.find((m) => m.to === 'mama@x.be');
  assert.equal(kopie.subject, 'Voor Max: Je fluit zaterdag');
  assert.match(kopie.text, /^Dit bericht is voor Max Cuyvers\./);
  assert.deepEqual(db._sqlite.prepare(`SELECT persoon_id FROM berichten`).all().map((r) => r.persoon_id), ['max']);
});

test('een meerderjarige: standaard enkel hijzelf', async () => {
  const db = zetKlaar();
  const mails = await metMails(() => verwittig({ db, env: {} }, { persoon_id: 'lies', onderwerp: 'x', inhoud: 'y' }));
  assert.deepEqual(mails.map((m) => m.to), ['lies@x.be']);
});

test('een kind zonder adres: enkel de ouders, en het bericht staat toch bij het kind', async () => {
  const db = zetKlaar();
  let uit;
  const mails = await metMails(async () => {
    uit = await verwittig({ db, env: {} }, { persoon_id: 'tom', onderwerp: 'Selectie', inhoud: 'Je speelt.' });
  });
  assert.equal(uit.verstuurd, true);
  assert.deepEqual(mails.map((m) => m.to), ['mama@x.be']);
  assert.equal(db._sqlite.prepare(`SELECT persoon_id FROM berichten`).get().persoon_id, 'tom');
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM logboek WHERE soort = 'fout'`).get().n, 0);
});

test('zonder adres en zonder ouders: niets verstuurd, en een foutregel', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`INSERT INTO personen (id, voornaam, achternaam) VALUES ('alleen', 'Al', 'Leen')`);
  let uit;
  await metMails(async () => {
    uit = await verwittig({ db, env: {} }, { persoon_id: 'alleen', onderwerp: 'x', inhoud: 'y' });
  });
  assert.equal(uit.verstuurd, false);
  assert.ok(db._sqlite.prepare(`SELECT 1 FROM logboek WHERE wat = 'bericht niet verstuurd: geen e-mailadres'`).get());
});

test('in de modus omleiden gaan ook de kopieën naar het omleidadres, nooit naar de echte ouder', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    UPDATE instellingen SET waarde = 'omleiden' WHERE sleutel = 'bericht_modus';
    UPDATE instellingen SET waarde = 'test@x.be' WHERE sleutel = 'bericht_omleidadres';
  `);
  const mails = await metMails(() => verwittig({ db, env: {} }, { persoon_id: 'max', onderwerp: 'x', inhoud: 'y' }));
  assert.equal(mails.length, 3);
  assert.ok(mails.every((m) => m.to === 'test@x.be'));
});

// --- Mijn berichten van een ouder -----------------------------------------------------

test('een ouder ziet de berichten van zijn kind, met voor wie; verwijderen kan enkel het kind', async () => {
  const db = zetKlaar();
  await metMails(() => verwittig({ db, env: {} }, { persoon_id: 'max', onderwerp: 'Voor Max', inhoud: 'y' }));
  const lijst = await (await berichtenTonen(ctx(db, 'mama'))).json();
  assert.equal(lijst.berichten.length, 1);
  assert.equal(lijst.berichten[0].voor, 'Max Cuyvers');
  assert.equal((await (await berichtenOngelezen(ctx(db, 'mama'))).json()).ongelezen, 1);

  const id = lijst.berichten[0].id;
  assert.equal((await (await berichtVerwijderen(ctx(db, 'mama', { id }))).json()).verwijderd, 0);
  assert.equal((await (await berichtenTonen(ctx(db, 'vreemde'))).json()).berichten.length, 0);
});

test('staat het uit, dan ziet de ouder ook de oudere berichten van dat kind niet meer', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`UPDATE personen SET ouders_meelezen = 1 WHERE id = 'lies'`);
  await metMails(() => verwittig({ db, env: {} }, { persoon_id: 'lies', onderwerp: 'x', inhoud: 'y' }));
  assert.equal((await (await berichtenTonen(ctx(db, 'mama'))).json()).berichten.length, 1);
  db._sqlite.exec(`UPDATE personen SET ouders_meelezen = 0 WHERE id = 'lies'`);
  assert.equal((await (await berichtenTonen(ctx(db, 'mama'))).json()).berichten.length, 0);
});

// --- de schakelaar ---------------------------------------------------------------------

test('een meerderjarige zet het zelf aan en uit, zonder iemand te vragen', async () => {
  const db = zetKlaar();
  await meelezenZetten(ctx(db, 'lies', { aan: true }));
  assert.equal(aan(db, 'lies'), true);
  await meelezenZetten(ctx(db, 'lies', { aan: false }));
  assert.equal(aan(db, 'lies'), false);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM ouder_toestemming`).get().n, 0);
});

test('een minderjarige die uitzet: elke ouder krijgt de vraag, en het blijft aan tot iedereen ja zei', async () => {
  const db = zetKlaar();
  const mails = await metMails(async () => {
    const res = await (await meelezenZetten(ctx(db, 'max', { aan: false }))).json();
    assert.equal(res.toestemming_gevraagd, 2);
  });
  assert.equal(aan(db, 'max'), true);
  assert.deepEqual(mails.map((m) => m.to).sort(), ['mama@x.be', 'papa@x.be']);
  assert.ok(mails.every((m) => /toestemming/.test(m.subject)));

  const mama = await (await meelezenTonen(ctx(db, 'mama'))).json();
  assert.equal(mama.kinderen.find((k) => k.id === 'max').mijn_antwoord_gevraagd, true);

  await metMails(() => meelezenAntwoord(ctx(db, 'mama', { kind_id: 'max', ja: true })));
  assert.equal(aan(db, 'max'), true, 'papa antwoordde nog niet');

  const laatste = await metMails(async () => {
    const res = await (await meelezenAntwoord(ctx(db, 'papa', { kind_id: 'max', ja: true }))).json();
    assert.deepEqual(res, { beslist: true, aan: false });
  });
  assert.equal(aan(db, 'max'), false);
  assert.deepEqual(laatste.map((m) => m.to), ['max@x.be'], 'het kind hoort het, de ouders niet meer');
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM ouder_toestemming`).get().n, 0);
});

test('één nee, en het blijft aan', async () => {
  const db = zetKlaar();
  await metMails(async () => {
    await meelezenZetten(ctx(db, 'max', { aan: false }));
    await meelezenAntwoord(ctx(db, 'mama', { kind_id: 'max', ja: true }));
    await meelezenAntwoord(ctx(db, 'papa', { kind_id: 'max', ja: false }));
  });
  assert.equal(aan(db, 'max'), true);
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM ouder_toestemming`).get().n, 0);
});

test('een ouder zet het bij een minderjarige weer aan; uitzetten doet hij niet', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`UPDATE personen SET ouders_meelezen = 0 WHERE id = 'max'`);
  await meelezenZetten(ctx(db, 'papa', { aan: true, kind_id: 'max' }));
  assert.equal(aan(db, 'max'), true);
  const res = await meelezenZetten(ctx(db, 'papa', { aan: false, kind_id: 'max' }));
  assert.equal(res.status, 400);
  assert.equal(aan(db, 'max'), true);
});

test('bij een meerderjarige beslist de ouder niets; een vreemde nergens', async () => {
  const db = zetKlaar();
  assert.equal((await meelezenZetten(ctx(db, 'mama', { aan: true, kind_id: 'lies' }))).status, 403);
  assert.equal((await meelezenZetten(ctx(db, 'vreemde', { aan: true, kind_id: 'max' }))).status, 403);
  assert.equal((await meelezenAntwoord(ctx(db, 'vreemde', { kind_id: 'max', ja: true }))).status, 404);
});

test('zonder eigen adres valt er niets te kiezen', async () => {
  const db = zetKlaar();
  assert.equal((await meelezenZetten(ctx(db, 'mama', { aan: true, kind_id: 'tom' }))).status, 400);
});

test('zelf weer aanzetten trekt de vraag in', async () => {
  const db = zetKlaar();
  await metMails(async () => {
    await meelezenZetten(ctx(db, 'max', { aan: false }));
    await meelezenZetten(ctx(db, 'max', { aan: true }));
  });
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM ouder_toestemming`).get().n, 0);
  assert.equal((await meelezenAntwoord(ctx(db, 'mama', { kind_id: 'max', ja: true }))).status, 404);
});

// --- koppelen in het persoonsscherm ------------------------------------------------------

test('koppelen en ontkoppelen; het persoonsscherm toont ouders en kinderen', async () => {
  const db = zetKlaar();
  await ouderKoppelen(ctx(db, 'beheer', { kind_id: 'tom', ouder_id: 'papa' }));
  const tom = await (await persoonTonen(ctx(db, 'beheer', null, 'https://x/?id=tom'))).json();
  assert.deepEqual(tom.ouders.map((o) => o.id).sort(), ['mama', 'papa']);
  assert.equal(tom.ouders_meelezen, true);
  const mama = await (await persoonTonen(ctx(db, 'beheer', null, 'https://x/?id=mama'))).json();
  assert.deepEqual(mama.kinderen.map((k) => k.id), ['lies', 'max', 'tom']);

  await ouderOntkoppelen(ctx(db, 'beheer', { kind_id: 'tom', ouder_id: 'papa' }));
  assert.equal(db._sqlite.prepare(`SELECT count(*) AS n FROM ouder_kind WHERE kind_id = 'tom'`).get().n, 1);
});

test('geen ketens: een ouder is zelf geen kind, een kind zelf geen ouder', async () => {
  const db = zetKlaar();
  assert.equal((await ouderKoppelen(ctx(db, 'beheer', { kind_id: 'vreemde', ouder_id: 'max' }))).status, 400);
  assert.equal((await ouderKoppelen(ctx(db, 'beheer', { kind_id: 'mama', ouder_id: 'vreemde' }))).status, 400);
  assert.equal((await ouderKoppelen(ctx(db, 'beheer', { kind_id: 'max', ouder_id: 'max' }))).status, 400);
});

test('een ouder ontkoppelen die als enige nog moest antwoorden, beslist de vraag', async () => {
  const db = zetKlaar();
  await metMails(async () => {
    await meelezenZetten(ctx(db, 'max', { aan: false }));
    await meelezenAntwoord(ctx(db, 'mama', { kind_id: 'max', ja: true }));
    await ouderOntkoppelen(ctx(db, 'beheer', { kind_id: 'max', ouder_id: 'papa' }));
  });
  assert.equal(aan(db, 'max'), false);
});
