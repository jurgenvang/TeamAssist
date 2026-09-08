// Wedstrijdtaken (T1): tafeltaken bij een wedstrijd.
//
// De taakslots zelf ontstaan automatisch bij de wedstrijdsynchronisatie (zie
// wedstrijden.js en wedstrijdtaken.js). Deze routes tonen ze en laten een
// beheerder ze invullen — dezelfde kring als de selectie
// (team.selectie.beheren), geen apart recht.

import { json, fout, leesJson } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';
import { verwittig } from '../../lib/verwittigen.js';

const TAAKNAMEN = {
  klok: 'Klok',
  '24seconden': '24 seconden',
  tablet: 'Tablet',
  ploegafgevaardigde: 'Ploegafgevaardigde',
};

/** Alle taakslots van een wedstrijd, met naam van wie is toegewezen. */
export async function wedstrijdtakenTonen(ctx) {
  const { db, rechten, request } = ctx;
  const url = new URL(request.url);
  const wedstrijdId = url.searchParams.get('wedstrijd_id');
  if (!wedstrijdId) return fout(400, 'wedstrijd_id ontbreekt');

  const wed = await db.prepare(`SELECT id, team_guid FROM wedstrijden WHERE id = ?`).bind(wedstrijdId).first();
  if (!wed) return fout(404, 'die wedstrijd bestaat niet');
  if (!rechten.mag('team.selectie.beheren', wed.team_guid)) return fout(403, 'geen recht op deze ploeg');

  const taken = await db
    .prepare(
      `SELECT t.id, t.taak, t.persoon_id, t.probleem_gemeld, t.probleem_reden,
              p.voornaam, p.achternaam
         FROM wedstrijdtaken t
         LEFT JOIN personen p ON p.id = t.persoon_id
        WHERE t.wedstrijd_id = ?
        ORDER BY t.taak`
    )
    .bind(wedstrijdId)
    .all();

  return json({
    wedstrijd_id: Number(wedstrijdId),
    taken: (taken.results ?? []).map((t) => ({
      id: t.id,
      taak: t.taak,
      taak_naam: TAAKNAMEN[t.taak] ?? t.taak,
      persoon_id: t.persoon_id,
      persoon_naam: t.persoon_id ? `${t.voornaam} ${t.achternaam}`.trim() : null,
      probleem_gemeld: Boolean(t.probleem_gemeld),
      probleem_reden: t.probleem_reden,
    })),
  });
}

/**
 * Wijst een persoon toe aan een taakslot. Om het even welk actief clublid
 * komt in aanmerking — geen beperking tot ouders van spelers in dat team
 * (bevestigd bij het uitklaren van dit punt).
 */
export async function wedstrijdtaakToewijzen(ctx) {
  const { db, persoon: beheerder, rechten, request } = ctx;
  const body = await leesJson(request);
  const { wedstrijdtaak_id, persoon_id } = body ?? {};
  if (!wedstrijdtaak_id || !persoon_id) return fout(400, 'wedstrijdtaak_id en persoon_id zijn verplicht');

  const taak = await db
    .prepare(
      `SELECT t.id, t.taak, t.wedstrijd_id, w.team_guid, w.datum, w.begin, w.tegenstander
         FROM wedstrijdtaken t
         JOIN wedstrijden w ON w.id = t.wedstrijd_id
        WHERE t.id = ?`
    )
    .bind(wedstrijdtaak_id)
    .first();
  if (!taak) return fout(404, 'die wedstrijdtaak bestaat niet');
  if (!rechten.mag('team.selectie.beheren', taak.team_guid)) return fout(403, 'geen recht op deze ploeg');

  const persoonRij = await db.prepare(`SELECT id, actief FROM personen WHERE id = ?`).bind(persoon_id).first();
  if (!persoonRij) return fout(404, 'die persoon bestaat niet');
  if (!persoonRij.actief) return fout(400, 'die persoon is niet actief');

  await db
    .prepare(
      `UPDATE wedstrijdtaken
          SET persoon_id = ?, toegewezen_door = ?, toegewezen_tijdstip = datetime('now'),
              probleem_gemeld = 0, probleem_reden = NULL, probleem_tijdstip = NULL
        WHERE id = ?`
    )
    .bind(persoon_id, beheerder.id, wedstrijdtaak_id)
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: beheerder.id,
    wat: 'wedstrijdtaak toegewezen',
    details: `${TAAKNAMEN[taak.taak] ?? taak.taak} → ${persoon_id} (wedstrijd ${taak.wedstrijd_id})`,
  });

  const onderwerp = `Taak toegewezen — ${TAAKNAMEN[taak.taak] ?? taak.taak}`;
  const inhoud =
    `Je bent aangeduid voor ${TAAKNAMEN[taak.taak] ?? taak.taak} bij de wedstrijd van ` +
    `${taak.datum} om ${taak.begin}${taak.tegenstander ? ` tegen ${taak.tegenstander}` : ''}.`;
  await verwittig(ctx, { persoon_id, onderwerp, inhoud });

  return json({ id: taak.id, taak: taak.taak, persoon_id });
}

/**
 * Een toegewezen persoon kan zijn taak niet zelf wijzigen, wel een probleem
 * melden — hetzelfde patroon als aanwezigheid. Gaat naar de begeleiding van
 * dat team (COACH/COORD/PLOEGV), niet naar de persoon zelf.
 */
export async function wedstrijdtaakProbleemMelden(ctx) {
  const { db, persoon, request } = ctx;
  const body = await leesJson(request);
  const { wedstrijdtaak_id, reden } = body ?? {};
  if (!wedstrijdtaak_id || !reden) return fout(400, 'wedstrijdtaak_id en reden zijn verplicht');

  const taak = await db
    .prepare(
      `SELECT t.id, t.taak, t.persoon_id, t.wedstrijd_id, w.team_guid, w.datum, w.begin
         FROM wedstrijdtaken t
         JOIN wedstrijden w ON w.id = t.wedstrijd_id
        WHERE t.id = ?`
    )
    .bind(wedstrijdtaak_id)
    .first();
  if (!taak) return fout(404, 'die wedstrijdtaak bestaat niet');
  if (taak.persoon_id !== persoon.id) return fout(403, 'dit is niet jouw taak');

  await db
    .prepare(
      `UPDATE wedstrijdtaken
          SET probleem_gemeld = 1, probleem_reden = ?, probleem_tijdstip = datetime('now')
        WHERE id = ?`
    )
    .bind(reden, wedstrijdtaak_id)
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: 'probleem gemeld bij wedstrijdtaak',
    details: `${TAAKNAMEN[taak.taak] ?? taak.taak} (wedstrijd ${taak.wedstrijd_id}): ${reden}`,
    afgehandeld: 0,
  });

  const begeleiding = await db
    .prepare(
      `SELECT DISTINCT persoon_id FROM rollen
        WHERE team_guid = ? AND rol IN ('COORD', 'COACH', 'PLOEGV')`
    )
    .bind(taak.team_guid)
    .all();

  const onderwerp = `Probleem gemeld — ${TAAKNAMEN[taak.taak] ?? taak.taak}`;
  const inhoud = `Er is een probleem gemeld bij ${TAAKNAMEN[taak.taak] ?? taak.taak} voor de wedstrijd van ${taak.datum} om ${taak.begin}: ${reden}`;
  for (const rij of begeleiding.results ?? []) {
    await verwittig(ctx, { persoon_id: rij.persoon_id, onderwerp, inhoud });
  }

  return json({ id: taak.id, probleem_gemeld: true });
}
