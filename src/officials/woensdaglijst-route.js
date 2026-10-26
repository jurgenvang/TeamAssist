// GET /api/admin/officials/woensdaglijst — de laatst ontvangen woensdaglijsten
// (0.34.0, uit YOAssist V39).
//
// Vooral om na te gaan of de lijst binnenkomt: bij het instellen van Email
// Routing en het doorsturen is dit de enige plek waar je dat ziet, zonder op
// woensdag 14 uur te moeten wachten.

import { json } from '../lib/http.js';

const aantal = (s, sleutel = null) => {
  try {
    const v = JSON.parse(s ?? (sleutel ? '{}' : '[]'));
    return (sleutel ? v[sleutel] ?? [] : v).length;
  } catch {
    return 0;
  }
};

export async function woensdaglijstTonen(ctx) {
  const r = await ctx.db
    .prepare(
      `SELECT id, ontvangen, onderwerp, weekend_van, weekend_tot, aantal_rijen, eigen, meldingen,
              status, fout, verwerkt_op
         FROM officials_vbl_lijsten ORDER BY id DESC LIMIT 8`
    )
    .all();
  return json({
    lijsten: (r.results ?? []).map((x) => ({
      id: x.id,
      ontvangen: x.ontvangen,
      onderwerp: x.onderwerp,
      van: x.weekend_van,
      tot: x.weekend_tot,
      aantal_rijen: x.aantal_rijen,
      aantal_eigen: aantal(x.eigen),
      niet_gekoppeld: aantal(x.meldingen, 'nietGekoppeld'),
      status: x.status,
      fout: x.fout,
      verwerkt_op: x.verwerkt_op,
    })),
  });
}
