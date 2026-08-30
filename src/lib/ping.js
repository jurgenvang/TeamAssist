// Houdt het Supabase-project wakker.
//
// Een gratis project dat een week lang te weinig databankactiviteit krijgt,
// wordt gepauzeerd. Een gepauzeerd project accepteert geen verbindingen, en dan
// raakt niemand nog binnen. Voor een clubapp is dat geen randgeval maar een
// zekerheid: in juli ligt alles stil.
//
// Vandaar een dagelijkse leesoproep op een tabel `ping` in het Supabase-project.
// Dat die tabel bestaat en leesbaar is voor de anon-sleutel, hoort bij het
// opzetten — zie de release-uitleg.
//
// Deze taak mag niet stil falen. Een week lang niets merken betekent dat de app
// dichtgaat op een moment dat niemand verwacht.

import { logSchrijf } from './logboek.js';

export const PING_TAAK = 'supabase-ping';

export async function pingSupabase(env, fetcher = fetch) {
  const basis = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!basis || !env.SUPABASE_ANON_SLEUTEL) {
    return { ok: false, melding: 'SUPABASE_URL of SUPABASE_ANON_SLEUTEL ontbreekt' };
  }

  try {
    const antwoord = await fetcher(`${basis}/rest/v1/ping?select=id&limit=1`, {
      headers: {
        apikey: env.SUPABASE_ANON_SLEUTEL,
        authorization: `Bearer ${env.SUPABASE_ANON_SLEUTEL}`,
      },
    });
    if (!antwoord.ok) {
      return { ok: false, melding: `status ${antwoord.status}` };
    }
    return { ok: true, melding: 'wakker' };
  } catch (e) {
    return { ok: false, melding: String(e.message || e) };
  }
}

/**
 * Voert de ping uit en houdt bij hoe het ging. Bij twee opeenvolgende
 * mislukkingen hoort er bericht naar de beheerders te gaan; dat kanaal bestaat
 * pas in fase 5, dus voorlopig komt het als onafgehandelde regel in het logboek
 * — die blijft staan tot iemand ze wegzet.
 */
export async function voerPingUit(db, env, fetcher = fetch) {
  const uitslag = await pingSupabase(env, fetcher);

  await db
    .prepare(
      `INSERT INTO taak_runs (taak, geeindigd, status, melding)
            VALUES (?, datetime('now'), ?, ?)`
    )
    .bind(PING_TAAK, uitslag.ok ? 'ok' : 'fout', uitslag.melding)
    .run();

  if (!uitslag.ok) {
    const vorige = await db
      .prepare(
        `SELECT status FROM taak_runs
          WHERE taak = ? ORDER BY id DESC LIMIT 2`
      )
      .bind(PING_TAAK)
      .all();
    const rijen = vorige.results ?? [];
    const tweeKeerFout = rijen.length >= 2 && rijen.every((r) => r.status === 'fout');

    await logSchrijf(db, {
      soort: 'taak',
      wat: tweeKeerFout
        ? 'supabase-ping twee keer na elkaar mislukt — het project kan gepauzeerd worden'
        : 'supabase-ping mislukt',
      details: uitslag.melding,
      afgehandeld: tweeKeerFout ? 0 : 1,
    });
  }

  return uitslag;
}
