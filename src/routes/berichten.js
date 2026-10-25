// Mijn berichten en de mededeling (0.28.0, uit YOAssist).
//
// Over jezelf, dus geen apart recht: de persoon komt uit het token (ctx.persoon),
// nooit uit de request body of de URL. Elke query hier filtert op dat id, ook
// bij markeren en verwijderen — een id van iemand anders doet gewoon niets.

import { json, fout, leesJson } from '../lib/http.js';
import { inDoelgroep } from '../lib/doelgroep.js';

const KORT_MAX = 160;

/**
 * Eén regel voor de lijst. Wat zelf geen `kort` meegaf (de meeste triggers),
 * krijgt de eerste niet-lege regel van de inhoud — ingekort met '…', niet
 * midden in een woord afgebroken zonder teken.
 */
export function korteRegel(kort, inhoud) {
  const bron = (kort ?? String(inhoud ?? '').split('\n').find((r) => r.trim()) ?? '').trim();
  return bron.length > KORT_MAX ? `${bron.slice(0, KORT_MAX - 1).trimEnd()}…` : bron;
}

/** GET /api/berichten — wat ik ontving, nieuwste eerst. */
export async function berichtenTonen(ctx) {
  const { db, persoon } = ctx;
  const rijen = await db
    .prepare(
      `SELECT id, soort, onderwerp, kort, inhoud, verzonden, gelezen_op
         FROM berichten WHERE persoon_id = ?
        ORDER BY id DESC LIMIT 100`
    )
    .bind(persoon.id)
    .all();
  const berichten = (rijen.results ?? []).map((r) => {
    const kort = korteRegel(r.kort, r.inhoud);
    return {
      id: r.id,
      soort: r.soort,
      onderwerp: r.onderwerp,
      kort,
      // Enkel meegeven als er meer is dan de korte regel: anders zou 'lees
      // meer' dezelfde zin nog eens tonen.
      inhoud: String(r.inhoud ?? '').trim() && String(r.inhoud).trim() !== kort ? r.inhoud : null,
      verzonden: r.verzonden,
      gelezen: Boolean(r.gelezen_op),
    };
  });
  return json({ ongelezen: berichten.filter((b) => !b.gelezen).length, berichten });
}

/** GET /api/berichten/ongelezen — enkel de teller, licht genoeg om te herhalen. */
export async function berichtenOngelezen(ctx) {
  const { db, persoon } = ctx;
  const n = await db
    .prepare(`SELECT count(*) AS n FROM berichten WHERE persoon_id = ? AND gelezen_op IS NULL`)
    .bind(persoon.id)
    .first('n');
  return json({ ongelezen: n ?? 0 });
}

/** POST /api/berichten/gelezen  { id } — of { alles: true } */
export async function berichtGelezen(ctx) {
  const { db, persoon, request } = ctx;
  const body = (await leesJson(request)) ?? {};
  if (body.alles === true) {
    const res = await db
      .prepare(`UPDATE berichten SET gelezen_op = datetime('now') WHERE persoon_id = ? AND gelezen_op IS NULL`)
      .bind(persoon.id)
      .run();
    return json({ gewijzigd: res.meta?.changes ?? 0 });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id)) return fout(400, 'id ontbreekt');
  const res = await db
    .prepare(`UPDATE berichten SET gelezen_op = datetime('now') WHERE id = ? AND persoon_id = ? AND gelezen_op IS NULL`)
    .bind(id, persoon.id)
    .run();
  return json({ gewijzigd: res.meta?.changes ?? 0 });
}

/** POST /api/berichten/verwijderen  { id } */
export async function berichtVerwijderen(ctx) {
  const { db, persoon, request } = ctx;
  const id = Number((await leesJson(request))?.id);
  if (!Number.isInteger(id)) return fout(400, 'id ontbreekt');
  const res = await db
    .prepare(`DELETE FROM berichten WHERE id = ? AND persoon_id = ?`)
    .bind(id, persoon.id)
    .run();
  return json({ verwijderd: res.meta?.changes ?? 0 });
}

/**
 * GET /api/mededeling — de banner, of niets.
 *
 * Verlopen, weggeklikt of niet voor jou bedoeld betekent hetzelfde: geen
 * banner. Of ze voor jou bedoeld is, beslist dezelfde voorwaarde als wie ze
 * als bericht kreeg (doelgroep.js) — los van of je een account had op het
 * moment van plaatsen.
 */
export async function mededelingTonen(ctx) {
  const { db, persoon } = ctx;
  const rij = await db
    .prepare(
      `SELECT m.id, m.tekst, m.link, m.link_tekst, m.geldig_tot
         FROM mededelingen m
        WHERE m.actief = 1
          AND m.geldig_tot > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          AND NOT EXISTS (SELECT 1 FROM mededeling_gezien g
                           WHERE g.mededeling_id = m.id AND g.persoon_id = ?1)
          AND ${inDoelgroep('?1', 'm')}
        ORDER BY m.id DESC LIMIT 1`
    )
    .bind(persoon.id)
    .first();
  return json({ mededeling: rij ?? null });
}

/** POST /api/mededeling/wegklikken  { id } */
export async function mededelingWegklikken(ctx) {
  const { db, persoon, request } = ctx;
  const id = Number((await leesJson(request))?.id);
  if (!Number.isInteger(id)) return fout(400, 'id ontbreekt');
  const bestaat = await db.prepare(`SELECT 1 FROM mededelingen WHERE id = ?`).bind(id).first();
  if (!bestaat) return fout(404, 'onbekende mededeling');
  await db
    .prepare(
      `INSERT INTO mededeling_gezien (mededeling_id, persoon_id) VALUES (?, ?)
       ON CONFLICT (mededeling_id, persoon_id) DO NOTHING`
    )
    .bind(id, persoon.id)
    .run();
  return json({ weggeklikt: true });
}
