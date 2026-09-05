// Wedstrijden synchroniseren en bekijken.
//
// Per gevolgde ploeg wordt TeamMatchesByGuid opgehaald, thuis en uit — anders
// dan YOAssist, dat enkel thuiswedstrijden nodig heeft. Standaard een
// droogloop.

import { json, fout } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';
import { verwittig } from '../../lib/verwittigen.js';
import { haalVbl, teamMatchesUrl, leesWedstrijden } from '../../lib/vbl.js';
import { maakWedstrijdplan } from '../../lib/wedstrijdsync.js';
import { instellingLezen } from './instellingen.js';

const DAGNAMEN = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

/**
 * COORD, COACH en PLOEGV van een team — wie een wijziging hoort te weten.
 * De filter op rol is hier defensief/zelfdocumenterend: het schema garandeert
 * al dat een rollen-rij met een team_guid nooit iets anders dan COORD, COACH
 * of PLOEGV kan zijn (ADMIN/FINADM vragen een lege team_guid, zie de CHECK op
 * de tabel), dus dit filtert in de praktijk niets extra weg.
 */
async function begeleidingVan(db, teamGuid, seizoen) {
  const rijen = await db
    .prepare(
      `SELECT DISTINCT p.id, p.voornaam, p.achternaam
         FROM rollen r
         JOIN personen p ON p.id = r.persoon_id
        WHERE r.team_guid = ? AND r.seizoen = ? AND r.rol IN ('COORD', 'COACH', 'PLOEGV') AND p.actief = 1`
    )
    .bind(teamGuid, seizoen)
    .all();
  return rijen.results ?? [];
}

function wedstrijdBeschrijving(w) {
  const dag = new Date(`${w.datum}T00:00:00Z`).getUTCDay();
  return `${DAGNAMEN[dag === 0 ? 7 : dag]} ${w.datum} om ${w.begin}${w.locatie_tekst ? ` in ${w.locatie_tekst}` : ''}${w.tegenstander ? ` tegen ${w.tegenstander}` : ''}`;
}

async function meldWijziging(ctx, ploeg, seizoen, w) {
  const begeleiding = await begeleidingVan(ctx.db, ploeg.guid, seizoen);
  const onderwerp = `Wedstrijdwijziging — ${ploeg.naam}`;
  const inhoud =
    `De wedstrijd van ${ploeg.naam} is gewijzigd.\n\n` +
    `Was: ${wedstrijdBeschrijving(w.was)}\n` +
    `Wordt: ${wedstrijdBeschrijving(w)}`;
  for (const persoon of begeleiding) {
    await verwittig(ctx, { persoon_id: persoon.id, onderwerp, inhoud });
  }
  return begeleiding.length;
}

async function gevolgdePloegen(db, seizoen, alleen) {
  if (alleen) {
    const rij = await db
      .prepare(`SELECT guid, naam FROM teams WHERE guid = ? AND seizoen = ? AND gevolgd = 1`)
      .bind(alleen, seizoen)
      .first();
    return rij ? [rij] : [];
  }
  const rijen = await db
    .prepare(`SELECT guid, naam FROM teams WHERE seizoen = ? AND gevolgd = 1 AND bij_bond = 1 ORDER BY categorie`)
    .bind(seizoen)
    .all();
  return rijen.results ?? [];
}

async function stillePeriodes(db) {
  const ruw = await instellingLezen(db, 'stille_periodes', '[]');
  try {
    const lijst = JSON.parse(ruw);
    return Array.isArray(lijst) && lijst.length ? lijst : undefined; // undefined -> functiedefault
  } catch {
    return undefined;
  }
}

async function verwerkPloeg(ctx, ploeg, seizoen, uitvoeren, periodes) {
  const { db } = ctx;
  const data = await haalVbl(teamMatchesUrl(ploeg.guid));
  const gevonden = leesWedstrijden(data, ploeg.guid);

  const bestaand = await db
    .prepare(`SELECT * FROM wedstrijden WHERE team_guid = ? AND seizoen = ?`)
    .bind(ploeg.guid, seizoen)
    .all();

  const plan = maakWedstrijdplan(gevonden, bestaand.results ?? [], periodes);

  if (!uitvoeren) return { ploeg: ploeg.guid, naam: ploeg.naam, ...plan };

  for (const w of plan.nieuw) {
    if (!w.datum || !w.begin) continue; // een onleesbare datum/uur wordt niet blind weggeschreven
    await db
      .prepare(
        `INSERT INTO wedstrijden
               (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander,
                locatie_tekst, vbl_acc_guid, uitslag, wijzigingshash, laatst_gezien)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        w.wedstrijd_guid, ploeg.guid, seizoen, w.datum, w.begin, w.thuis ? 1 : 0,
        w.tegenstander, w.locatie_tekst, w.vbl_acc_guid, w.uitslag, w.hash
      )
      .run();
  }

  for (const w of plan.gewijzigd) {
    await db
      .prepare(
        `UPDATE wedstrijden
            SET datum = ?, begin = ?, thuis = ?, tegenstander = ?, locatie_tekst = ?,
                vbl_acc_guid = ?, wijzigingshash = ?, status = 'gepland',
                bij_bond = 1, laatst_gezien = datetime('now')
          WHERE wedstrijd_guid = ?`
      )
      .bind(w.datum, w.begin, w.thuis ? 1 : 0, w.tegenstander, w.locatie_tekst, w.vbl_acc_guid, w.hash, w.wedstrijd_guid)
      .run();

    if (w.meldbaar) {
      const aantal = await meldWijziging(ctx, ploeg, seizoen, w);
      await logSchrijf(db, {
        soort: 'sync',
        wat: `wedstrijd gewijzigd: ${w.wedstrijd_guid}`,
        details: `${ploeg.naam}: was ${w.was.datum} ${w.was.begin}, wordt ${w.datum} ${w.begin} — ${aantal} verwittigd`,
        afgehandeld: aantal > 0 ? 1 : 0,
      });
    }
  }

  for (const w of plan.uitslag_bijgewerkt) {
    await db
      .prepare(`UPDATE wedstrijden SET uitslag = ?, laatst_gezien = datetime('now') WHERE wedstrijd_guid = ?`)
      .bind(w.uitslag, w.wedstrijd_guid)
      .run();
  }

  for (const w of plan.ongewijzigd) {
    await db
      .prepare(`UPDATE wedstrijden SET laatst_gezien = datetime('now') WHERE wedstrijd_guid = ?`)
      .bind(w.wedstrijd_guid)
      .run();
  }

  for (const w of plan.verdwenen) {
    await db.prepare(`UPDATE wedstrijden SET bij_bond = 0 WHERE wedstrijd_guid = ?`).bind(w.wedstrijd_guid).run();
  }

  return { ploeg: ploeg.guid, naam: ploeg.naam, ...plan };
}

export async function wedstrijdenSync(ctx) {
  const { db, persoon, request, seizoen } = ctx;
  const url = new URL(request.url);
  const uitvoeren = url.searchParams.get('uitvoeren') === '1';
  const alleen = url.searchParams.get('team');

  const ploegen = await gevolgdePloegen(db, seizoen.code, alleen);
  if (!ploegen.length) return fout(400, 'er is geen enkele gevolgde ploeg om te synchroniseren');

  const periodes = await stillePeriodes(db);
  const uitslagen = [];
  for (const ploeg of ploegen) {
    try {
      uitslagen.push(await verwerkPloeg(ctx, ploeg, seizoen.code, uitvoeren, periodes));
    } catch (e) {
      uitslagen.push({ ploeg: ploeg.guid, naam: ploeg.naam, status: 'fout', melding: e.message });
      await logSchrijf(db, {
        soort: 'fout', wie: persoon.id, wat: 'wedstrijden ophalen mislukt',
        details: `${ploeg.guid} — ${e.message}`, afgehandeld: 0,
      });
    }
  }

  const tel = (veld) => uitslagen.reduce((n, u) => n + (u[veld]?.length ?? 0), 0);
  const totalen = {
    nieuw: tel('nieuw'), gewijzigd: tel('gewijzigd'), ongewijzigd: tel('ongewijzigd'),
    uitslag_bijgewerkt: tel('uitslag_bijgewerkt'), verdwenen: tel('verdwenen'),
  };

  if (uitvoeren) {
    await logSchrijf(db, {
      soort: 'sync', wie: persoon.id, wat: 'wedstrijden gesynchroniseerd',
      details: `${ploegen.length} ploegen: ${totalen.nieuw} nieuw, ${totalen.gewijzigd} gewijzigd, ` +
        `${totalen.uitslag_bijgewerkt} uitslagen bijgewerkt`,
    });
  }

  return json({ droogloop: !uitvoeren, seizoen: seizoen.code, totalen, ploegen: uitslagen });
}

export async function wedstrijdenTonen(ctx) {
  const { db, request, seizoen } = ctx;
  const team = new URL(request.url).searchParams.get('team');
  if (!team) return fout(400, 'team ontbreekt');

  const rijen = await db
    .prepare(
      `SELECT * FROM wedstrijden WHERE team_guid = ? AND seizoen = ?
        ORDER BY datum, begin`
    )
    .bind(team, seizoen.code)
    .all();

  return json({ wedstrijden: rijen.results ?? [] });
}
