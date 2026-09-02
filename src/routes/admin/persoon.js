// Een persoon bekijken en aanpassen.
//
// Dit is de plek waar de bron-vlag zich moet bewijzen. Zet een beheerder een
// naam of een geboortedatum recht, dan gaat dat gegeven op 'club' en laat de
// synchronisatie het voortaan met rust. Zonder die vlag zou elke correctie de
// eerstvolgende nacht weer verdwijnen — precies waarvoor ze bedacht is.
//
// Velden die de bond levert en die de club niet hoort te wijzigen — de
// relatie-GUID, het lidnummer, de naam zoals de bond ze geeft — staan niet in
// de lijst van aanpasbare velden. Ze zijn zichtbaar maar niet aan te passen:
// het zijn geen gegevens van de club.

import { json, fout, leesJson } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';

// Wat een beheerder mag wijzigen, en welke bron-vlag daarbij hoort.
export const AANPASBAAR = {
  voornaam: { bron: 'naam_bron' },
  achternaam: { bron: 'naam_bron' },
  geboortedatum: { bron: 'geboortedatum_bron' },
  email: {},
  tel_vast: {},
  tel_gsm: {},
  gsm_delen: {},
  straat: {},
  nummer: {},
  bus: {},
  postcode: {},
  gemeente: {},
};

function schoon(waarde) {
  if (waarde === null || waarde === undefined) return null;
  const tekst = String(waarde).trim();
  return tekst === '' ? null : tekst;
}

export function controleer(velden) {
  const fouten = [];

  if (Object.hasOwn(velden, 'geboortedatum') && velden.geboortedatum !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(velden.geboortedatum)) {
      fouten.push('geboortedatum moet jjjj-mm-dd zijn');
    } else {
      const d = new Date(`${velden.geboortedatum}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || !velden.geboortedatum.endsWith(String(d.getUTCDate()).padStart(2, '0'))) {
        fouten.push('die geboortedatum bestaat niet');
      }
    }
  }

  if (Object.hasOwn(velden, 'email') && velden.email !== null) {
    if (!velden.email.includes('@') || /\s/.test(velden.email)) {
      fouten.push('dat is geen e-mailadres');
    }
  }

  if (Object.hasOwn(velden, 'gsm_delen') && !['begeleiding', 'team'].includes(velden.gsm_delen)) {
    fouten.push("gsm_delen moet 'begeleiding' of 'team' zijn");
  }

  // Een persoon zonder enige naam is later niet meer terug te vinden.
  for (const veld of ['voornaam', 'achternaam']) {
    if (Object.hasOwn(velden, veld) && veld === 'achternaam' && velden[veld] === null) {
      fouten.push('een achternaam is verplicht');
    }
  }

  return fouten;
}

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

  const bestaand = await db.prepare(`SELECT * FROM personen WHERE id = ?`).bind(id).first();
  if (!bestaand) return fout(404, 'die persoon bestaat niet');

  // Enkel velden die aangepast mogen worden. Wat er verder in de body staat,
  // wordt genegeerd in plaats van geweigerd: een frontend die een extra veld
  // meestuurt, hoort daar niet op vast te lopen.
  const velden = {};
  for (const veld of Object.keys(AANPASBAAR)) {
    if (Object.hasOwn(body, veld)) velden[veld] = schoon(body[veld]);
  }
  if (!Object.keys(velden).length) return fout(400, 'er valt niets te wijzigen');

  const fouten = controleer(velden);
  if (fouten.length) return fout(400, fouten.join('; '));

  // Enkel wat werkelijk verandert. Anders zou een scherm dat alles terugstuurt
  // elke bron-vlag op 'club' zetten en de synchronisatie volledig uitschakelen.
  const gewijzigd = Object.entries(velden).filter(([veld, waarde]) => (bestaand[veld] ?? null) !== waarde);
  if (!gewijzigd.length) return json({ id, gewijzigd: [] });

  const bronnen = new Set();
  for (const [veld] of gewijzigd) {
    const bron = AANPASBAAR[veld].bron;
    if (bron) bronnen.add(bron);
  }

  const stukken = gewijzigd.map(([veld]) => `${veld} = ?`);
  const waarden = gewijzigd.map(([, waarde]) => waarde);
  for (const bron of bronnen) stukken.push(`${bron} = 'club'`);
  stukken.push(`gewijzigd = datetime('now')`);

  try {
    await db
      .prepare(`UPDATE personen SET ${stukken.join(', ')} WHERE id = ?`)
      .bind(...waarden, id)
      .run();
  } catch (e) {
    // Het e-mailadres is de sleutel naar een account; twee personen met
    // hetzelfde adres kan niet.
    if (String(e.message).toLowerCase().includes('unique')) {
      return fout(409, 'dat e-mailadres staat al bij iemand anders');
    }
    throw e;
  }

  await logSchrijf(db, {
    soort: 'beheer',
    wie: beheerder.id,
    wat: 'persoon aangepast',
    details: `${id}: ${gewijzigd.map(([veld]) => veld).join(', ')}`,
  });

  return json({ id, gewijzigd: gewijzigd.map(([veld]) => veld), bron_gezet: [...bronnen] });
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
    // Zichzelf op inactief zetten sluit de beheerder buiten, en dan is de
    // D1-console de enige weg terug.
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
