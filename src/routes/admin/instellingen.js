// Clubbrede instellingen.
//
// Bewust een korte, vaste lijst en geen vrije sleutel/waarde-opslag van
// buitenaf: wat hier gezet kan worden, staat in de code. Anders kan een
// verzoek een sleutel schrijven die ergens anders als schakelaar dienstdoet.

import { json, fout, leesJson } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';

export const INSTELBAAR = {
  clubnaam: { soort: 'tekst' },
  club_guid: { soort: 'tekst' },
  bericht_modus: { soort: 'keuze', keuzes: ['uit', 'omleiden', 'normaal'] },
  bericht_omleidadres: { soort: 'tekst' },
  // Laat een beheerder kiezen met welke rol hij wil werken. Staat uit bij een
  // verse installatie en hoort uit te staan zodra de club er echt mee werkt.
  testrol_toegelaten: { soort: 'vlag' },
};

export async function instellingLezen(db, sleutel, standaard = null) {
  const rij = await db.prepare(`SELECT waarde FROM instellingen WHERE sleutel = ?`).bind(sleutel).first();
  return rij?.waarde ?? standaard;
}

export async function instellingenTonen(ctx) {
  const { db } = ctx;
  const rijen = await db.prepare(`SELECT sleutel, waarde FROM instellingen`).all();
  const gevonden = Object.fromEntries((rijen.results ?? []).map((r) => [r.sleutel, r.waarde]));

  // Ook de instellingen die nog niet in de databank staan, met hun standaard.
  // Een installatie van vóór een nieuwe instelling mist die rij anders.
  const uit = {};
  for (const [sleutel, def] of Object.entries(INSTELBAAR)) {
    uit[sleutel] = { waarde: gevonden[sleutel] ?? (def.soort === 'vlag' ? '0' : ''), ...def };
  }
  return json({ instellingen: uit });
}

export async function instellingBewaren(ctx) {
  const { db, persoon, request } = ctx;
  const body = await leesJson(request);
  const sleutel = body?.sleutel;
  const def = INSTELBAAR[sleutel];
  if (!def) return fout(400, 'onbekende instelling');

  let waarde = body?.waarde;
  if (def.soort === 'vlag') waarde = body?.waarde ? '1' : '0';
  else waarde = String(waarde ?? '').trim();

  if (def.soort === 'keuze' && !def.keuzes.includes(waarde)) {
    return fout(400, `waarde moet een van deze zijn: ${def.keuzes.join(', ')}`);
  }

  await db
    .prepare(
      `INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?)
       ON CONFLICT (sleutel) DO UPDATE SET waarde = excluded.waarde, gewijzigd = datetime('now')`
    )
    .bind(sleutel, waarde)
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: 'instelling gewijzigd',
    details: `${sleutel} = ${waarde}`,
  });

  return json({ sleutel, waarde });
}
