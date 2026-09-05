// Een persoon bekijken en aanpassen.
//
// De bron-vlag-logica zelf staat in src/lib/persoonwijzigen.js, herbruikt door
// het sjabloon (src/routes/admin/sjabloon.js). Dit bestand is de HTTP-laag
// eromheen: uitpakken van het verzoek, valideren wat er binnenkomt, en
// loggen.

import { json, fout, leesJson } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';
import { AANPASBAAR, schoon, controleer, pasPersoonAan } from '../../lib/persoonwijzigen.js';

export { AANPASBAAR, controleer };

export async function persoonTonen(ctx) {
  const { db, request, seizoen } = ctx;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return fout(400, 'id ontbreekt');

  const persoon = await db.prepare(`SELECT * FROM personen WHERE id = ?`).bind(id).first();
  if (!persoon) return fout(404, 'die persoon bestaat niet');

  const ploegen = await db
    .prepare(
      `SELECT t.guid, t.naam, t.categorie, ts.bij_bond, ts.bron
         FROM team_spelers ts
         JOIN teams t ON t.guid = ts.team_guid AND t.seizoen = ts.seizoen
        WHERE ts.persoon_id = ? AND ts.seizoen = ?
        ORDER BY t.categorie`
    )
    .bind(id, seizoen.code)
    .all();

  const rollen = await db
    .prepare(
      `SELECT rol, team_guid, bron FROM rollen
        WHERE persoon_id = ? AND (seizoen IS NULL OR seizoen = ?)`
    )
    .bind(id, seizoen.code)
    .all();

  return json({
    persoon,
    ploegen: ploegen.results ?? [],
    rollen: rollen.results ?? [],
    aanpasbaar: Object.keys(AANPASBAAR),
  });
}

export async function persoonBewaren(ctx) {
  const { db, persoon: beheerder, request } = ctx;
  const body = await leesJson(request);
  const id = body?.id;
  if (!id) return fout(400, 'id ontbreekt');

  // Enkel velden die aangepast mogen worden. Wat er verder in de body staat,
  // wordt genegeerd in plaats van geweigerd: een frontend die een extra veld
  // meestuurt, hoort daar niet op vast te lopen.
  const velden = {};
  for (const veld of Object.keys(AANPASBAAR)) {
    if (Object.hasOwn(body, veld)) velden[veld] = schoon(body[veld]);
  }
  if (!Object.keys(velden).length) return fout(400, 'er valt niets te wijzigen');

  const uitkomst = await pasPersoonAan(db, id, velden);
  if (uitkomst.fout === 'bestaat niet') return fout(404, 'die persoon bestaat niet');
  if (uitkomst.fout) {
    const isConflict = uitkomst.fout.includes('iemand anders');
    return fout(isConflict ? 409 : 400, uitkomst.fout);
  }

  if (uitkomst.gewijzigd.length) {
    await logSchrijf(db, {
      soort: 'beheer',
      wie: beheerder.id,
      wat: 'persoon aangepast',
      details: `${id}: ${uitkomst.gewijzigd.join(', ')}`,
    });
  }

  return json({ id, gewijzigd: uitkomst.gewijzigd, bron_gezet: uitkomst.bronnen ?? [] });
}

/**
 * Markeren als te verwijderen, of dat terugdraaien.
 *
 * Verwijderen is nooit onmiddellijk: de persoon wordt inactief en is enkel nog
 * zichtbaar voor een beheerder. Het werkelijke wissen gebeurt later door een
 * geplande taak, zodat een vergissing dezelfde dag nog recht te zetten is.
 */
export async function persoonActief(ctx) {
  const { db, persoon: beheerder, request } = ctx;
  const body = await leesJson(request);
  const id = body?.id;
  const actief = body?.actief ? 1 : 0;
  if (!id) return fout(400, 'id ontbreekt');

  if (id === beheerder.id && !actief) {
    return fout(400, 'je kan jezelf niet op te verwijderen zetten');
  }

  const bestaand = await db.prepare(`SELECT id FROM personen WHERE id = ?`).bind(id).first();
  if (!bestaand) return fout(404, 'die persoon bestaat niet');

  await db
    .prepare(
      `UPDATE personen
          SET actief = ?, inactief_sinds = CASE WHEN ? = 0 THEN datetime('now') ELSE NULL END,
              gewijzigd = datetime('now')
        WHERE id = ?`
    )
    .bind(actief, actief, id)
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: beheerder.id,
    wat: actief ? 'persoon weer actief' : 'persoon op te verwijderen gezet',
    details: id,
  });

  return json({ id, actief: Boolean(actief) });
}

/**
 * Koppelt een bestaande persoon handmatig aan een team als speler, met
 * bron 'club'. Bedoeld voor wie de bond nog niet kent (een recreatieve
 * groep, iemand die net is toegetreden) én voor de testrol: er bestond tot
 * nu toe geen manier om zelf als speler in een ploeg te staan zonder erop te
 * wachten dat de bond het doorgeeft (backlog, punt Y).
 *
 * ledensync.js beschermt een bron-'club'-koppeling expliciet tegen de
 * eerstvolgende VBL-synchronisatie — die zet ze nooit stil op bij_bond = 0.
 */
export async function teamKoppelen(ctx) {
  const { db, persoon: beheerder, request, seizoen } = ctx;
  const body = await leesJson(request);
  const { persoon_id, team_guid } = body ?? {};
  if (!persoon_id || !team_guid) return fout(400, 'persoon_id en team_guid zijn verplicht');

  const persoon = await db.prepare(`SELECT id FROM personen WHERE id = ?`).bind(persoon_id).first();
  if (!persoon) return fout(404, 'die persoon bestaat niet');

  const team = await db
    .prepare(`SELECT guid, naam FROM teams WHERE guid = ? AND seizoen = ?`)
    .bind(team_guid, seizoen.code)
    .first();
  if (!team) return fout(404, 'dat team bestaat niet in dit seizoen');

  await db
    .prepare(
      `INSERT INTO team_spelers (persoon_id, team_guid, seizoen, bron, bij_bond)
            VALUES (?, ?, ?, 'club', 0)
       ON CONFLICT (persoon_id, team_guid, seizoen) DO NOTHING`
    )
    .bind(persoon_id, team_guid, seizoen.code)
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: beheerder.id,
    wat: 'persoon handmatig aan team gekoppeld',
    details: `${persoon_id} → ${team.naam}`,
  });

  return json({ persoon_id, team_guid, seizoen: seizoen.code });
}

/**
 * Ontkoppelt een handmatige teamkoppeling. Enkel bron 'club' — een
 * VBL-gesynchroniseerde koppeling verwijder je hier niet, die loopt via de
 * synchronisatie zelf (bij_bond = 0 wanneer de bond iemand niet meer geeft).
 */
export async function teamOntkoppelen(ctx) {
  const { db, persoon: beheerder, request, seizoen } = ctx;
  const body = await leesJson(request);
  const { persoon_id, team_guid } = body ?? {};
  if (!persoon_id || !team_guid) return fout(400, 'persoon_id en team_guid zijn verplicht');

  const rij = await db
    .prepare(`SELECT bron FROM team_spelers WHERE persoon_id = ? AND team_guid = ? AND seizoen = ?`)
    .bind(persoon_id, team_guid, seizoen.code)
    .first();
  if (!rij) return fout(404, 'die koppeling bestaat niet');
  if (rij.bron !== 'club') {
    return fout(400, 'een koppeling van de bond ontkoppel je hier niet — dat loopt via de synchronisatie');
  }

  await db
    .prepare(`DELETE FROM team_spelers WHERE persoon_id = ? AND team_guid = ? AND seizoen = ?`)
    .bind(persoon_id, team_guid, seizoen.code)
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: beheerder.id,
    wat: 'handmatige teamkoppeling verwijderd',
    details: `${persoon_id} van team ${team_guid}`,
  });

  return json({ persoon_id, team_guid });
}
