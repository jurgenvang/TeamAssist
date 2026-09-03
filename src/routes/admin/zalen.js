// Zalen en hun blokken.
//
// Clubbrede infrastructuur, dus enkel ADMIN. Een blok verplaatsen raakt
// mogelijk andere ploegen; sluitingen mag ook COORD melden, want die hoort het
// meestal het eerst.

import { json, fout, leesJson } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';

function nieuwId() {
  return `z-${crypto.randomUUID()}`;
}

export async function zalenTonen(ctx) {
  const { db, seizoen } = ctx;
  const zalen = await db
    .prepare(`SELECT * FROM zalen WHERE actief = 1 ORDER BY naam`)
    .all();
  const blokken = await db
    .prepare(`SELECT * FROM zaal_blokken WHERE seizoen = ? ORDER BY weekdag, begin`)
    .bind(seizoen.code)
    .all();
  const sluitingen = await db
    .prepare(`SELECT * FROM zaal_sluitingen WHERE tot >= date('now') ORDER BY van`)
    .all();

  const perZaal = new Map();
  for (const b of blokken.results ?? []) {
    if (!perZaal.has(b.zaal_id)) perZaal.set(b.zaal_id, []);
    perZaal.get(b.zaal_id).push(b);
  }

  return json({
    zalen: (zalen.results ?? []).map((z) => ({ ...z, blokken: perZaal.get(z.id) ?? [] })),
    sluitingen: sluitingen.results ?? [],
  });
}

export async function zaalAanmaken(ctx) {
  const { db, persoon, request } = ctx;
  const body = await leesJson(request);
  const naam = (body?.naam ?? '').trim();
  if (!naam) return fout(400, 'naam ontbreekt');

  const id = nieuwId();
  await db
    .prepare(`INSERT INTO zalen (id, naam, adres, vbl_acc_guid) VALUES (?, ?, ?, ?)`)
    .bind(id, naam, body?.adres || null, body?.vbl_acc_guid || null)
    .run();

  await logSchrijf(db, { soort: 'beheer', wie: persoon.id, wat: 'zaal aangemaakt', details: naam });
  return json({ id, naam });
}

export async function blokAanmaken(ctx) {
  const { db, persoon, request, seizoen } = ctx;
  const body = await leesJson(request);
  const { zaal_id, weekdag, begin, einde } = body ?? {};

  if (!zaal_id || !weekdag || !begin || !einde) return fout(400, 'zaal_id, weekdag, begin en einde zijn verplicht');
  if (weekdag < 1 || weekdag > 7) return fout(400, 'weekdag moet 1 (maandag) tot 7 (zondag) zijn');
  if (einde <= begin) return fout(400, 'einde moet na begin liggen');

  const zaal = await db.prepare(`SELECT id FROM zalen WHERE id = ?`).bind(zaal_id).first();
  if (!zaal) return fout(404, 'die zaal bestaat niet');

  const uit = await db
    .prepare(
      `INSERT INTO zaal_blokken (zaal_id, seizoen, weekdag, begin, einde)
            VALUES (?, ?, ?, ?, ?)`
    )
    .bind(zaal_id, seizoen.code, weekdag, begin, einde)
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: 'zaalblok aangemaakt',
    details: `${zaal_id} dag ${weekdag} ${begin}-${einde}`,
  });
  return json({ id: uit.meta.last_row_id });
}

export async function blokVerwijderen(ctx) {
  const { db, persoon, request } = ctx;
  const body = await leesJson(request);
  const id = body?.id;
  if (!id) return fout(400, 'id ontbreekt');

  // Een reeks die dit blok gebruikte, blijft bestaan met haar eigen uur en
  // zaal — het blok is enkel een hulpmiddel om vrije uren te vinden, geen
  // vereiste voor een reeks om te draaien.
  await db.prepare(`DELETE FROM zaal_blokken WHERE id = ?`).bind(id).run();
  await logSchrijf(db, { soort: 'beheer', wie: persoon.id, wat: 'zaalblok verwijderd', details: String(id) });
  return json({ id });
}

/** Welke blokken van een zaal in een gegeven week nog niet aan een reeks hangen. */
export async function vrijeBlokken(ctx) {
  const { db, request, seizoen } = ctx;
  const zaalId = new URL(request.url).searchParams.get('zaal');
  if (!zaalId) return fout(400, 'zaal ontbreekt');

  const blokken = await db
    .prepare(`SELECT * FROM zaal_blokken WHERE zaal_id = ? AND seizoen = ? ORDER BY weekdag, begin`)
    .bind(zaalId, seizoen.code)
    .all();

  const reeksen = await db
    .prepare(
      `SELECT weekdag, begin, einde FROM trainingsreeksen
        WHERE zaal_id = ? AND seizoen = ? AND actief = 1`
    )
    .bind(zaalId, seizoen.code)
    .all();

  const bezet = new Set((reeksen.results ?? []).map((r) => `${r.weekdag}-${r.begin}-${r.einde}`));
  const vrij = (blokken.results ?? []).filter((b) => !bezet.has(`${b.weekdag}-${b.begin}-${b.einde}`));

  return json({ vrij });
}

export async function sluitingAanmaken(ctx) {
  const { db, persoon, request } = ctx;
  const body = await leesJson(request);
  const { zaal_id, van, tot, reden } = body ?? {};
  if (!zaal_id || !van || !tot) return fout(400, 'zaal_id, van en tot zijn verplicht');
  if (tot < van) return fout(400, 'tot moet na van liggen');

  const uit = await db
    .prepare(`INSERT INTO zaal_sluitingen (zaal_id, van, tot, reden) VALUES (?, ?, ?, ?)`)
    .bind(zaal_id, van, tot, reden || null)
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: 'zaalsluiting gemeld',
    details: `${zaal_id} ${van} tot ${tot}${reden ? ` — ${reden}` : ''}`,
    // Onafgehandeld: dit hoort iemand te laten kijken of getroffen trainingen
    // een alternatief nodig hebben.
    afgehandeld: 0,
  });
  return json({ id: uit.meta.last_row_id });
}
