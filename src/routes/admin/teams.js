// Ploegen beheren.
//
// Drie routes: de lijst tonen, synchroniseren met de bond, en aanvinken welke
// ploegen gevolgd worden.
//
// De synchronisatie is standaard een droogloop. Ze raakt de ploegindeling van
// een heel seizoen aan, en wat eraan hangt — spelers, trainingen,
// aanwezigheden — is niet met één klik terug te draaien.

import { json, fout, leesJson } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';
import { haalVbl, orgDetailUrl, leesPloegen } from '../../lib/vbl.js';
import { maakPloegplan } from '../../lib/teamsync.js';

async function clubGuid(db) {
  const rij = await db.prepare(`SELECT waarde FROM instellingen WHERE sleutel = 'club_guid'`).first();
  return rij?.waarde || 'BVBL1125';
}

async function bestaandeTeams(db, seizoen) {
  const rijen = await db
    .prepare(
      `SELECT guid, naam, categorie, onderwijsgroep, gevolgd, bij_bond, laatst_gezien
         FROM teams WHERE seizoen = ? ORDER BY categorie, naam`
    )
    .bind(seizoen)
    .all();
  return rijen.results ?? [];
}

export async function teamsLijst(ctx) {
  const { db, seizoen } = ctx;
  return json({ seizoen: seizoen.code, teams: await bestaandeTeams(db, seizoen.code) });
}

export async function teamsSync(ctx) {
  const { db, persoon, request, seizoen } = ctx;
  const url = new URL(request.url);
  // Uitvoeren moet expliciet gevraagd worden. Wie de parameter vergeet, krijgt
  // een droogloop en niet per ongeluk een uitgevoerde synchronisatie.
  const uitvoeren = url.searchParams.get('uitvoeren') === '1';
  const club = await clubGuid(db);

  let data;
  try {
    data = await haalVbl(orgDetailUrl(club));
  } catch (e) {
    await logSchrijf(db, {
      soort: 'fout',
      wie: persoon.id,
      wat: 'ploegen ophalen mislukt',
      details: e.message,
      afgehandeld: 0,
    });
    return fout(502, `de bond antwoordde niet bruikbaar: ${e.message}`);
  }

  const gevonden = leesPloegen(data, club);
  const bestaand = await bestaandeTeams(db, seizoen.code);
  const plan = maakPloegplan(gevonden, bestaand, club);

  if (!uitvoeren) {
    return json({ droogloop: true, seizoen: seizoen.code, ...plan });
  }

  for (const ploeg of plan.nieuw) {
    await db
      .prepare(
        `INSERT INTO teams (guid, seizoen, naam, categorie, onderwijsgroep, gevolgd, laatst_gezien)
              VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`
      )
      .bind(ploeg.guid, seizoen.code, ploeg.naam, ploeg.categorie, ploeg.onderwijsgroep)
      .run();
  }

  for (const ploeg of plan.gewijzigd) {
    // gevolgd en onderwijsgroep blijven staan: dat zijn keuzes van de club, en
    // die horen niet elke nacht overschreven te worden door de bond.
    await db
      .prepare(
        `UPDATE teams
            SET naam = ?, categorie = ?, bij_bond = 1, laatst_gezien = datetime('now')
          WHERE guid = ? AND seizoen = ?`
      )
      .bind(ploeg.naam, ploeg.categorie, ploeg.guid, seizoen.code)
      .run();
  }

  for (const ploeg of plan.ongewijzigd) {
    await db
      .prepare(`UPDATE teams SET laatst_gezien = datetime('now') WHERE guid = ? AND seizoen = ?`)
      .bind(ploeg.guid, seizoen.code)
      .run();
  }

  for (const ploeg of plan.verdwenen) {
    await db
      .prepare(`UPDATE teams SET bij_bond = 0 WHERE guid = ? AND seizoen = ?`)
      .bind(ploeg.guid, seizoen.code)
      .run();
  }

  await logSchrijf(db, {
    soort: 'sync',
    wie: persoon.id,
    wat: 'ploegen gesynchroniseerd',
    details:
      `${plan.nieuw.length} nieuw, ${plan.gewijzigd.length} gewijzigd, ` +
      `${plan.verdwenen.length} niet meer bij de bond` +
      (plan.melding ? ` — ${plan.melding}` : ''),
    afgehandeld: plan.status === 'ok' ? 1 : 0,
  });

  return json({ droogloop: false, seizoen: seizoen.code, ...plan });
}

export async function teamGevolgd(ctx) {
  const { db, persoon, request, seizoen } = ctx;
  const body = await leesJson(request);
  const guid = body?.guid;
  const gevolgd = body?.gevolgd ? 1 : 0;
  if (!guid) return fout(400, 'guid ontbreekt');

  const bestaat = await db
    .prepare(`SELECT categorie FROM teams WHERE guid = ? AND seizoen = ?`)
    .bind(guid, seizoen.code)
    .first();
  if (!bestaat) return fout(404, 'die ploeg bestaat niet in dit seizoen');

  await db
    .prepare(`UPDATE teams SET gevolgd = ? WHERE guid = ? AND seizoen = ?`)
    .bind(gevolgd, guid, seizoen.code)
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: gevolgd ? 'ploeg gevolgd' : 'ploeg niet meer gevolgd',
    details: guid,
  });

  return json({ guid, gevolgd: Boolean(gevolgd) });
}
