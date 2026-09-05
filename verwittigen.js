// Berichten versturen: de enige plaats die dat echt doet.
//
// Vastgelegd in de projectinstructies: "Berichten gaan altijd via
// verwittigen.js, nooit rechtstreeks naar mailer.js of push.js." Andere code
// roept nooit verstuurMail() rechtstreeks aan — enkel deze functie, die
// bericht_modus toepast en bepaalt wat er in het logboek en in `berichten`
// terechtkomt.
//
// bericht_modus bepaalt wat er met een bericht gebeurt:
//
//  'uit'      — niets versturen. Wel volledig opbouwen en loggen, zodat
//               zichtbaar is wat er verstuurd zou zijn zonder dat er ooit
//               een echte mail vertrekt. Staat bewust als standaard tot de
//               club echt van start gaat.
//  'omleiden' — echt versturen, maar naar één testadres in plaats van de
//               echte ontvanger. Komt niet in `berichten` terecht: de echte
//               persoon kreeg dit bericht niet, en 'Mijn berichten' zou
//               anders iets tonen dat nooit aankwam.
//  'normaal'  — echt versturen naar de echte ontvanger. Bij succes komt het
//               in `berichten`; bij een mislukking enkel in het logboek.

import { verstuurMail } from './mailer.js';
import { logSchrijf } from './logboek.js';

async function instelling(db, sleutel) {
  const rij = await db.prepare(`SELECT waarde FROM instellingen WHERE sleutel = ?`).bind(sleutel).first();
  return rij?.waarde || null;
}

/**
 * @param {object} ctx              { db, env } — dezelfde context als een route krijgt
 * @param {object} bericht
 * @param {string} bericht.persoon_id
 * @param {string} bericht.onderwerp
 * @param {string} bericht.inhoud
 * @param {string} bericht.kanaal   enkel 'mail' bestaat vandaag
 */
export async function verwittig(ctx, { persoon_id, onderwerp, inhoud, kanaal = 'mail' }) {
  const { db, env } = ctx;

  if (kanaal !== 'mail') {
    throw new Error(`kanaal '${kanaal}' bestaat nog niet — enkel mail is gebouwd`);
  }

  const persoon = await db.prepare(`SELECT email FROM personen WHERE id = ?`).bind(persoon_id).first();
  if (!persoon?.email) {
    await logSchrijf(db, {
      soort: 'fout',
      wat: 'bericht niet verstuurd: geen e-mailadres',
      details: `${persoon_id}: ${onderwerp}`,
      afgehandeld: 0,
    });
    return { verstuurd: false, reden: 'geen e-mailadres' };
  }

  const modus = (await instelling(db, 'bericht_modus')) || 'omleiden';

  if (modus === 'uit') {
    await logSchrijf(db, {
      soort: 'beheer',
      wat: 'bericht niet verstuurd (modus uit)',
      details: `${persoon.email}: ${onderwerp} — ${inhoud}`,
    });
    return { verstuurd: false, reden: 'modus uit' };
  }

  const van = (await instelling(db, 'mail_afzender')) || 'TeamAssist <noreply@teamassist.org>';
  let bestemming = persoon.email;

  if (modus === 'omleiden') {
    const omleidadres = await instelling(db, 'bericht_omleidadres');
    if (!omleidadres) {
      await logSchrijf(db, {
        soort: 'fout',
        wat: 'omleiden ingesteld maar geen omleidadres gevuld',
        details: onderwerp,
        afgehandeld: 0,
      });
      return { verstuurd: false, reden: 'geen omleidadres' };
    }
    bestemming = omleidadres;
  }

  try {
    await verstuurMail({ van, naar: bestemming, onderwerp, tekst: inhoud }, env);
  } catch (e) {
    await logSchrijf(db, {
      soort: 'fout',
      wat: 'bericht versturen mislukt',
      details: `${bestemming}: ${onderwerp} — ${e.message}`,
      afgehandeld: 0,
    });
    return { verstuurd: false, reden: e.message };
  }

  if (modus === 'omleiden') {
    await logSchrijf(db, {
      soort: 'beheer',
      wat: 'bericht verstuurd (omgeleid)',
      details: `voor ${persoon.email}, echt naar ${bestemming}: ${onderwerp}`,
    });
    return { verstuurd: true, omgeleid: true };
  }

  // modus === 'normaal': werkelijk aangekomen bij de echte persoon.
  await db
    .prepare(`INSERT INTO berichten (persoon_id, kanaal, onderwerp, inhoud) VALUES (?, ?, ?, ?)`)
    .bind(persoon_id, kanaal, onderwerp, inhoud)
    .run();

  return { verstuurd: true, omgeleid: false };
}
