// Van een geverifieerd token naar een persoon in TeamAssist.
//
// De gebruiker komt altijd hieruit, nooit uit de request body. Een route die
// een persoon-id uit de body zou lezen, laat iemand handelen als een ander.
//
// Wie zich aanmeldt met een adres dat bij geen enkele persoon staat, komt in de
// wachtrij en ziet niets. Zo mag iedereen zich registreren zonder dat dat op
// zichzelf iets oplevert — veiliger dan uitnodigingscodes, die kunnen
// rondslingeren.

import { logSchrijf } from './logboek.js';

export const ONBEKEND = 'onbekend';

/**
 * @returns {Promise<{status: 'ok', persoon: object} | {status: 'onbekend', email: string}>}
 */
export async function identiteitVoor(db, { sub, email }) {
  const bestaand = await db
    .prepare(
      `SELECT p.* FROM accounts a
         JOIN personen p ON p.id = a.persoon_id
        WHERE a.sub = ?`
    )
    .bind(sub)
    .first();

  if (bestaand) {
    if (bestaand.actief !== 1) return { status: ONBEKEND, email };
    // Bijhouden wanneer iemand voor het laatst binnen was; nuttig om te zien wie
    // de app nooit gebruikt zonder daarvoor iets extra te moeten bouwen.
    await db
      .prepare(`UPDATE accounts SET laatste_aanmelding = datetime('now') WHERE sub = ?`)
      .bind(sub)
      .run();
    return { status: 'ok', persoon: bestaand };
  }

  // Eerste aanmelding: het adres uit het token opzoeken bij de personen. Zo is
  // het inlezen van een ploeg meteen ook het klaarzetten van de toegang, zonder
  // dat iemand twee lijsten synchroon moet houden.
  const persoon = await db
    .prepare(`SELECT * FROM personen WHERE email = ? AND actief = 1`)
    .bind(email)
    .first();

  if (!persoon) {
    await zetInWachtrij(db, sub, email);
    return { status: ONBEKEND, email };
  }

  // Twee Supabase-identiteiten aan dezelfde persoon hangen kan niet: de kolom
  // persoon_id is uniek. Gebeurt het toch, dan is dat een fout die zichtbaar
  // hoort te zijn en niet stil opgelost.
  await db
    .prepare(`INSERT INTO accounts (sub, persoon_id, email) VALUES (?, ?, ?)`)
    .bind(sub, persoon.id, email)
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: 'account gekoppeld',
    details: email,
  });

  return { status: 'ok', persoon };
}

async function zetInWachtrij(db, sub, email) {
  await db
    .prepare(
      `INSERT INTO aanmeldingen_wachtrij (sub, email)
            VALUES (?, ?)
       ON CONFLICT (sub) DO UPDATE
              SET laatste_poging = datetime('now'),
                  pogingen = pogingen + 1`
    )
    .bind(sub, email)
    .run();
}
