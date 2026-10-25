// Meldingen op dit toestel: inschrijven, uitschrijven, testen (0.29.0).
//
// Over jezelf: de persoon komt uit het token, nooit uit de body. Uitschrijven
// filtert altijd mee op die persoon — niemand kan andermans toestel afmelden
// door een endpoint te raden.

import { json, fout, leesJson } from '../lib/http.js';
import { verwittigTest } from '../lib/verwittigen.js';

/**
 * POST /api/push/abonneer  { endpoint, p256dh, auth, toestel? }
 *
 * Eén rij per toestel; hetzelfde endpoint opnieuw inschrijven vervangt de
 * rij (ook als het toestel intussen van iemand anders is: dan hoort het nu
 * bij wie zich aanmeldde). Wie enkel mail had, krijgt 'beide': een toestel
 * inschrijven zonder dat er ooit iets naartoe gaat, heeft geen zin — en de
 * mail blijft, want push is niet op elk toestel betrouwbaar.
 */
export async function pushAbonneer(ctx) {
  const { db, persoon, request } = ctx;
  const body = (await leesJson(request)) ?? {};
  const endpoint = String(body.endpoint ?? '').trim();
  const p256dh = String(body.p256dh ?? '').trim();
  const auth = String(body.auth ?? '').trim();
  if (!endpoint || !p256dh || !auth) return fout(400, 'endpoint, p256dh en auth zijn alle drie nodig');
  try {
    if (new URL(endpoint).protocol !== 'https:') return fout(400, 'een push-endpoint moet https zijn');
  } catch {
    return fout(400, 'ongeldig endpoint');
  }

  await db
    .prepare(
      `INSERT INTO push_abonnementen (persoon_id, endpoint, p256dh, auth, toestel)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE
         SET persoon_id = excluded.persoon_id, p256dh = excluded.p256dh,
             auth = excluded.auth, toestel = excluded.toestel, mislukt = 0`
    )
    .bind(persoon.id, endpoint, p256dh, auth, String(body.toestel ?? '').slice(0, 100) || null)
    .run();

  await db
    .prepare(`UPDATE personen SET kanaal_voorkeur = 'beide', gewijzigd = datetime('now') WHERE id = ? AND kanaal_voorkeur = 'mail'`)
    .bind(persoon.id)
    .run();
  const rij = await db.prepare(`SELECT kanaal_voorkeur FROM personen WHERE id = ?`).bind(persoon.id).first();
  return json({ ingeschreven: true, kanaal_voorkeur: rij?.kanaal_voorkeur });
}

/**
 * POST /api/push/afmelden  { endpoint }
 *
 * Was dit het laatste toestel van iemand die enkel push wilde, dan gaat de
 * voorkeur terug naar mail. Anders zou elk bericht via de terugval toch mail
 * worden, met telkens een logregel 'voorkeur push, geen toestel'.
 */
export async function pushAfmelden(ctx) {
  const { db, persoon, request } = ctx;
  const endpoint = String((await leesJson(request))?.endpoint ?? '').trim();
  if (!endpoint) return fout(400, 'endpoint ontbreekt');
  const res = await db
    .prepare(`DELETE FROM push_abonnementen WHERE endpoint = ? AND persoon_id = ?`)
    .bind(endpoint, persoon.id)
    .run();

  const over = await db.prepare(`SELECT count(*) AS n FROM push_abonnementen WHERE persoon_id = ?`).bind(persoon.id).first('n');
  if (!over) {
    await db
      .prepare(`UPDATE personen SET kanaal_voorkeur = 'mail', gewijzigd = datetime('now') WHERE id = ? AND kanaal_voorkeur = 'push'`)
      .bind(persoon.id)
      .run();
  }
  const rij = await db.prepare(`SELECT kanaal_voorkeur FROM personen WHERE id = ?`).bind(persoon.id).first();
  return json({ verwijderd: res.meta?.changes ?? 0, toestellen: over ?? 0, kanaal_voorkeur: rij?.kanaal_voorkeur });
}

/** GET /api/push/toestellen — mijn ingeschreven toestellen. */
export async function pushToestellen(ctx) {
  const { db, persoon } = ctx;
  const rijen = await db
    .prepare(`SELECT id, toestel, aangemaakt, laatst_ok, mislukt FROM push_abonnementen WHERE persoon_id = ? ORDER BY id`)
    .bind(persoon.id)
    .all();
  return json({ toestellen: rijen.results ?? [] });
}

/** POST /api/push/test — een testmelding naar mijn eigen toestellen. */
export async function pushTest(ctx) {
  const uit = await verwittigTest(ctx, ctx.persoon.id);
  return json(uit);
}
