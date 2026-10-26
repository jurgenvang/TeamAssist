// Regio (0.37.0, uit YOAssist V31/V41/V42 — `volgsync.js` en
// `routes/admin/aandacht.js`): wedstrijden bij gevolgde, externe clubs met nul
// of één scheidsrechter van de bond, de komende twee weekends, vanaf U14.
//
// Een eigen, lichte synchronisatie, los van de hoofdcyclus: geen scope, geen
// aanduidingen, geen logboek per wijziging — een momentopname. Faalt één club,
// dan gaan de andere door.
//
// Wat de woensdaglijst zei (`bond_officials`, woensdaglijst.js), blijft staan:
// deze synchronisatie kent de lijst niet. Behalve als de wedstrijd verschoof —
// dan ging de lijst over een ander moment.

import { json, fout, leesJson } from '../lib/http.js';
import { logSchrijf } from '../lib/logboek.js';
import { haalVbl, orgDetailUrl } from '../lib/vbl.js';
import { vblDatumNaarIso, vblTijdNaarUur } from '../lib/datum.js';
import { orgMatchesUrl } from './sync.js';
import { scheidsrechters } from './regels.js';

// Een lijst van wat erin mag, niet van wat eruit moet: met de
// uitsluitingslijst van YOAssist vóór V41 glipte G08 erdoor, en elke nieuwe
// jeugdcategorie die de bond ooit invoert.
export const VANAF_U14 = new Set(['G14', 'M14', 'J16', 'M16', 'J18', 'M19', 'J21', 'HSE', 'DSE']);

const schoon = (s) => String(s ?? '').trim();

/** De categoriecode uit een ploeg-GUID ('BVBL1053J16  1' → 'J16'), of null. */
export function categorieUitGuid(teamGuid, clubGuid) {
  if (!teamGuid || !clubGuid || !teamGuid.startsWith(clubGuid)) return null;
  return teamGuid.slice(clubGuid.length, clubGuid.length + 3).trim().toUpperCase() || null;
}

function* alleObjecten(knoop, diepte = 0) {
  if (diepte > 8 || knoop === null || typeof knoop !== 'object') return;
  if (Array.isArray(knoop)) {
    for (const item of knoop) yield* alleObjecten(item, diepte + 1);
    return;
  }
  yield knoop;
  for (const waarde of Object.values(knoop)) yield* alleObjecten(waarde, diepte + 1);
}

function vindNaam(obj, patroon) {
  for (const [sleutel, waarde] of Object.entries(obj)) {
    if (typeof waarde !== 'string' || !waarde.trim() || /guid|id$/i.test(sleutel)) continue;
    if (patroon.test(sleutel)) return waarde.trim();
  }
  return null;
}

/** De clubnaam uit OrgDetailByGuid — de veldnaam staat nergens beschreven, dus zoeken. */
export function leesClubNaam(data) {
  for (const patroon of [/^(org|club)?naam$|^orgNaam$|^clubNaam$/i, /naam|name|oms/i]) {
    for (const obj of alleObjecten(data)) {
      const naam = vindNaam(obj, patroon);
      if (naam && naam.length > 2) return naam;
    }
  }
  return null;
}

/**
 * Zuiver: de thuiswedstrijden van een gevolgde club die op Regio horen.
 * Enkel thuis (bij een uitwedstrijd hoort thuisGuid bij de tegenstander, en
 * dan glipt de categoriefilter door), enkel wat nog komt, geen middernacht
 * (bij de bond meestal een uur dat niet doorkwam), enkel vanaf U14.
 */
export function leesVolgWedstrijden(records, clubGuid, vandaag) {
  const uit = [];
  for (const r of records ?? []) {
    const guid = schoon(r?.guid);
    const datum = vblDatumNaarIso(r?.datumString);
    const uur = vblTijdNaarUur(r?.beginTijd);
    const thuisGuid = schoon(r?.tTGUID);
    if (!guid || !datum || !uur || !thuisGuid.startsWith(clubGuid)) continue;
    if (datum < vandaag || uur === '00:00') continue;
    const cat = categorieUitGuid(thuisGuid, clubGuid);
    if (!VANAF_U14.has(cat)) continue;
    const namen = scheidsrechters(r.wedOff);
    uit.push({
      guid, datum, uur, cat_code: cat,
      thuis_naam: schoon(r.tTNaam) || thuisGuid, uit_naam: schoon(r.tUNaam) || '?',
      vbl_aantal: namen.length,
      // Enkel bij precies één ref is een naam bruikbaar: wie kan aanvullen.
      vbl_naam: namen.length === 1 ? namen[0] : null,
    });
  }
  return uit;
}

/** De synchronisatie van alle gevolgde clubs. Elke dag om 5 uur, of met de knop. */
export async function synchroniseerVolgClubs(db, fetcher = fetch) {
  const clubs = (await db.prepare(`SELECT guid, naam FROM officials_volg_clubs`).all()).results ?? [];
  if (!clubs.length) return { clubs: 0, gevonden: 0, fouten: [] };

  const vandaag = new Date().toISOString().slice(0, 10);
  const fouten = [];
  let gevonden = 0;
  for (const club of clubs) {
    let records;
    try {
      const data = await haalVbl(orgMatchesUrl(club.guid), fetcher);
      records = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
      if (!records) throw new Error('onverwachte vorm van OrgMatchesByGuid (geen lijst)');
    } catch (e) {
      fouten.push(`${club.naam || club.guid}: ${e.message}`);
      continue;
    }

    // Eén stempel voor deze ronde: de opruiming vraagt dan 'wat kreeg deze
    // stempel niet', in plaats van een lijst GUID's (D1: honderd parameters).
    const stempel = new Date().toISOString();
    const rijen = leesVolgWedstrijden(records, club.guid, vandaag);
    if (rijen.length) {
      await db.batch(
        rijen.map((w) =>
          db
            .prepare(
              `INSERT INTO officials_volg_wedstrijden
                 (guid, club_guid, club_naam, thuis_naam, uit_naam, datum, uur, cat_code, vbl_aantal, vbl_naam, laatst_gezien)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (guid) DO UPDATE SET
                 club_naam = excluded.club_naam, thuis_naam = excluded.thuis_naam, uit_naam = excluded.uit_naam,
                 datum = excluded.datum, uur = excluded.uur, cat_code = excluded.cat_code,
                 vbl_aantal = excluded.vbl_aantal, vbl_naam = excluded.vbl_naam, laatst_gezien = excluded.laatst_gezien,
                 bond_officials = CASE
                   WHEN officials_volg_wedstrijden.datum = excluded.datum AND officials_volg_wedstrijden.uur = excluded.uur
                   THEN officials_volg_wedstrijden.bond_officials END`
            )
            .bind(w.guid, club.guid, club.naam, w.thuis_naam, w.uit_naam, w.datum, w.uur, w.cat_code, w.vbl_aantal, w.vbl_naam, stempel)
        )
      );
    }
    gevonden += rijen.length;
    // Alles wat deze stempel niet kreeg, hoort er niet meer bij: verdwenen,
    // voorbij, een andere categorie. Werkt ook bij nul rijen.
    await db.prepare(`DELETE FROM officials_volg_wedstrijden WHERE club_guid = ? AND laatst_gezien != ?`).bind(club.guid, stempel).run();
  }
  return { clubs: clubs.length, gevonden, fouten };
}

// --- de routes (officials.beheren) -------------------------------------------------

/** GET /api/admin/officials/volg-clubs */
export async function volgClubsTonen(ctx) {
  const r = await ctx.db.prepare(`SELECT guid, naam, toegevoegd_door, toegevoegd FROM officials_volg_clubs ORDER BY naam`).all();
  return json({ clubs: r.results ?? [] });
}

/** POST /api/admin/officials/volg-clubs  { guid } — de naam haalt de app zelf op. */
export async function volgClubToevoegen(ctx) {
  const { db, persoon } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const guid = String(body.guid ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2,5}\d{3,5}$/.test(guid)) return fout(400, 'vul de club-GUID in, bijvoorbeeld BVBL1053');
  if (guid === String((await db.prepare(`SELECT waarde FROM instellingen WHERE sleutel = 'club_guid'`).first('waarde')) ?? '').toUpperCase()) {
    return fout(400, 'dat is de eigen club');
  }
  if (await db.prepare(`SELECT 1 FROM officials_volg_clubs WHERE guid = ?`).bind(guid).first()) {
    return fout(409, `${guid} staat al in de lijst`);
  }
  let naam = null;
  try {
    naam = leesClubNaam(await haalVbl(orgDetailUrl(guid)));
  } catch {
    // Een club die nu niet op te halen is, mag toch al in de lijst: de
    // volgende synchronisatie probeert het opnieuw.
  }
  await db.prepare(`INSERT INTO officials_volg_clubs (guid, naam, toegevoegd_door) VALUES (?, ?, ?)`).bind(guid, naam, persoon.id).run();
  await logSchrijf(db, { soort: 'officials', wie: persoon.id, wat: 'Regio: club gevolgd', details: `${guid}${naam ? ` (${naam})` : ''}` });
  return json({ guid, naam });
}

/** POST /api/admin/officials/volg-clubs/weg  { guid } — de wedstrijden gaan mee (cascade). */
export async function volgClubWeg(ctx) {
  const { db, persoon } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const guid = String(body.guid ?? '').trim().toUpperCase();
  const r = await db.prepare(`DELETE FROM officials_volg_clubs WHERE guid = ?`).bind(guid).run();
  if (!r.meta?.changes) return fout(404, 'die club staat niet in de lijst');
  await logSchrijf(db, { soort: 'officials', wie: persoon.id, wat: 'Regio: club niet meer gevolgd', details: guid });
  return json({ guid, verwijderd: true });
}

/**
 * GET /api/admin/officials/regio — de komende twee weekends, nul of één ref.
 * Het hoogste van API en woensdaglijst telt, zoals vblOfficials() bij de eigen
 * wedstrijden: niet in de lijst = de bond voorziet er twee.
 */
export async function regioTonen(ctx) {
  const van = new Date().toISOString().slice(0, 10);
  const tot = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const r = await ctx.db
    .prepare(
      `SELECT guid, club_guid, club_naam, thuis_naam, uit_naam, datum, uur, cat_code, vbl_aantal, vbl_naam, bond_officials
         FROM officials_volg_wedstrijden
        WHERE datum BETWEEN ? AND ? AND max(vbl_aantal, coalesce(bond_officials, 0)) <= 1
        ORDER BY datum, uur, club_naam`
    )
    .bind(van, tot)
    .all();
  const clubs = await ctx.db.prepare(`SELECT COUNT(*) AS n FROM officials_volg_clubs`).first('n');
  return json({
    aantal_clubs: clubs,
    wedstrijden: (r.results ?? []).map((x) => ({
      guid: x.guid, club_guid: x.club_guid, club: x.club_naam, thuis: x.thuis_naam, uit: x.uit_naam,
      datum: x.datum, uur: x.uur, categorie: x.cat_code,
      refs: Math.max(x.vbl_aantal, x.bond_officials ?? 0),
      // 'lijst': de woensdaglijst is al verwerkt; 'api': nog niet (meestal het
      // tweede weekend), dus kan ze woensdag nog verdwijnen.
      bron: x.bond_officials === null ? 'api' : 'lijst',
      naam: x.vbl_naam,
    })),
  });
}

/** POST /api/admin/officials/regio/sync — nu synchroniseren, los van de cron. */
export async function regioSync(ctx) {
  const r = await synchroniseerVolgClubs(ctx.db);
  await logSchrijf(ctx.db, {
    soort: 'sync',
    wie: ctx.persoon?.id ?? null,
    wat: 'Regio gesynchroniseerd',
    details: `${r.clubs} clubs, ${r.gevonden} wedstrijden${r.fouten.length ? `, fouten: ${r.fouten.join(' | ')}` : ''}`,
  });
  return json(r);
}

/**
 * POST /api/admin/officials/regio/leegmaken  { uitvoeren? } — de wedstrijden
 * weg, de gevolgde clubs blijven. Eerst een droogloop (hoeveel), zoals alles
 * wat wist; de volgende synchronisatie bouwt de lijst weer op.
 */
export async function regioLeegmaken(ctx) {
  const body = (await leesJson(ctx.request)) ?? {};
  if (body.uitvoeren !== true) {
    return json({ droogloop: true, zou_wissen: await ctx.db.prepare(`SELECT COUNT(*) AS n FROM officials_volg_wedstrijden`).first('n') });
  }
  const r = await ctx.db.prepare(`DELETE FROM officials_volg_wedstrijden`).run();
  await logSchrijf(ctx.db, { soort: 'officials', wie: ctx.persoon.id, wat: 'Regio: wedstrijdenlijst leeggemaakt', details: `${r.meta?.changes ?? 0} wedstrijden` });
  return json({ gewist: r.meta?.changes ?? 0 });
}
