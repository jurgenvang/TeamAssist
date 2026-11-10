// De instellingen van de module Officials (0.41.0, I1 fase 4d).
//
// Een eigen route naast /api/admin/instellingen, omdat die systeem.beheren
// vraagt: een YOADM beheert de officials zonder beheerder van de hele club te
// zijn, en moet deze twee toch kunnen zetten, zoals in YOAssist bij
// Configuratie. Enkel deze twee sleutels: de route kan geen andere
// instelling schrijven, ook niet met een gemaakt verzoek.
//
// Niet hier: `officials_automatisch`. Die zet de woensdagregel en de
// berichten in TeamAssist aan, en hoort bij de overschakeling (fase 5) — een
// beslissing voor wie de hele club beheert.

import { json, fout, leesJson } from '../lib/http.js';
import { logSchrijf } from '../lib/logboek.js';
import { instellingLezen } from '../routes/admin/instellingen.js';

export const OFFICIALS_INSTELBAAR = {
  // Wat er gebeurt met een eigen aanduiding als de bond een forfait meldt (forfait.js).
  forfait_aanduiding: { keuzes: ['vrijgeven', 'melden'], standaard: 'vrijgeven' },
  // Namen in de externe API en de agendafeed (extern.js).
  extern_namen: { keuzes: ['initialen', 'volledig'], standaard: 'initialen' },
};

/** GET /api/admin/officials/instellingen */
export async function officialsInstellingenTonen(ctx) {
  const uit = {};
  for (const [sleutel, def] of Object.entries(OFFICIALS_INSTELBAAR)) {
    uit[sleutel] = { waarde: await instellingLezen(ctx.db, sleutel, def.standaard), keuzes: def.keuzes };
  }
  return json({ instellingen: uit });
}

/** POST /api/admin/officials/instellingen  { sleutel, waarde } */
export async function officialsInstellingBewaren(ctx) {
  const body = (await leesJson(ctx.request)) ?? {};
  const def = OFFICIALS_INSTELBAAR[body.sleutel];
  if (!def) return fout(400, 'onbekende instelling');
  if (!def.keuzes.includes(body.waarde)) return fout(400, `waarde moet een van deze zijn: ${def.keuzes.join(', ')}`);
  const oud = await instellingLezen(ctx.db, body.sleutel, def.standaard);
  await ctx.db
    .prepare(`INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ON CONFLICT (sleutel) DO UPDATE SET waarde = excluded.waarde`)
    .bind(body.sleutel, body.waarde)
    .run();
  await logSchrijf(ctx.db, { soort: 'officials', wie: ctx.persoon.id, wat: `instelling ${body.sleutel}`, details: `${oud} → ${body.waarde}` });
  return json({ sleutel: body.sleutel, waarde: body.waarde });
}
