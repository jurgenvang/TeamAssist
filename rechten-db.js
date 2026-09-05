// Haalt op wat de rechtenfunctie nodig heeft. Gescheiden van rechten.js zodat
// die laatste zuiver blijft en zonder databank te testen valt.
//
// Rechten worden bij elk verzoek opnieuw berekend. Cachen zou betekenen dat een
// ingetrokken rol nog even blijft werken, en dat is precies het soort fout dat
// hier niemand mag maken.

import { bouwRechten } from './rechten.js';

/**
 * @param {D1Database} db
 * @param {string} persoonId
 * @param {string} seizoen  de code van het seizoen waarvoor gerekend wordt
 */
export async function rechtenVoor(db, persoonId, seizoen) {
  // ADMIN en FINADM staan zonder seizoen in de tabel; de ploegrollen met.
  const rollen = await db
    .prepare(
      `SELECT rol, team_guid FROM rollen
        WHERE persoon_id = ?
          AND (seizoen IS NULL OR seizoen = ?)`
    )
    .bind(persoonId, seizoen)
    .all();

  const alsSpeler = await db
    .prepare(`SELECT team_guid FROM team_spelers WHERE persoon_id = ? AND seizoen = ?`)
    .bind(persoonId, seizoen)
    .all();

  // Een ouder erft de ploegen van zijn kinderen. Filteren op voorwaarden en
  // niet op een lijst sleutels: D1 staat maar honderd gebonden parameters toe,
  // en een ouder met veel kinderen zou die grens anders raken.
  const viaKind = await db
    .prepare(
      `SELECT DISTINCT ts.team_guid
         FROM ouder_kind ok
         JOIN team_spelers ts ON ts.persoon_id = ok.kind_id
        WHERE ok.ouder_id = ? AND ts.seizoen = ?`
    )
    .bind(persoonId, seizoen)
    .all();

  return bouwRechten({
    rollen: rollen.results ?? [],
    ploegenAlsSpeler: (alsSpeler.results ?? []).map((r) => r.team_guid),
    ploegenViaKind: (viaKind.results ?? []).map((r) => r.team_guid),
  });
}
