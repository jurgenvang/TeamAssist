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
// ingesteld bij Mijn voorkeuren, T6).
//
// Push bestaat sinds 0.29.0 (I1, uit YOAssist). Mail blijft het betrouwbare
// kanaal: op een iPhone werkt push enkel als de app op het beginscherm staat,
// en abonnementen verlopen stil. Daarom: wie 'push' koos maar geen enkel
// werkend toestel heeft, krijgt toch mail — liever een mail te veel dan een
// bericht dat nergens aankomt.
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
import { stuurPush } from './push.js';
import { logSchrijf } from './logboek.js';

async function instelling(db, sleutel) {
  const rij = await db.prepare(`SELECT waarde FROM instellingen WHERE sleutel = ?`).bind(sleutel).first();
  return rij?.waarde || null;
}

/**
 * Push naar elk toestel van één persoon.
 *
 * Een verlopen abonnement (404/410) wordt meteen gewist: blijven proberen
 * levert enkel ruis op. Een gewone mislukking telt op in `mislukt`, want die
 * kan voorbijgaan. Bijwerken mag het versturen nooit laten mislukken.
 *
 * @returns {{verstuurd: number, verlopen: number, toestellen: number}}
 */
export async function pushNaarToestellen(ctx, persoon_id, { titel, tekst }) {
  const { db, env } = ctx;
  const rijen = await db
    .prepare(`SELECT id, endpoint, p256dh, auth FROM push_abonnementen WHERE persoon_id = ?`)
    .bind(persoon_id)
    .all();
  const toestellen = rijen.results ?? [];
  const uit = { verstuurd: 0, verlopen: 0, toestellen: toestellen.length };
  if (!toestellen.length) return uit;

  const sleutels = {
    publiek: env.VAPID_PUBLIEK,
    prive: env.VAPID_PRIVE,
    onderwerp: `mailto:${env.VAPID_CONTACT || 'noreply@clubassist.org'}`,
  };
  // Tikken op een melding opent altijd Mijn berichten (sw.js), dus geen url
  // per bericht: je landt altijd op hetzelfde vertrouwde scherm.
  const bericht = { titel, tekst };

  for (const t of toestellen) {
    const res = await stuurPush(t, bericht, sleutels);
    try {
      if (res.verstuurd) {
        uit.verstuurd += 1;
        await db.prepare(`UPDATE push_abonnementen SET laatst_ok = datetime('now'), mislukt = 0 WHERE id = ?`).bind(t.id).run();
      } else if (res.verlopen) {
        uit.verlopen += 1;
        await db.prepare(`DELETE FROM push_abonnementen WHERE id = ?`).bind(t.id).run();
      } else {
        await db.prepare(`UPDATE push_abonnementen SET mislukt = mislukt + 1 WHERE id = ?`).bind(t.id).run();
      }
    } catch {
      // Het toestel bijwerken is boekhouding; het bericht is al vertrokken of niet.
    }
  }
  return uit;
}

/** De tekst van een pushmelding: de korte regel, of de eerste regels. */
function pushTekst(kort, inhoud) {
  if (kort) return kort;
  return String(inhoud ?? '').split('\n').filter((r) => r.trim()).slice(0, 2).join(' ').slice(0, 180);
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
 * Geen kanaal-parameter: deze functie bepaalt zelf hoe, aan de hand van
 * `personen.kanaal_voorkeur`:
 *  - 'mail'  — enkel mail;
 *  - 'push'  — push naar elk toestel; komt er op geen enkel toestel iets aan
 *              (geen toestel, of alle mislukt), dan toch mail;
 *  - 'beide' — mail én push.
 * Push vertrekt enkel in de modus 'normaal': in 'omleiden' kan een melding
 * niet naar een testadres omgeleid worden, en naar de echte persoon mag ze
 * dan net niet.
 *
 * @returns {{verstuurd, omgeleid?, mail?, push?, reden?}}
 */
export async function verwittig(ctx, { persoon_id, onderwerp, inhoud, soort = null, kort = null }) {
  const { db, env } = ctx;

  const persoon = await db
    .prepare(`SELECT email, kanaal_voorkeur FROM personen WHERE id = ?`)
    .bind(persoon_id)
    .first();
  // De terugval op 'mail' is defensief: kanaal_voorkeur is NOT NULL DEFAULT
  // 'mail', dit pad bestaat enkel voor een rij die buiten de app om veranderde.
  const voorkeur = persoon?.kanaal_voorkeur || 'mail';

  const modus = (await instelling(db, 'bericht_modus')) || 'omleiden';

  if (modus === 'uit') {
    await logSchrijf(db, {
      soort: 'beheer',
      wat: 'bericht niet verstuurd (modus uit)',
      details: `${persoon?.email ?? persoon_id}: ${onderwerp} — ${inhoud}`,
    });
    return { verstuurd: false, reden: 'modus uit' };
  }

  // Eerst push, want of er nog mail moet volgen, hangt ervan af.
  let push = { verstuurd: 0, verlopen: 0, toestellen: 0 };
  if (modus === 'normaal' && (voorkeur === 'push' || voorkeur === 'beide')) {
    push = await pushNaarToestellen(ctx, persoon_id, { titel: onderwerp, tekst: pushTekst(kort, inhoud) });
  }
  const mailNodig = voorkeur !== 'push' || push.verstuurd === 0;

  let mail = false;
  if (mailNodig) {
    if (!persoon?.email) {
      if (push.verstuurd === 0) {
        await logSchrijf(db, {
          soort: 'fout',
          wat: 'bericht niet verstuurd: geen e-mailadres',
          details: `${persoon_id}: ${onderwerp}`,
          afgehandeld: 0,
        });
        return { verstuurd: false, reden: 'geen e-mailadres' };
      }
    } else {
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
        mail = true;
      } catch (e) {
        await logSchrijf(db, {
          soort: 'fout',
          wat: 'bericht versturen mislukt',
          details: `${bestemming}: ${onderwerp} — ${e.message}`,
          afgehandeld: 0,
        });
        if (push.verstuurd === 0) return { verstuurd: false, reden: e.message };
      }

      if (modus === 'omleiden') {
        await logSchrijf(db, {
          soort: 'beheer',
          wat: 'bericht verstuurd (omgeleid)',
          details: `voor ${persoon.email}, echt naar ${bestemming}: ${onderwerp}`,
        });
        return { verstuurd: true, omgeleid: true };
      }
    }
  }

  // modus === 'normaal': werkelijk aangekomen bij de echte persoon. Eén rij,
  // ook bij mail én push — Mijn berichten hoort een bericht niet twee keer
  // te tonen. `kanaal` zegt wat er zeker aankwam: mail als die vertrok, anders
  // push.
  await db
    .prepare(`INSERT INTO berichten (persoon_id, kanaal, onderwerp, inhoud, soort, kort) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(persoon_id, mail ? 'mail' : 'push', onderwerp, inhoud, soort, kort)
    .run();

  if (voorkeur === 'push' && push.verstuurd === 0) {
    // Geen fout — wel zichtbaar maken dat deze persoon push koos en het niet
    // kreeg, zodat een beheerder hem kan aanspreken.
    await logSchrijf(db, {
      soort: 'beheer',
      wat: 'bericht via mail, terwijl de voorkeur push is',
      details: `${persoon_id}: ${onderwerp} — ${push.toestellen ? 'geen toestel bereikbaar' : 'geen toestel ingeschreven'}`,
    });
  }

  return { verstuurd: true, omgeleid: false, mail, push: push.verstuurd };
}

/**
 * Een testmelding naar je eigen toestellen, vanuit Mijn voorkeuren.
 *
 * Gaat ook in de modus 'omleiden': het enige toestel dat ze kan krijgen, is
 * dat van wie op de knop drukte — er valt niets om te leiden. In de modus
 * 'uit' niet: daar vertrekt niets, ook geen test.
 */
export async function verwittigTest(ctx, persoon_id) {
  const modus = (await instelling(ctx.db, 'bericht_modus')) || 'omleiden';
  if (modus === 'uit') return { verstuurd: 0, toestellen: 0, reden: 'modus uit' };
  return pushNaarToestellen(ctx, persoon_id, {
    titel: 'TeamAssist — testmelding',
    tekst: 'Als je dit ziet, werken meldingen op dit toestel.',
  });
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
