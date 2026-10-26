// De beheerders verwittigen als een geplande taak blijft mislukken.
//
// Tot 0.30.1 bleef het bij een onafgehandelde regel in het logboek. Dat bleek
// niet genoeg: de supabase-ping faalde een maand lang elke nacht, het project
// lag stil, en niemand merkte het tot aanmelden niet meer lukte. Een
// logboekregel zie je enkel als je gaat kijken.
//
// Dus: bij de tweede mislukking na elkaar een bericht naar elke actieve
// ADMIN, en zolang het blijft mislukken één keer per week opnieuw — vaker
// zou bij de wedstrijdsync (vier keer per dag) een stroom mails geven over
// één en hetzelfde probleem. Via verwittigen.js, zoals elk bericht; de mail
// gaat via Resend en komt dus ook aan als Supabase zelf stilligt.

import { logSchrijf } from './logboek.js';
import { verwittig } from './verwittigen.js';

export const HERHAAL_DAGEN = 7;

/** Hoeveel keer na elkaar deze taak nu mislukt is, de laatste run inbegrepen. */
export async function mislukkingenNaElkaar(db, taak) {
  const rij = await db
    .prepare(
      `SELECT count(*) AS n FROM taak_runs
        WHERE taak = ? AND status = 'fout'
          AND id > ifnull((SELECT max(id) FROM taak_runs WHERE taak = ? AND status = 'ok'), 0)`
    )
    .bind(taak, taak)
    .first();
  return rij?.n ?? 0;
}

function alarmregel(taak) {
  return `${taak}: beheerders verwittigd`;
}

/**
 * Na een mislukte run aanroepen. Beslist zelf of er een bericht moet
 * vertrekken. Gooit nooit: een alarm dat mislukt, mag de taak niet nog eens
 * laten mislukken — het staat dan wel in het logboek.
 *
 * @param {{db, env}} ctx
 * @param {string} taak       naam zoals in taak_runs
 * @param {string} melding    wat de laatste run teruggaf
 * @param {string} [uitleg]   wat de beheerder eraan kan doen
 * @returns {Promise<number>} aantal verwittigde beheerders
 */
export async function alarmeerBijHerhaling(ctx, taak, melding, uitleg = '') {
  const { db } = ctx;
  try {
    const reeks = await mislukkingenNaElkaar(db, taak);
    if (reeks < 2) return 0;

    // Bij de tweede mislukking altijd — ook als er een week geleden al een
    // alarm was over een vorige reeks. Daarna enkel als het laatste alarm
    // over deze taak een week oud is.
    if (reeks > 2) {
      const recent = await db
        .prepare(`SELECT 1 AS ja FROM logboek WHERE soort = 'taak' AND wat = ? AND tijdstip > datetime('now', ?)`)
        .bind(alarmregel(taak), `-${HERHAAL_DAGEN} days`)
        .first();
      if (recent) return 0;
    }

    const beheerders = await db
      .prepare(
        `SELECT DISTINCT p.id FROM rollen r JOIN personen p ON p.id = r.persoon_id
          WHERE r.rol = 'ADMIN' AND p.actief = 1`
      )
      .all();
    const ontvangers = beheerders.results ?? [];
    // Geen beheerder (een verse installatie): niets te versturen, en geen
    // regel 'verwittigd' die doet alsof — de onafgehandelde regel van de
    // aanroeper staat er al.
    if (!ontvangers.length) return 0;

    const onderwerp = `TeamAssist: ${taak} mislukt al ${reeks} keer na elkaar`;
    const inhoud =
      `De geplande taak '${taak}' is ${reeks} keer na elkaar mislukt.\n\n` +
      `Laatste melding: ${melding}\n` +
      (uitleg ? `\n${uitleg}\n` : '') +
      `\nZolang het blijft mislukken, krijg je dit bericht één keer per week.`;

    for (const { id } of ontvangers) {
      await verwittig(ctx, { persoon_id: id, onderwerp, inhoud, soort: 'systeem', kort: onderwerp });
    }

    await logSchrijf(db, {
      soort: 'taak',
      wat: alarmregel(taak),
      details: `${ontvangers.length} beheerder(s), na ${reeks} mislukkingen: ${melding}`,
    });
    return ontvangers.length;
  } catch (e) {
    await logSchrijf(db, {
      soort: 'fout',
      wat: `${taak}: beheerders verwittigen mislukt`,
      details: String(e?.message || e),
      afgehandeld: 0,
    }).catch(() => {});
    return 0;
  }
}
