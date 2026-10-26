// Berichten aan een kind ook naar zijn ouders: de schakelaar (0.32.0).
//
// Wie wat mag, beslist door Jurgen (26 oktober 2026), zie namens.js:
//  - een meerderjarige zet het zelf aan en uit;
//  - een minderjarige kan het uitzetten, maar pas als elke ouder ja zei —
//    tot dan blijft het aan; zet hij het weer aan, dan vervalt de vraag;
//  - een ouder kan het bij een minderjarig kind altijd weer aanzetten, en
//    beantwoordt de vraag; bij een meerderjarig kind beslist hij niets;
//  - een kind zonder e-mailadres heeft geen keuze: het meldt zich niet aan,
//    en zonder de ouders komt er niets aan.
//
// Over zichzelf of over een eigen kind, dus geen apart recht. Wie handelt,
// komt uit het token; voor welk kind, uit het verzoek — en dat het mag, uit
// ouder_kind.

import { json, fout, leesJson } from '../lib/http.js';
import { logSchrijf } from '../lib/logboek.js';
import { verwittig } from '../lib/verwittigen.js';
import { meelezen, oudersVan, kinderenVan, magNamens } from '../lib/namens.js';

async function persoonRij(db, id) {
  return db
    .prepare(`SELECT id, voornaam, achternaam, email, geboortedatum, ouders_meelezen FROM personen WHERE id = ?`)
    .bind(id)
    .first();
}

async function openVraag(db, kindId) {
  const r = await db
    .prepare(
      `SELECT t.ouder_id, t.antwoord, p.voornaam, p.achternaam
         FROM ouder_toestemming t JOIN personen p ON p.id = t.ouder_id
        WHERE t.kind_id = ? ORDER BY p.voornaam`
    )
    .bind(kindId)
    .all();
  return r.results ?? [];
}

async function zet(db, kindId, waarde) {
  await db
    .prepare(`UPDATE personen SET ouders_meelezen = ?, gewijzigd = datetime('now') WHERE id = ?`)
    .bind(waarde, kindId)
    .run();
}

async function vraagIntrekken(db, kindId) {
  await db.prepare(`DELETE FROM ouder_toestemming WHERE kind_id = ?`).bind(kindId).run();
}

function stand(kind, ouders, vraag) {
  const m = meelezen(kind);
  return {
    aan: m.aan,
    verplicht: m.verplicht,
    minderjarig: m.minderjarig,
    standaard: m.standaard,
    ouders: ouders.map((o) => `${o.voornaam} ${o.achternaam}`.trim()),
    // Een openstaande vraag: wie al ja zei, en op wie het nog wacht.
    vraag: vraag.length
      ? {
          ja: vraag.filter((v) => v.antwoord === 'ja').map((v) => `${v.voornaam} ${v.achternaam}`.trim()),
          wacht_op: vraag.filter((v) => !v.antwoord).map((v) => `${v.voornaam} ${v.achternaam}`.trim()),
        }
      : null,
  };
}

/**
 * GET /api/meelezen — de stand voor mezelf (als ik ouders heb) en voor elk
 * van mijn kinderen, met wat er van mij gevraagd wordt.
 */
export async function meelezenTonen(ctx) {
  const { db, persoon } = ctx;
  const ik = await persoonRij(db, persoon.id);
  const mijnOuders = await oudersVan(db, persoon.id);
  const zelf = mijnOuders.length ? stand(ik, mijnOuders, await openVraag(db, persoon.id)) : null;

  const kinderen = [];
  for (const k of await kinderenVan(db, persoon.id)) {
    const vraag = await openVraag(db, k.id);
    kinderen.push({
      id: k.id,
      naam: `${k.voornaam} ${k.achternaam}`.trim(),
      ...stand(k, await oudersVan(db, k.id), vraag),
      // Wacht de vraag op mij?
      mijn_antwoord_gevraagd: vraag.some((v) => v.ouder_id === persoon.id && !v.antwoord),
    });
  }
  return json({ zelf, kinderen });
}

/**
 * POST /api/meelezen  { aan, kind_id? }
 * Zonder kind_id over mezelf, met kind_id als ouder over dat kind.
 */
export async function meelezenZetten(ctx) {
  const { db, persoon, request } = ctx;
  const body = (await leesJson(request)) ?? {};
  if (typeof body.aan !== 'boolean') return fout(400, 'aan moet true of false zijn');
  const kindId = body.kind_id ?? persoon.id;
  const alsOuder = kindId !== persoon.id;

  if (alsOuder && !(await magNamens(db, persoon.id, kindId))) {
    return fout(403, 'je bent geen ouder van deze persoon');
  }
  const kind = await persoonRij(db, kindId);
  if (!kind) return fout(404, 'die persoon bestaat niet');
  const ouders = await oudersVan(db, kindId);
  if (!ouders.length) return fout(400, 'er is geen ouder gekoppeld');

  const m = meelezen(kind);
  if (m.verplicht) {
    return fout(400, 'zonder eigen e-mailadres gaan de berichten altijd naar de ouders');
  }

  if (alsOuder) {
    if (!m.minderjarig) return fout(403, 'een meerderjarige beslist dit zelf');
    if (!body.aan) {
      return fout(400, 'een ouder zet dit niet uit; het kind vraagt het, en elke ouder beantwoordt de vraag');
    }
  }

  // Aanzetten: altijd meteen, door wie het ook mag. Een openstaande vraag om
  // uit te zetten vervalt dan.
  if (body.aan) {
    await zet(db, kindId, 1);
    await vraagIntrekken(db, kindId);
    await logSchrijf(db, {
      soort: 'beheer',
      wie: persoon.id,
      wat: 'berichten ook naar de ouders: aan',
      details: alsOuder ? `${kindId}, door een ouder` : kindId,
    });
    return json({ aan: true });
  }

  // Uitzetten door een meerderjarige: zijn eigen beslissing.
  if (!m.minderjarig) {
    await zet(db, kindId, 0);
    await vraagIntrekken(db, kindId);
    await logSchrijf(db, { soort: 'beheer', wie: persoon.id, wat: 'berichten ook naar de ouders: uit', details: kindId });
    return json({ aan: false });
  }

  // Uitzetten door een minderjarige: de vraag aan elke ouder. Tot iedereen ja
  // zei, blijft het aan.
  if (!m.aan) return json({ aan: false });
  await vraagIntrekken(db, kindId);
  for (const o of ouders) {
    await db.prepare(`INSERT INTO ouder_toestemming (kind_id, ouder_id) VALUES (?, ?)`).bind(kindId, o.id).run();
  }
  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: 'berichten ook naar de ouders: toestemming gevraagd om uit te zetten',
    details: `${kindId} — ${ouders.length} ouder(s)`,
  });
  // Rechtstreeks naar de ouders, niet via het kind: anders zou de vraag als
  // kopie van een bericht aan het kind vertrekken.
  for (const o of ouders) {
    await verwittig(ctx, {
      persoon_id: o.id,
      soort: 'toestemming',
      onderwerp: `${kind.voornaam} vraagt je toestemming`,
      kort: `${kind.voornaam} wil de berichten van de club niet meer naar de ouders laten gaan`,
      inhoud:
        `${kind.voornaam} ${kind.achternaam} wil dat berichten van de club enkel nog naar ` +
        `${kind.voornaam} zelf gaan, en niet meer ook naar de ouders.\n\n` +
        'Dat kan pas als elke ouder toestemming geeft. Antwoorden doe je in de app, bij Mijn voorkeuren.',
    });
  }
  return json({ aan: true, toestemming_gevraagd: ouders.length });
}

/** POST /api/meelezen/antwoord  { kind_id, ja } — een ouder beantwoordt de vraag. */
export async function meelezenAntwoord(ctx) {
  const { db, persoon, request } = ctx;
  const body = (await leesJson(request)) ?? {};
  if (typeof body.ja !== 'boolean' || !body.kind_id) return fout(400, 'kind_id en ja zijn nodig');

  const rij = await db
    .prepare(`SELECT antwoord FROM ouder_toestemming WHERE kind_id = ? AND ouder_id = ?`)
    .bind(body.kind_id, persoon.id)
    .first();
  if (!rij) return fout(404, 'er staat geen vraag voor je open');

  const kind = await persoonRij(db, body.kind_id);

  if (!body.ja) {
    // Eén nee is genoeg: de vraag is beslist, het blijft aan.
    await vraagIntrekken(db, body.kind_id);
    await logSchrijf(db, {
      soort: 'beheer',
      wie: persoon.id,
      wat: 'berichten ook naar de ouders: toestemming geweigerd',
      details: body.kind_id,
    });
    await verwittig(ctx, {
      persoon_id: body.kind_id,
      soort: 'toestemming',
      onderwerp: 'Je berichten gaan nog altijd ook naar je ouders',
      inhoud: 'Niet elke ouder gaf toestemming. Berichten van de club gaan dus nog altijd ook naar je ouders.',
    });
    return json({ beslist: true, aan: true });
  }

  await db
    .prepare(`UPDATE ouder_toestemming SET antwoord = 'ja', beantwoord_op = datetime('now') WHERE kind_id = ? AND ouder_id = ?`)
    .bind(body.kind_id, persoon.id)
    .run();
  return json(await rondAfAlsIedereenJa(ctx, body.kind_id, kind));
}

/**
 * Hebben alle ouders ja gezegd, dan gaat het uit en verdwijnt de vraag.
 * Ook na het ontkoppelen van een ouder die nog niet antwoordde.
 */
export async function rondAfAlsIedereenJa(ctx, kindId, kind = null) {
  const { db } = ctx;
  const vraag = await openVraag(db, kindId);
  if (!vraag.length || vraag.some((v) => v.antwoord !== 'ja')) return { beslist: false, aan: true };

  await zet(db, kindId, 0);
  await vraagIntrekken(db, kindId);
  await logSchrijf(db, {
    soort: 'beheer',
    wat: 'berichten ook naar de ouders: uit, met toestemming van elke ouder',
    details: kindId,
  });
  kind ??= await persoonRij(db, kindId);
  // Nu het uit staat, gaat dit enkel nog naar het kind zelf.
  await verwittig(ctx, {
    persoon_id: kindId,
    soort: 'toestemming',
    onderwerp: 'Je berichten gaan nu enkel nog naar jou',
    inhoud: `Elke ouder gaf toestemming. Berichten van de club gaan voortaan enkel nog naar ${kind?.voornaam ?? 'jou'}.`,
  });
  return { beslist: true, aan: false };
}
