// De vergoedingen van de officials (0.36.0, I1 fase 3e).
//
// Dezelfde scenario's als in YOAssist (test/vergoeding.test.mjs daar). De kern
// zit in de correcties: wat er verandert nadat een maand is afgesloten, mag het
// bedrag van toen niet meer raken, maar moet wel rechtgezet worden in de
// volgende afsluiting.
//
// Maanden uit een seizoen dat volledig voorbij is: afsluiten mag pas na de
// laatste dag van de maand, dus een toekomstige maand zou de test laten falen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import { rechtenVoor } from '../src/lib/rechten-db.js';
import {
  maandBereik, magAfsluiten, bouwRegels, perOfficial, alsBedrag, verwerktAlsItems, wedstrijdRegel,
} from '../src/officials/vergoeding.js';
import {
  facturatieOverzicht, facturatieVoorbeeld, facturatieAfsluiten, facturatieStaat, ontvangersZetten,
  facturatiePerOfficial, tarievenTonen, tariefZetten, mijnVergoeding,
} from '../src/officials/facturatie.js';

const seizoen = { code: '2025-26', naam: '2025-2026' };
const M1 = '2026-03';
const M2 = '2026-04';
const M3 = '2026-05';

// --- de rekenregels ------------------------------------------------------------

test('maandbereik en wanneer afsluiten mag', () => {
  assert.deepEqual(maandBereik('2026-10'), { van: '2026-10-01', tot: '2026-10-31' });
  assert.equal(maandBereik('2028-02').tot, '2028-02-29');
  assert.equal(maandBereik('oktober'), null);
  assert.equal(maandBereik('2026-13'), null);
  assert.equal(magAfsluiten('2026-10', '2026-10-31').mag, false);
  assert.match(magAfsluiten('2026-10', '2026-10-15').reden, /nog niet voorbij/);
  assert.equal(magAfsluiten('2026-10', '2026-11-01').mag, true);
});

test('regels bouwen, correcties, en een saldo van nul verdwijnt', () => {
  const w = (cat, tarief) => ({ wedstrijdGuid: `M${Math.random()}`, persoonId: 'ann', naam: 'Ann', catCode: cat, catLabel: cat, tariefCent: tarief });
  const regels = bouwRegels([w('G12', 1500), w('G12', 1500), w('J16', 2000)]);
  assert.equal(regels.length, 2);
  assert.deepEqual([regels[0].aantal, regels[0].bedragCent], [2, 3000]);

  const c = bouwRegels([w('G12', 1500)], [{ persoonId: 'ann', naam: 'Ann', betreftMaand: '2026-09', catCode: 'G12', catLabel: 'U12', tariefCent: 1500, aantal: -1 }]);
  assert.deepEqual(c.map((r) => r.soort), ['wedstrijd', 'correctie']);
  assert.equal(c[1].bedragCent, -1500);
  assert.equal(perOfficial(c)[0].totaalCent, 0);

  const kk = { persoonId: 'a', naam: 'A', betreftMaand: '2026-09', catCode: 'G12', catLabel: 'U12', tariefCent: 1500 };
  assert.equal(bouwRegels([], [{ ...kk, aantal: 1 }, { ...kk, aantal: -1 }]).length, 0);

  assert.equal(alsBedrag(1550), '€ 15,50');
  assert.equal(alsBedrag(-1500), '− € 15,00');
  const [item] = verwerktAlsItems([{ maand: '2026-04', persoon_id: 'a', wedstrijd_guid: 'X', cat_code: 'G12', cat_label: 'U12', aantal: -1, datum: '2026-03-07', thuis_naam: 'G12 A', uit_naam: 'Gent' }]);
  assert.deepEqual([item.soort, item.betreftMaand], ['correctie', '2026-03']);
  assert.equal(wedstrijdRegel({ ...item, wedstrijd: 'G12 A - Gent' }), 'za 7/03  G12 A - Gent (U12) — correctie -1');
});

// --- de databank -------------------------------------------------------------------

function zetKlaar() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('2025-26', '2025-2026', 1);
    UPDATE instellingen SET waarde = 'normaal' WHERE sleutel = 'bericht_modus';
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd, officials) VALUES
      ('T12', '2025-26', 'Bears G12 A', 'G12', 0, 1), ('T16', '2025-26', 'Bears J16 A', 'J16', 0, 1),
      ('TROL', '2025-26', 'Bears ROL A', 'ROL', 0, 1);
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES
      ('ann', 'Ann', 'Aerts', 'ann@x.be'), ('bert', 'Bert', 'Bosmans', 'bert@x.be'),
      ('baas', 'Bea', 'Baas', 'baas@x.be'), ('pen', 'Piet', 'Penning', 'pen@x.be'),
      ('kind', 'Kim', 'Kind', NULL), ('ouder', 'Olga', 'Kind', 'olga@x.be');
    INSERT INTO rollen (persoon_id, rol) VALUES ('ann', 'YO'), ('bert', 'YOPLUS'), ('baas', 'YOADM'),
      ('pen', 'FINADM'), ('kind', 'YO');
    INSERT INTO ouder_kind (ouder_id, kind_id) VALUES ('ouder', 'kind');
  `);
  return db;
}

/** Een gespeelde thuiswedstrijd met aanduidingen. */
function wed(db, guid, datum, team = 'T12', cat = 'G12', officials = []) {
  db._sqlite.exec(`
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander)
      VALUES ('${guid}', '${team}', '2025-26', '${datum}', '14:00', 1, 'Gast');
    INSERT INTO officials_wedstrijd (wedstrijd_id, cat_code, scope)
      SELECT id, '${cat}', 1 FROM wedstrijden WHERE wedstrijd_guid = '${guid}';
  `);
  for (const p of officials) aanduid(db, guid, p);
}
const aanduid = (db, guid, p) =>
  db._sqlite.exec(`INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, toegewezen_door)
                   SELECT id, '${p}', 'baas' FROM wedstrijden WHERE wedstrijd_guid = '${guid}'`);
const vrijgeef = (db, guid) =>
  db._sqlite.exec(`UPDATE officials_aanduidingen SET status = 'vrijgegeven'
                    WHERE wedstrijd_id = (SELECT id FROM wedstrijden WHERE wedstrijd_guid = '${guid}')`);
const tel = (db, tabel) => db._sqlite.prepare(`SELECT COUNT(*) AS n FROM ${tabel}`).get().n;

async function ctx(db, persoonId, { body, url = 'https://x/' } = {}) {
  return {
    db, env: { RESEND_API_KEY: 'x' }, seizoen, persoon: { id: persoonId },
    rechten: await rechtenVoor(db, persoonId, seizoen.code),
    request: new Request(url, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined }),
  };
}
const json = async (res) => ({ status: res.status, ...(await res.json()) });
const voorbeeld = async (db, maand) => json(await facturatieVoorbeeld(await ctx(db, 'baas', { url: `https://x/?maand=${maand}` })));
const staat = async (db, maand) => json(await facturatieStaat(await ctx(db, 'baas', { url: `https://x/?maand=${maand}` })));
const afsluiten = async (db, maand, extra = {}) => json(await facturatieAfsluiten(await ctx(db, 'baas', { body: { maand, ...extra } })));
const mijn = async (db, wie, namens = null) =>
  json(await mijnVergoeding(await ctx(db, wie, { url: `https://x/${namens ? `?namens=${namens}` : ''}` })));

async function metMails(fn) {
  const mails = [];
  const oude = globalThis.fetch;
  globalThis.fetch = async (url, opties) => {
    mails.push(JSON.parse(opties.body));
    return new Response('{"id":"m"}', { status: 200 });
  };
  try {
    await fn();
  } finally {
    globalThis.fetch = oude;
  }
  return mails;
}

test('het voorbeeld rekent uit zonder iets vast te leggen, met de wedstrijden per official', async () => {
  const db = zetKlaar();
  wed(db, 'A1', `${M1}-05`, 'T12', 'G12', ['ann', 'bert']);
  wed(db, 'A2', `${M1}-12`, 'T12', 'G12', ['ann']);
  wed(db, 'A3', `${M1}-19`, 'T16', 'J16', ['bert']);
  const r = await voorbeeld(db, M1);
  assert.equal(r.aantal_officials, 2);
  const ann = r.officials.find((o) => o.naam === 'Ann Aerts');
  assert.deepEqual([ann.regels[0].aantal, ann.totaal], [2, '€ 30,00']);
  assert.equal(ann.wedstrijden.length, 2);
  assert.match(ann.wedstrijden[0].wedstrijd, /Bears G12 A - Gast/);
  assert.equal(r.officials.find((o) => o.naam === 'Bert Bosmans').totaal, '€ 35,00');
  assert.equal(r.totaal, '€ 65,00');
  assert.equal(r.kan_afsluiten, true);
  assert.equal(tel(db, 'officials_maanden'), 0);
});

test('afsluiten legt de bedragen vast, één keer, en nooit een lopende maand', async () => {
  const db = zetKlaar();
  wed(db, 'A1', `${M1}-05`, 'T12', 'G12', ['ann']);
  await metMails(async () => {
    assert.equal((await afsluiten(db, '2099-01')).status, 409);
    const r = await afsluiten(db, M1);
    assert.equal(r.status, 200);
    assert.equal(r.totaal, '€ 15,00');
    assert.equal(tel(db, 'officials_vergoeding_regels'), 1);
    assert.equal(tel(db, 'officials_vergoeding_verwerkt'), 1);
    assert.equal((await afsluiten(db, M1)).status, 409);
  });
  assert.equal((await voorbeeld(db, M1)).status, 409, 'een afgesloten maand heeft geen voorbeeld meer');
  assert.ok(db._sqlite.prepare(`SELECT 1 FROM logboek WHERE wie = 'baas' AND wat LIKE 'vergoedingen ${M1} afgesloten'`).get());
});

test('een vrijgave na de afsluiting: het bedrag van toen blijft, de volgende maand corrigeert — één keer', async () => {
  const db = zetKlaar();
  wed(db, 'A1', `${M1}-05`, 'T12', 'G12', ['ann']);
  await metMails(() => afsluiten(db, M1));
  vrijgeef(db, 'A1');
  assert.equal((await staat(db, M1)).totaal, '€ 15,00');

  wed(db, 'B1', `${M2}-03`, 'T12', 'G12', ['ann']);
  const v = await voorbeeld(db, M2);
  assert.equal(v.aantal_correcties, 1);
  const ann = v.officials[0];
  assert.deepEqual(ann.regels.map((r) => r.soort), ['wedstrijd', 'correctie']);
  assert.equal(ann.regels[1].betreftMaand, M1);
  assert.equal(ann.regels[1].bedrag, '− € 15,00');
  assert.equal(ann.totaal, '€ 0,00');

  await metMails(() => afsluiten(db, M2));
  const mei = await voorbeeld(db, M3);
  assert.equal(mei.aantal_correcties, 0, 'dezelfde correctie komt niet terug');
  assert.equal(mei.aantal_officials, 0);
});

test('een aanduiding die pas na de afsluiting bijkomt: een positieve correctie', async () => {
  const db = zetKlaar();
  wed(db, 'A1', `${M1}-05`, 'T12', 'G12', ['ann']);
  await metMails(() => afsluiten(db, M1));
  aanduid(db, 'A1', 'bert');
  const bert = (await voorbeeld(db, M2)).officials.find((o) => o.naam === 'Bert Bosmans');
  assert.deepEqual([bert.regels[0].soort, bert.regels[0].betreftMaand, bert.totaal], ['correctie', M1, '€ 15,00']);
});

test('niet meer bij de bond: niet meegeteld maar gemeld; zonder tarief: afsluiten geweigerd', async () => {
  const db = zetKlaar();
  wed(db, 'A1', `${M1}-05`, 'T12', 'G12', ['ann']);
  wed(db, 'A2', `${M1}-06`, 'T12', 'G12', ['bert']);
  db._sqlite.exec(`UPDATE wedstrijden SET bij_bond = 0 WHERE wedstrijd_guid = 'A2'`);
  let r = await voorbeeld(db, M1);
  assert.equal(r.aantal_officials, 1);
  assert.equal(r.verdwenen[0].naam, 'Bert Bosmans');

  wed(db, 'A3', `${M1}-07`, 'TROL', 'ROL', ['ann']);
  r = await voorbeeld(db, M1);
  assert.equal(r.zonder_tarief.length, 1);
  assert.equal(r.kan_afsluiten, false);
  const poging = await afsluiten(db, M1);
  assert.equal(poging.status, 409);
  assert.match(poging.fout, /ROL/);
});

test('de maandmail noemt de wedstrijden; de verzamelstaat gaat naar adressen zonder account', async () => {
  const db = zetKlaar();
  wed(db, 'A1', `${M1}-05`, 'T12', 'G12', ['ann']);
  const z = await json(await ontvangersZetten(await ctx(db, 'baas', { body: { ontvangers: 'kas@club.be; boek@club.be' } })));
  assert.deepEqual(z.ontvangers, ['kas@club.be', 'boek@club.be']);
  assert.equal((await ontvangersZetten(await ctx(db, 'baas', { body: { ontvangers: 'geen adres' } }))).status, 400);

  const mails = await metMails(() => afsluiten(db, M1));
  const naarAnn = mails.find((m) => m.to === 'ann@x.be');
  assert.match(naarAnn.text, /€ 15,00[\s\S]*Wedstrijden:[\s\S]*Bears G12 A - Gast \(U12\)/);
  assert.deepEqual(mails.filter((m) => m.to.endsWith('@club.be')).map((m) => m.to).sort(), ['boek@club.be', 'kas@club.be']);
  assert.match(mails.find((m) => m.to === 'kas@club.be').text, /Ann Aerts: 1 × — € 15,00/);
  assert.equal(tel(db, 'berichten'), 1, 'enkel de official in Mijn berichten');
  assert.equal((await staat(db, M1)).verstuurd_naar, 'kas@club.be, boek@club.be');
});

test('de verzamelstaat volgt bericht_modus: omgeleid naar het testadres', async () => {
  const db = zetKlaar();
  db._sqlite.exec(`
    UPDATE instellingen SET waarde = 'omleiden' WHERE sleutel = 'bericht_modus';
    INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES ('bericht_omleidadres', 'test@x.be'), ('facturatie_ontvangers', 'kas@club.be');
  `);
  wed(db, 'A1', `${M1}-05`, 'T12', 'G12', ['ann']);
  const mails = await metMails(() => afsluiten(db, M1));
  assert.ok(mails.every((m) => m.to === 'test@x.be'));
  assert.ok(mails.some((m) => /bedoeld voor kas@club\.be/.test(m.text)));
});

test('een afgesloten maand toont wat er toen meetelde, ook als er sindsdien iets veranderde', async () => {
  const db = zetKlaar();
  wed(db, 'A1', `${M1}-05`, 'T12', 'G12', ['ann']);
  await metMails(() => afsluiten(db, M1));
  vrijgeef(db, 'A1');
  aanduid(db, 'A1', 'bert');
  const s = await staat(db, M1);
  assert.deepEqual(s.officials.map((o) => o.naam), ['Ann Aerts']);
  assert.equal(s.officials[0].wedstrijden.length, 1);
  assert.equal((await staat(db, M2)).status, 404);
});

test('Mijn vergoeding: afgesloten en lopend, het seizoenstotaal enkel wat vastligt, ook namens een kind', async () => {
  const db = zetKlaar();
  wed(db, 'A1', `${M1}-05`, 'T12', 'G12', ['ann', 'kind']);
  wed(db, 'A2', `${M1}-12`, 'T16', 'J16', ['ann']);
  await metMails(() => afsluiten(db, M1));
  wed(db, 'B1', `${M2}-03`, 'T12', 'G12', ['ann']);

  const r = await mijn(db, 'ann');
  assert.deepEqual(r.maanden.map((m) => [m.maand, m.afgesloten, m.totaal]), [[M2, false, '€ 15,00'], [M1, true, '€ 35,00']]);
  assert.equal(r.seizoen_totaal, '€ 35,00');
  assert.equal(r.maanden[1].wedstrijden.length, 2);
  assert.equal(r.maanden[0].wedstrijden.length, 1);

  assert.equal((await mijn(db, 'bert')).maanden.length, 0, 'enkel het eigen overzicht');
  const k = await mijn(db, 'ouder', 'kind');
  assert.equal(k.seizoen_totaal, '€ 15,00');
  assert.equal(k.namens.naam, 'Kim Kind');
  assert.equal((await mijnVergoeding(await ctx(db, 'bert', { url: 'https://x/?namens=ann' }))).status, 403);
});

test('overzicht, per official, en tarieven aanpassen', async () => {
  const db = zetKlaar();
  wed(db, 'A1', `${M1}-05`, 'T12', 'G12', ['ann']);
  wed(db, 'B1', `${M2}-05`, 'T12', 'G12', ['ann']);
  await metMails(() => afsluiten(db, M1));

  const o = await json(await facturatieOverzicht(await ctx(db, 'baas')));
  assert.deepEqual(o.afgesloten.map((a) => a.maand), [M1]);
  assert.deepEqual(o.open.map((m) => [m.maand, m.mag]), [[M2, true]]);

  const p = await json(await facturatiePerOfficial(await ctx(db, 'baas')));
  assert.deepEqual([p.officials[0].naam, p.officials[0].bedrag, p.totaal], ['Ann Aerts', '€ 15,00', '€ 15,00']);

  assert.equal((await tariefZetten(await ctx(db, 'baas', { body: { code: 'G12', tarief_cent: 1.5 } }))).status, 400);
  assert.equal((await tariefZetten(await ctx(db, 'baas', { body: { code: 'XXX', tarief_cent: 100 } }))).status, 404);
  await tariefZetten(await ctx(db, 'baas', { body: { code: 'G12', tarief_cent: 1800 } }));
  const t = await json(await tarievenTonen(await ctx(db, 'baas')));
  assert.equal(t.tarieven.find((x) => x.code === 'G12').tarief, '€ 18,00');
  assert.equal((await voorbeeld(db, M2)).totaal, '€ 18,00', 'het nieuwe tarief voor wat nog open is');
  assert.equal((await staat(db, M1)).totaal, '€ 15,00', 'een afgesloten maand ligt vast');
});

test('rechten: YOADM en FINADM, geen official', async () => {
  const db = zetKlaar();
  for (const [wie, mag] of [['baas', true], ['pen', true], ['ann', false], ['bert', false]]) {
    assert.equal((await rechtenVoor(db, wie, seizoen.code)).mag('officials.vergoedingen'), mag, wie);
  }
});
