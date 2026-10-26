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
import { alarmeerBijHerhaling } from './taakalarm.js';

export const PING_TAAK = 'supabase-ping';

// Status 530 of een time-out: het project is zo goed als zeker gepauzeerd, en
// dan raakt niemand nog binnen — ook de beheerder niet. Vandaar de uitleg in
// het bericht zelf: in de app kijken gaat dan niet.
export const UITLEG_GEPAUZEERD =
  'Zolang dit faalt, kan niemand aanmelden. Meestal is het Supabase-project ' +
  'gepauzeerd: open het in het Supabase-dashboard en kies Restore project.';

export async function pingSupabase(env, fetcher = fetch) {
  const basis = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!basis || !env.SUPABASE_PUBLISHABLE_KEY) {
    return { ok: false, melding: 'SUPABASE_URL of SUPABASE_PUBLISHABLE_KEY ontbreekt' };
  }

  try {
    // Enkel de apikey-header, geen Authorization. Een publishable-sleutel
    // (sb_publishable_...) hoort daar niet in en levert dan een 401 op; de
    // oudere anon-sleutel werkt met de apikey-header alleen ook.
    const antwoord = await fetcher(`${basis}/rest/v1/ping?select=id&limit=1`, {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
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
 * mislukkingen een onafgehandelde regel in het logboek én, sinds 0.30.1, een
 * bericht aan de beheerders (taakalarm.js). Tot dan bleef het bij het logboek,
 * en faalde de ping een maand lang zonder dat iemand het zag.
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
    await alarmeerBijHerhaling({ db, env }, PING_TAAK, uitslag.melding, UITLEG_GEPAUZEERD);
  }

  return uitslag;
}
