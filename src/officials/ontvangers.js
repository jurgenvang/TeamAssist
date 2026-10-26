// Wie een bericht van de module Officials krijgt (0.34.0).
//
// Uit de rollen, nooit uit een vaste lijst adressen: wie er dat seizoen ook
// beheert of fluit, krijgt het. Telkens via verwittig() per persoon, zodat
// kanaal, ouders en Mijn berichten vanzelf kloppen.

import { verwittig } from '../lib/verwittigen.js';

async function metRol(db, rollen) {
  const r = await db
    .prepare(
      `SELECT DISTINCT p.id FROM rollen r JOIN personen p ON p.id = r.persoon_id
        WHERE r.rol IN (${rollen.map(() => '?').join(', ')}) AND p.actief = 1
        ORDER BY p.id`
    )
    .bind(...rollen)
    .all();
  return (r.results ?? []).map((x) => x.id);
}

/** Wie de officials beheert: elke actieve YOADM en ADMIN. */
export const beheerders = (db) => metRol(db, ['YOADM', 'ADMIN']);

/** Wie ook vanaf U14 fluit: elke actieve YO+. */
export const yoPlus = (db) => metRol(db, ['YOPLUS']);

/**
 * Een bericht naar een lijst personen. Gooit nooit: een mislukte mail mag de
 * woensdagregel zelf niet laten mislukken — die staat dan al in de databank.
 */
export async function verwittigAllen(ctx, ids, { onderwerp, tekst, kort = null }) {
  let verstuurd = 0;
  for (const persoon_id of ids) {
    try {
      const r = await verwittig(ctx, { persoon_id, soort: 'officials', onderwerp, inhoud: tekst, kort });
      if (r?.verstuurd) verstuurd += 1;
    } catch {
      // verwittig() logt zelf; hier enkel niet laten doorvallen.
    }
  }
  return verstuurd;
}
