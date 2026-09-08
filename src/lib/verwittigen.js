// Berichten versturen: de enige plaats die dat echt doet.
//
// Vastgelegd in de projectinstructies: "Berichten gaan altijd via
// verwittigen.js, nooit rechtstreeks naar mailer.js of push.js." Andere code
// roept nooit verstuurMail() rechtstreeks aan — enkel deze functie, die
// bericht_modus toepast en bepaalt wat er in het logboek en in `berichten`
// terechtkomt.
//
// Welk kanaal gebruikt wordt, is sinds T16 geen keuze van de aanroeper meer.
// De aanroeper zegt enkel wie iets moet weten en wat — deze functie zelf
// bepaalt hoe, aan de hand van `personen.kanaal_voorkeur` (mail/push/beide,
// ingesteld bij Mijn voorkeuren, T6). Vóór T16 werd die kolom nergens
// gelezen: iedereen kreeg mail, ongeacht wat hij instelde. Zolang er geen
// push-kanaal bestaat, blijft mail het enige werkelijke kanaal — wie 'push'
// koos, krijgt voorlopig toch mail, met een aparte, niet-alarmerende
// logregel zodat dat zichtbaar blijft tot push er is.
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
 *
 * Geen kanaal-parameter meer: de aanroeper schrijft niet voor via welk kanaal
 * er verstuurd wordt, dat bepaalt deze functie zelf aan de hand van
 * `personen.kanaal_voorkeur` (mail/push/beide, ingesteld bij Mijn
 * voorkeuren). Zolang er geen push-kanaal bestaat, is mail het enige
 * werkelijke kanaal — wie 'push' koos, krijgt voorlopig toch mail in plaats
 * van niets, maar dat wordt apart gelogd. Zo blijft zichtbaar wie een keuze
 * maakte die nog niet gehonoreerd kan worden, in plaats van dat stilzwijgend
 * te negeren tot push ooit gebouwd wordt.
 */
export async function verwittig(ctx, { persoon_id, onderwerp, inhoud }) {
  const { db, env } = ctx;

  const persoon = await db
    .prepare(`SELECT email, kanaal_voorkeur FROM personen WHERE id = ?`)
    .bind(persoon_id)
    .first();
  if (!persoon?.email) {
    await logSchrijf(db, {
      soort: 'fout',
      wat: 'bericht niet verstuurd: geen e-mailadres',
      details: `${persoon_id}: ${onderwerp}`,
      afgehandeld: 0,
    });
    return { verstuurd: false, reden: 'geen e-mailadres' };
  }

  // Het enige kanaal dat vandaag echt bestaat. Bij 'push' is dit een
  // terugval, geen vervulde voorkeur — vandaar de aparte logregel hieronder,
  // pas ná een geslaagde verzending (een voorkeur die niet gehaald wordt, is
  // geen fout op zich, enkel het scherp maken van wat nog ontbreekt).
  const kanaal = 'mail';
  // De terugval op 'mail' hier is defensief: personen.kanaal_voorkeur is
  // NOT NULL DEFAULT 'mail' in het schema, dus dit pad kan via een normale
  // UPDATE niet bereikt worden. Blijft staan voor de zeldzame situatie waarin
  // een rij ooit buiten de app om is aangepast.
  const voorkeur = persoon.kanaal_voorkeur || 'mail';

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

  if (voorkeur === 'push') {
    // Geen fout, geen mislukking — enkel zichtbaar maken dat deze persoon
    // eigenlijk iets anders koos, zodra dat kanaal bestaat.
    await logSchrijf(db, {
      soort: 'beheer',
      wat: 'bericht via mail, terwijl de voorkeur push is',
      details: `${persoon_id}: ${onderwerp} — push bestaat nog niet`,
    });
  }

  return { verstuurd: true, omgeleid: false };
}
