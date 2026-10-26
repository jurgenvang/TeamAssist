// De voorkeuren van een official (0.38.0): herinneringen de avond ervoor en
// de ochtend zelf, en of collega's met wie hij samen fluit zijn gsm-nummer
// zien. Wie geen rij heeft, krijgt de standaard: alles aan. Een ouder zet ze
// voor zijn kind (namens), zoals hij ervoor invult.

import { json, fout, leesJson } from '../lib/http.js';
import { voorWie } from './routes.js';

const VELDEN = ['herinner_avond', 'herinner_ochtend', 'gsm_delen'];

async function lees(db, persoonId) {
  const r = await db.prepare(`SELECT ${VELDEN.join(', ')} FROM officials_voorkeuren WHERE persoon_id = ?`).bind(persoonId).first();
  return Object.fromEntries(VELDEN.map((v) => [v, r ? r[v] === 1 : true]));
}

/** GET /api/officials/voorkeuren[?namens=] */
export async function officialsVoorkeurenTonen(ctx) {
  const wie = await voorWie(ctx, new URL(ctx.request.url).searchParams.get('namens'));
  if (wie.fout) return wie.fout;
  if (!wie.rechten.mag('officials.opgeven')) return fout(403, 'geen Youth Official');
  return json({ namens: wie.namens, ...(await lees(ctx.db, wie.id)) });
}

/** POST /api/officials/voorkeuren  { namens?, herinner_avond?, herinner_ochtend?, gsm_delen? } */
export async function officialsVoorkeurenBewaren(ctx) {
  const { db } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const wie = await voorWie(ctx, body.namens);
  if (wie.fout) return wie.fout;
  if (!wie.rechten.mag('officials.opgeven')) return fout(403, 'geen Youth Official');

  // Enkel wat meegegeven is, verandert; de rest blijft wat het was.
  const nu = await lees(db, wie.id);
  for (const v of VELDEN) {
    if (body[v] === undefined) continue;
    if (typeof body[v] !== 'boolean') return fout(400, `${v} moet waar of onwaar zijn`);
    nu[v] = body[v];
  }
  await db
    .prepare(
      `INSERT INTO officials_voorkeuren (persoon_id, herinner_avond, herinner_ochtend, gsm_delen) VALUES (?, ?, ?, ?)
       ON CONFLICT (persoon_id) DO UPDATE SET herinner_avond = excluded.herinner_avond,
         herinner_ochtend = excluded.herinner_ochtend, gsm_delen = excluded.gsm_delen`
    )
    .bind(wie.id, nu.herinner_avond ? 1 : 0, nu.herinner_ochtend ? 1 : 0, nu.gsm_delen ? 1 : 0)
    .run();
  return json({ namens: wie.namens, ...nu });
}
