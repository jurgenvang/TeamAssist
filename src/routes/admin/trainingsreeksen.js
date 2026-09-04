// Trainingsreeksen en het uitschrijven ervan naar concrete trainingen.
//
// Een reeks aanmaken mag ADMIN en COORD. Dat een coach zelf geen blok kan
// claimen is een bewuste keuze uit de architectuur: anders ontstaat er een
// race tussen ploegen om de goede uren. Binnen zijn toegewezen blok verfijnt
// een coach wel het uur van zijn eigen reeks.

import { json, fout, leesJson } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';
import { genereerTrainingen } from '../../lib/trainingsgenerator.js';

async function grenzenVanSeizoen(db, seizoenCode) {
  // Ten vroegste 1 augustus, ten laatste 30 juni — over de jaargrens heen.
  const jaar = Number(seizoenCode.slice(0, 4));
  return { van: `${jaar}-08-01`, tot: `${jaar + 1}-06-30` };
}

export async function reeksenTonen(ctx) {
  const { db, request, seizoen } = ctx;
  const team = new URL(request.url).searchParams.get('team');
  if (!team) return fout(400, 'team ontbreekt');

  const reeksen = await db
    .prepare(
      `SELECT r.*, z.naam AS zaal_naam FROM trainingsreeksen r
         LEFT JOIN zalen z ON z.id = r.zaal_id
        WHERE r.team_guid = ? AND r.seizoen = ? AND r.actief = 1
        ORDER BY r.weekdag, r.begin`
    )
    .bind(team, seizoen.code)
    .all();

  return json({ reeksen: reeksen.results ?? [] });
}

export async function reeksAanmaken(ctx) {
  const { db, persoon, request, seizoen } = ctx;
  const body = await leesJson(request);
  const { team_guid, weekdag, begin, einde, zaal_id, locatie_tekst, van, tot } = body ?? {};

  if (!team_guid || !weekdag || !begin || !einde || !van || !tot) {
    return fout(400, 'team_guid, weekdag, begin, einde, van en tot zijn verplicht');
  }
  if (weekdag < 1 || weekdag > 7) return fout(400, 'weekdag moet 1 (maandag) tot 7 (zondag) zijn');
  if (einde <= begin) return fout(400, 'einde moet na begin liggen');
  if (tot < van) return fout(400, 'tot moet na van liggen');
  if (!zaal_id && !locatie_tekst) return fout(400, 'geef een zaal of een vrije locatie op');

  const grenzen = await grenzenVanSeizoen(db, seizoen.code);
  if (van < grenzen.van || tot > grenzen.tot) {
    return fout(400, `de trainingsperiode moet binnen het seizoen vallen (${grenzen.van} tot ${grenzen.tot})`);
  }

  const ploeg = await db
    .prepare(`SELECT guid FROM teams WHERE guid = ? AND seizoen = ?`)
    .bind(team_guid, seizoen.code)
    .first();
  if (!ploeg) return fout(404, 'die ploeg bestaat niet in dit seizoen');

  const uit = await db
    .prepare(
      `INSERT INTO trainingsreeksen
             (team_guid, seizoen, weekdag, begin, einde, zaal_id, locatie_tekst, van, tot, vakantie_doorlopen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      team_guid,
      seizoen.code,
      weekdag,
      begin,
      einde,
      zaal_id || null,
      locatie_tekst || null,
      van,
      tot,
      body?.vakantie_doorlopen ? 1 : 0
    )
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: 'trainingsreeks aangemaakt',
    details: `${team_guid}: dag ${weekdag} ${begin}-${einde}`,
  });

  return json({ id: uit.meta.last_row_id });
}

export async function reeksStoppen(ctx) {
  const { db, persoon, request } = ctx;
  const body = await leesJson(request);
  const id = body?.id;
  if (!id) return fout(400, 'id ontbreekt');

  // Nooit verwijderen: de trainingen die eruit voortkwamen verwijzen naar
  // reeks_id, en die geschiedenis moet blijven staan.
  await db.prepare(`UPDATE trainingsreeksen SET actief = 0 WHERE id = ?`).bind(id).run();
  await logSchrijf(db, { soort: 'beheer', wie: persoon.id, wat: 'trainingsreeks gestopt', details: String(id) });
  return json({ id });
}

async function contextVoorReeks(db, reeks) {
  const ploeg = await db
    .prepare(`SELECT onderwijsgroep FROM teams WHERE guid = ? AND seizoen = ?`)
    .bind(reeks.team_guid, reeks.seizoen)
    .first();

  const periodes = await db
    .prepare(`SELECT * FROM periodes WHERE seizoen = ?`)
    .bind(reeks.seizoen)
    .all();

  const sluitingen = reeks.zaal_id
    ? await db
        .prepare(`SELECT * FROM zaal_sluitingen WHERE zaal_id = ? AND van <= ? AND tot >= ?`)
        .bind(reeks.zaal_id, reeks.tot, reeks.van)
        .all()
    : { results: [] };

  const zaal = reeks.zaal_id
    ? await db.prepare(`SELECT open_op_feestdagen FROM zalen WHERE id = ?`).bind(reeks.zaal_id).first()
    : null;

  const bestaand = await db
    .prepare(`SELECT * FROM trainingen WHERE reeks_id = ?`)
    .bind(reeks.id)
    .all();

  return {
    onderwijsgroep: ploeg?.onderwijsgroep ?? 'geen',
    periodes: periodes.results ?? [],
    sluitingen: sluitingen.results ?? [],
    bestaandeTrainingen: bestaand.results ?? [],
    zaalOpenOpFeestdagen: Boolean(zaal?.open_op_feestdagen),
  };
}

export async function reeksGenereren(ctx) {
  const { db, persoon, request } = ctx;
  const url = new URL(request.url);
  const uitvoeren = url.searchParams.get('uitvoeren') === '1';
  const id = url.searchParams.get('reeks');
  if (!id) return fout(400, 'reeks ontbreekt');

  const reeks = await db.prepare(`SELECT * FROM trainingsreeksen WHERE id = ?`).bind(id).first();
  if (!reeks) return fout(404, 'die reeks bestaat niet');

  const context = await contextVoorReeks(db, reeks);
  const plan = genereerTrainingen({ reeks, ...context });

  if (!uitvoeren) return json({ droogloop: true, ...plan });

  for (const t of plan.nieuw) {
    if (t.bestaand_id) {
      await db
        .prepare(
          `UPDATE trainingen SET begin = ?, einde = ?, status = ?, zaal_id = ?, locatie_tekst = ?
            WHERE id = ?`
        )
        .bind(t.begin, t.einde, t.status, reeks.zaal_id, reeks.locatie_tekst, t.bestaand_id)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO trainingen
                 (team_guid, seizoen, reeks_id, datum, begin, einde, zaal_id, locatie_tekst, status, bron)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reeks')`
        )
        .bind(
          reeks.team_guid,
          reeks.seizoen,
          reeks.id,
          t.datum,
          t.begin,
          t.einde,
          reeks.zaal_id,
          reeks.locatie_tekst,
          t.status
        )
        .run();
    }
  }

  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: 'trainingen gegenereerd',
    details:
      `reeks ${id}: ${plan.nieuw.length} aangemaakt of bijgewerkt, ` +
      `${plan.behouden.length} handmatig gewijzigd (ongemoeid gelaten), ` +
      `${plan.overgeslagen_vakantie.length} vakantie, ` +
      `${plan.overgeslagen_sluiting.length} zaalsluiting`,
  });

  return json({ droogloop: false, ...plan });
}

/**
 * Toont de eerstvolgende geplande trainingen van een ploeg — nodig om vanuit
 * het scherm naar een specifieke training te kunnen klikken voor de
 * aanwezigheid, wat tot nu toe enkel via de reeksen zichtbaar was.
 */
export async function trainingenTonen(ctx) {
  const { db, rechten, request, seizoen } = ctx;
  const team = new URL(request.url).searchParams.get('team');
  if (!team) return fout(400, 'team ontbreekt');
  if (!rechten.mag('team.aanwezigheid.bekijken', team)) return fout(403, 'geen recht op deze ploeg');

  const rijen = await db
    .prepare(
      `SELECT id, datum, begin, einde, status, locatie_tekst
         FROM trainingen
        WHERE team_guid = ? AND seizoen = ? AND datum >= date('now', '-7 days')
        ORDER BY datum, begin
        LIMIT 30`
    )
    .bind(team, seizoen.code)
    .all();

  return json({ trainingen: rijen.results ?? [] });
}
