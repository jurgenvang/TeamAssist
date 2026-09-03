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
      `SELECT t.guid, t.naam, t.categorie, ts.bij_bond
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
