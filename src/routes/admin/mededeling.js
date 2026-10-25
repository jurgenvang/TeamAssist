// Belangrijk nieuws plaatsen (0.28.0, uit YOAssist).
//
// Eén mededeling tegelijk: een nieuwe zet de vorige op inactief. De beheerder
// kiest de doelgroep (doelgroep.js); wie daarin zit en een account heeft,
// krijgt ze ook als bericht. Zoals overal waar iets de deur uitgaat: eerst
// een droogloop — dit kan naar de hele club tegelijk gaan, een verkeerde klik
// is hier duurder dan elders.

import { json, fout, leesJson } from '../../lib/http.js';
import { DOELGROEPEN, ontvangers } from '../../lib/doelgroep.js';
import { verwittigVelen } from '../../lib/verwittigen.js';
import { logSchrijf } from '../../lib/logboek.js';
import { korteRegel } from '../berichten.js';

/** GET /api/admin/mededeling — de huidige, met hoeveel mensen ze wegklikten. */
export async function mededelingHuidige(ctx) {
  const { db } = ctx;
  const m = await db
    .prepare(
      `SELECT id, tekst, link, link_tekst, doelgroep, team_guid, geldig_tot, gezet_op
         FROM mededelingen
        WHERE actief = 1 AND geldig_tot > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ORDER BY id DESC LIMIT 1`
    )
    .first();
  const weggeklikt = m
    ? await db.prepare(`SELECT count(*) AS n FROM mededeling_gezien WHERE mededeling_id = ?`).bind(m.id).first('n')
    : 0;
  return json({ mededeling: m ?? null, weggeklikt });
}

/**
 * Wat de beheerder invulde, nagekeken. Geeft { fout } of de genormaliseerde
 * velden terug.
 */
export function keurMededelingGoed(body, nu = new Date()) {
  const tekst = String(body?.tekst ?? '').trim();
  if (tekst.length < 3) return { fout: 'Schrijf wat je wil meedelen.' };
  if (tekst.length > 500) return { fout: 'Houd het kort: een banner van vijf regels leest niemand.' };

  const tot = new Date(String(body?.geldig_tot ?? ''));
  if (Number.isNaN(tot.getTime())) return { fout: 'Geef aan tot wanneer dit getoond moet worden.' };
  if (tot <= nu) return { fout: 'Die einddatum ligt in het verleden.' };

  const link = String(body?.link ?? '').trim() || null;
  if (link && !/^https?:\/\//.test(link)) return { fout: 'Een link begint met http:// of https://.' };

  const doelgroep = body?.doelgroep ?? 'iedereen';
  if (!DOELGROEPEN.includes(doelgroep)) return { fout: `doelgroep moet een van ${DOELGROEPEN.join(', ')} zijn` };
  const team_guid = doelgroep === 'ploeg' ? String(body?.team_guid ?? '').trim() : null;
  if (doelgroep === 'ploeg' && !team_guid) return { fout: 'Kies de ploeg.' };

  return {
    tekst,
    link,
    link_tekst: link ? String(body?.link_tekst ?? '').trim() || null : null,
    // Als tekst bewaard in UTC met Z: zo vergelijkt de databank hem rechtstreeks
    // met strftime('%Y-%m-%dT%H:%M:%fZ', 'now').
    geldig_tot: tot.toISOString(),
    doelgroep,
    team_guid,
  };
}

/**
 * POST /api/admin/mededeling
 *   { tekst, link?, link_tekst?, geldig_tot, doelgroep, team_guid?, bericht?, uitvoeren? }
 *
 * bericht: false plaatst enkel de banner, zonder mail of Mijn berichten.
 */
export async function mededelingPlaatsen(ctx) {
  const { db, persoon, seizoen, request } = ctx;
  const body = (await leesJson(request)) ?? {};
  const m = keurMededelingGoed(body);
  if (m.fout) return fout(400, m.fout);

  if (m.team_guid) {
    const ploeg = await db
      .prepare(`SELECT 1 FROM teams WHERE guid = ? AND seizoen = ?`)
      .bind(m.team_guid, seizoen.code)
      .first();
    if (!ploeg) return fout(400, 'Die ploeg bestaat niet in dit seizoen.');
  }

  const metBericht = body.bericht !== false;
  const lijst = metBericht ? await ontvangers(db, { ...m, seizoen: seizoen.code }) : [];

  if (body.uitvoeren !== true) {
    return json({
      uitgevoerd: false,
      ontvangers: lijst.length,
      zonder_mail: lijst.filter((o) => !o.email).length,
      voorbeeld: m,
    });
  }

  await db.prepare(`UPDATE mededelingen SET actief = 0 WHERE actief = 1`).run();
  const res = await db
    .prepare(
      `INSERT INTO mededelingen (tekst, link, link_tekst, doelgroep, team_guid, seizoen, geldig_tot, gezet_door)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(m.tekst, m.link, m.link_tekst, m.doelgroep, m.team_guid, seizoen.code, m.geldig_tot, persoon.id)
    .run();

  let uitkomst = { verstuurd: 0, mislukt: 0, zonderMail: 0 };
  if (metBericht && lijst.length) {
    uitkomst = await verwittigVelen(ctx, lijst, {
      onderwerp: 'Bericht van de club',
      inhoud: m.tekst + (m.link ? `\n\n${m.link_tekst ? `${m.link_tekst}: ` : ''}${m.link}` : ''),
      soort: 'nieuws',
      kort: korteRegel(null, m.tekst),
    });
  }

  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: 'mededeling geplaatst',
    details: `${m.doelgroep}${m.team_guid ? ` ${m.team_guid}` : ''}, tot ${m.geldig_tot}: ${m.tekst.slice(0, 120)}` +
      ` — ${uitkomst.verstuurd} verstuurd, ${uitkomst.mislukt} mislukt`,
  });

  return json({ uitgevoerd: true, id: res.meta?.last_row_id ?? null, ontvangers: lijst.length, ...uitkomst });
}

/** POST /api/admin/mededeling/intrekken — de banner weghalen; berichten blijven. */
export async function mededelingIntrekken(ctx) {
  const { db, persoon } = ctx;
  const res = await db.prepare(`UPDATE mededelingen SET actief = 0 WHERE actief = 1`).run();
  await logSchrijf(db, { soort: 'beheer', wie: persoon.id, wat: 'mededeling ingetrokken' });
  return json({ ingetrokken: res.meta?.changes ?? 0 });
}
