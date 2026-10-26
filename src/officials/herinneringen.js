// Herinneringen en het weekoverzicht (0.35.0, uit YOAssist `index.js` en
// `routes/admin/herinnering.js`).
//
// Drie soorten, met elk een andere doelgroep:
//  - wie aangeduid is: de avond ervoor (19 uur) en de ochtend zelf (7 uur),
//    elk uit te zetten in de voorkeuren (officials_voorkeuren);
//  - wie voor een weekend nog niets invulde: op vraag van een beheerder;
//  - de beheerders: maandag 8 uur, wat de komende week nog open staat.

import { json, fout, leesJson } from '../lib/http.js';
import { logSchrijf } from '../lib/logboek.js';
import { verwittig } from '../lib/verwittigen.js';
import { brusselDatum, plusDagen } from '../lib/klok.js';
import { aantalNodig, opkomstUur } from './regels.js';
import { beheerders, verwittigAllen } from './ontvangers.js';
import { tekstHerinnering, tekstVulNogIn, tekstWeekoverzicht } from './teksten.js';

/** De wedstrijden in de lijst: seizoen, bij de bond, ploeg met officials, geen forfait. */
const LIJST = `FROM wedstrijden w
  JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
  JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
  LEFT JOIN officials_categorieen c ON c.code = o.cat_code
 WHERE w.seizoen = ?1 AND w.bij_bond = 1 AND t.officials = 1 AND o.scope = 1 AND o.forfait IS NULL`;

/**
 * De herinnering aan wie aangeduid is. Een forfait krijgt er geen: die
 * wedstrijd gaat niet door.
 *
 * @param {{db, env, seizoen}} ctx
 * @param {{avond: boolean, nu?: Date}} o
 */
export async function herinner(ctx, { avond, nu = new Date() }) {
  const { db, seizoen } = ctx;
  const dag = plusDagen(brusselDatum(nu), avond ? 1 : 0);
  const r = await db
    .prepare(
      `SELECT a.persoon_id, p.voornaam, w.begin, w.locatie_tekst, w.tegenstander, t.naam AS ploeg,
              coalesce(v.herinner_avond, 1) AS wil_avond, coalesce(v.herinner_ochtend, 1) AS wil_ochtend
         FROM officials_aanduidingen a
         JOIN personen p ON p.id = a.persoon_id AND p.actief = 1
         JOIN wedstrijden w ON w.id = a.wedstrijd_id
         JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
         JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
         LEFT JOIN officials_voorkeuren v ON v.persoon_id = a.persoon_id
        WHERE a.status = 'toegewezen' AND w.seizoen = ? AND w.bij_bond = 1 AND o.forfait IS NULL
          AND w.datum = ?
        ORDER BY a.persoon_id, w.begin`
    )
    .bind(seizoen.code, dag)
    .all();

  // Per persoon: wie twee wedstrijden fluit, krijgt één bericht met allebei.
  const per = new Map();
  for (const x of r.results ?? []) {
    if (!(avond ? x.wil_avond : x.wil_ochtend)) continue;
    const p = per.get(x.persoon_id) ?? { voornaam: x.voornaam, wedstrijden: [] };
    p.wedstrijden.push({
      uur: x.begin,
      wedstrijd: `${x.ploeg} - ${x.tegenstander ?? '?'}`,
      locatie: x.locatie_tekst,
      opkomst: opkomstUur(x.begin) ?? x.begin,
    });
    per.set(x.persoon_id, p);
  }

  let verstuurd = 0;
  for (const [persoon_id, p] of per) {
    const t = tekstHerinnering({ voornaam: p.voornaam, wanneer: avond ? 'Morgen' : 'Vandaag', wedstrijden: p.wedstrijden });
    const uit = await verwittig(ctx, { persoon_id, soort: 'herinnering', onderwerp: t.onderwerp, inhoud: t.tekst, kort: t.kort })
      .catch(() => ({ verstuurd: false }));
    if (uit?.verstuurd) verstuurd += 1;
  }
  return { dag, personen: per.size, verstuurd };
}

/** Maandag 8 uur: wat er de komende zeven dagen nog niet volledig is aangeduid. */
export async function weekoverzicht(ctx, { nu = new Date() } = {}) {
  const { db, seizoen } = ctx;
  const van = brusselDatum(nu);
  const tot = plusDagen(van, 7);
  const r = await db
    .prepare(
      `SELECT w.datum, w.begin, w.tegenstander, t.naam AS ploeg, o.off_aantal, o.bond_officials, c.groep AS cat_groep,
              (SELECT COUNT(*) FROM officials_aanduidingen a
                WHERE a.wedstrijd_id = w.id AND a.status = 'toegewezen') AS bezet
         ${LIJST} AND w.datum BETWEEN ?2 AND ?3
        ORDER BY w.datum, w.begin, t.naam`
    )
    .bind(seizoen.code, van, tot)
    .all();
  const open = (r.results ?? [])
    .map((x) => ({
      datum: x.datum,
      uur: x.begin,
      thuis: x.ploeg,
      uit: x.tegenstander,
      catGroep: x.cat_groep,
      nogNodig: aantalNodig(x.off_aantal, { bondOfficials: x.bond_officials }) - x.bezet,
    }))
    .filter((x) => x.nogNodig > 0);
  const t = tekstWeekoverzicht({
    u10u12: open.filter((x) => x.catGroep === 'U10U12'),
    overig: open.filter((x) => x.catGroep !== 'U10U12'),
    van,
    tot,
  });
  const verstuurd = await verwittigAllen(ctx, await beheerders(db), t);
  return { open: open.length, verstuurd };
}

/**
 * POST /api/admin/officials/vul-nog-in  { zaterdag: 'jjjj-mm-dd' }
 *
 * Een herinnering aan wie voor geen enkele wedstrijd van het weekend iets
 * invulde. Enkel wat die persoon kan zien: een YO kijkt alleen naar U10/U12,
 * en hoeft dus niet te antwoorden voor een U16 (in YOAssist kreeg hij die wel).
 *
 * Bewust geen droogloop, zoals in YOAssist: een gerichte actie die een
 * beheerder zelf start, voor de officials van één weekend — geen mededeling
 * aan de hele club.
 */
export async function vulNogIn(ctx) {
  const { db, seizoen, persoon: beheerder } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const zaterdag = String(body.zaterdag ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(zaterdag)) return fout(400, 'kies een zaterdag om het weekend te bepalen');
  const zondag = plusDagen(zaterdag, 1);

  const w = await db
    .prepare(
      `SELECT w.id, w.datum, w.begin, w.tegenstander, t.naam AS ploeg, c.groep AS cat_groep
         ${LIJST} AND w.datum BETWEEN ?2 AND ?3
        ORDER BY w.datum, w.begin, t.naam`
    )
    .bind(seizoen.code, zaterdag, zondag)
    .all();
  const wedstrijden = w.results ?? [];
  if (!wedstrijden.length) return fout(404, 'er staan geen wedstrijden in de lijst voor dat weekend');

  // Wie welke wedstrijden van dat weekend al beantwoordde: op de voorwaarden,
  // niet met een lijst id's (D1: honderd parameters).
  const b = await db
    .prepare(
      `SELECT DISTINCT b.persoon_id, b.wedstrijd_id
         FROM officials_beschikbaarheid b
         JOIN wedstrijden w ON w.id = b.wedstrijd_id
        WHERE w.seizoen = ? AND w.datum BETWEEN ? AND ?`
    )
    .bind(seizoen.code, zaterdag, zondag)
    .all();
  const antwoord = new Set((b.results ?? []).map((x) => `${x.persoon_id}|${x.wedstrijd_id}`));

  const o = await db
    .prepare(
      `SELECT p.id, p.voornaam, p.achternaam, max(CASE WHEN r.rol = 'YOPLUS' THEN 1 ELSE 0 END) AS vanaf_u14
         FROM rollen r JOIN personen p ON p.id = r.persoon_id AND p.actief = 1
        WHERE r.rol IN ('YO', 'YOPLUS')
        GROUP BY p.id ORDER BY p.voornaam, p.achternaam`
    )
    .all();

  const teHerinneren = [];
  for (const p of o.results ?? []) {
    const zichtbaar = wedstrijden.filter((x) => p.vanaf_u14 || x.cat_groep === 'U10U12');
    if (!zichtbaar.length) continue;
    if (zichtbaar.some((x) => antwoord.has(`${p.id}|${x.id}`))) continue;
    teHerinneren.push({ ...p, wedstrijden: zichtbaar });
  }

  const namen = teHerinneren.map((p) => `${p.voornaam} ${p.achternaam}`.trim());
  if (!teHerinneren.length) {
    return json({ aantal: 0, verstuurd: 0, namen, van: zaterdag, tot: zondag, boodschap: 'Iedereen heeft al geantwoord.' });
  }

  let verstuurd = 0;
  for (const p of teHerinneren) {
    const t = tekstVulNogIn({
      voornaam: p.voornaam,
      van: zaterdag,
      tot: zondag,
      wedstrijden: p.wedstrijden.map((x) => ({ datum: x.datum, uur: x.begin, thuis: x.ploeg, uit: x.tegenstander })),
    });
    const uit = await verwittig(ctx, { persoon_id: p.id, soort: 'officials', onderwerp: t.onderwerp, inhoud: t.tekst, kort: t.kort })
      .catch(() => ({ verstuurd: false }));
    if (uit?.verstuurd) verstuurd += 1;
  }
  await logSchrijf(db, {
    soort: 'officials',
    wie: beheerder.id,
    wat: `herinnering 'nog in te vullen' verstuurd (${verstuurd} van ${teHerinneren.length})`,
    details: `weekend ${zaterdag} — ${zondag}: ${namen.join(', ')}`.slice(0, 2000),
  });
  return json({ aantal: teHerinneren.length, verstuurd, namen, van: zaterdag, tot: zondag });
}
