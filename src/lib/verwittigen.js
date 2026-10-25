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

import { verstuurMail, verstuurMailBatch } from './mailer.js';
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
 * @param {string} [bericht.soort]  waar het over gaat, voor Mijn berichten
 * @param {string} [bericht.kort]   één regel voor de lijst in Mijn berichten
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
export async function verwittig(ctx, { persoon_id, onderwerp, inhoud, soort = null, kort = null }) {
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

  const van = (await instelling(db, 'mail_afzender')) || 'TeamAssist <noreply@clubassist.org>';
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
    .prepare(`INSERT INTO berichten (persoon_id, kanaal, onderwerp, inhoud, soort, kort) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(persoon_id, kanaal, onderwerp, inhoud, soort, kort)
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

/**
 * Hetzelfde bericht aan veel mensen tegelijk — voor een mededeling.
 *
 * Dezelfde drie modi als verwittig(), met twee verschillen die bij een grote
 * groep tellen:
 *  - 'normaal' verstuurt via het batch-endpoint van Resend, honderd per
 *    oproep, in plaats van één oproep per persoon. Een Worker mag per aanroep
 *    maar een beperkt aantal uitgaande oproepen doen.
 *  - 'omleiden' stuurt één mail naar het testadres, met erin voor hoeveel
 *    mensen ze bedoeld was — niet driehonderd keer dezelfde mail.
 * Een batch die mislukt, laat de andere niet mislukken; wie erin zat, komt
 * niet in `berichten` en staat als mislukt in het logboek.
 *
 * @param {Array<{id, email}>} ontvangers  zie doelgroep.js
 * @returns {{verstuurd, mislukt, zonderMail, omgeleid?, reden?}}
 */
export async function verwittigVelen(ctx, ontvangers, { onderwerp, inhoud, soort = null, kort = null }) {
  const { db, env } = ctx;
  const metMail = ontvangers.filter((o) => o.email);
  const zonderMail = ontvangers.length - metMail.length;
  const uitkomst = { verstuurd: 0, mislukt: 0, zonderMail };

  const modus = (await instelling(db, 'bericht_modus')) || 'omleiden';
  if (modus === 'uit') {
    await logSchrijf(db, {
      soort: 'beheer',
      wat: 'bericht niet verstuurd (modus uit)',
      details: `${metMail.length} ontvangers: ${onderwerp} — ${inhoud}`,
    });
    return { ...uitkomst, reden: 'modus uit' };
  }

  const van = (await instelling(db, 'mail_afzender')) || 'TeamAssist <noreply@clubassist.org>';

  if (modus === 'omleiden') {
    const omleidadres = await instelling(db, 'bericht_omleidadres');
    if (!omleidadres) {
      await logSchrijf(db, {
        soort: 'fout',
        wat: 'omleiden ingesteld maar geen omleidadres gevuld',
        details: onderwerp,
        afgehandeld: 0,
      });
      return { ...uitkomst, reden: 'geen omleidadres' };
    }
    const tekst = `[Omgeleid: bedoeld voor ${metMail.length} ontvanger(s)]\n\n${inhoud}`;
    try {
      await verstuurMail({ van, naar: omleidadres, onderwerp, tekst }, env);
    } catch (e) {
      await logSchrijf(db, {
        soort: 'fout',
        wat: 'bericht versturen mislukt',
        details: `${omleidadres}: ${onderwerp} — ${e.message}`,
        afgehandeld: 0,
      });
      return { ...uitkomst, mislukt: metMail.length, reden: e.message };
    }
    await logSchrijf(db, {
      soort: 'beheer',
      wat: 'bericht verstuurd (omgeleid)',
      details: `voor ${metMail.length} ontvangers, echt naar ${omleidadres}: ${onderwerp}`,
    });
    return { ...uitkomst, omgeleid: true };
  }

  for (let i = 0; i < metMail.length; i += 100) {
    const groep = metMail.slice(i, i + 100);
    try {
      await verstuurMailBatch(
        groep.map((o) => ({ van, naar: o.email, onderwerp, tekst: inhoud })),
        env
      );
    } catch (e) {
      uitkomst.mislukt += groep.length;
      await logSchrijf(db, {
        soort: 'fout',
        wat: 'bericht versturen mislukt',
        details: `${groep.length} ontvangers (${groep[0].email} …): ${onderwerp} — ${e.message}`,
        afgehandeld: 0,
      });
      continue;
    }
    // Enkel wie in een geslaagde batch zat: 'Mijn berichten' toont wat echt
    // vertrok, zoals bij verwittig().
    for (const o of groep) {
      await db
        .prepare(`INSERT INTO berichten (persoon_id, kanaal, onderwerp, inhoud, soort, kort) VALUES (?, 'mail', ?, ?, ?, ?)`)
        .bind(o.id, onderwerp, inhoud, soort, kort)
        .run();
    }
    uitkomst.verstuurd += groep.length;
  }
  return uitkomst;
}
