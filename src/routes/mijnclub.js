// Mijn club (T7): alle wedstrijden van de gevolgde ploegen op één plek, en per
// persoon welke ploegen hij ziet en welke hij 'op de hoogte houdt'.
//
// Een bewuste afwijking van punt F (backlog): ook een speler of ouder ziet hier
// wedstrijden van andere ploegen. Datum, uur, zaal en uitslag zijn geen
// aanwezigheidsgegevens; elke andere plek in de app blijft strenger.
//
// Wie het is, komt uit het token; geen `namens` — het is een voorkeur van wie
// aangemeld is, ook een ouder die voor zijn kinderen kijkt.

import { json, fout, leesJson } from '../lib/http.js';
import { brusselDatum } from '../lib/klok.js';
import { mijnclubVenster, toonPloegen, netteUitslag } from '../lib/mijnclub.js';
import { ploegenVan } from './mij.js';
import { wedstrijdbladUrl } from '../officials/routes.js';

async function gevolgdePloegen(db, seizoen) {
  const r = await db
    .prepare(
      `SELECT guid, naam, naam_kort, categorie FROM teams
        WHERE seizoen = ? AND gevolgd = 1 AND bij_bond = 1
        ORDER BY categorie, naam`
    )
    .bind(seizoen)
    .all();
  return r.results ?? [];
}

async function keuzesVan(db, persoonId) {
  const r = await db
    .prepare(`SELECT team_guid, tonen, op_de_hoogte FROM mijnclub_ploegen WHERE persoon_id = ?`)
    .bind(persoonId)
    .all();
  return r.results ?? [];
}

/** De gevolgde ploegen met wat deze persoon er van ziet. */
async function ploegenVoor(ctx) {
  const { db, persoon, seizoen } = ctx;
  const ploegen = await gevolgdePloegen(db, seizoen.code);
  const eigen = new Set((await ploegenVan(db, persoon.id, seizoen.code, false)).map((p) => p.guid));
  const keuzes = await keuzesVan(db, persoon.id);
  return {
    ploegen: toonPloegen(ploegen, eigen, keuzes),
    gekozen: keuzes.some((k) => k.tonen === 0 || k.tonen === 1),
  };
}

/** GET /api/mijnclub[?van=&tot=] — de wedstrijden in het venster, en de ploegen. */
export async function mijnclubTonen(ctx) {
  const { db, request, seizoen } = ctx;
  const url = new URL(request.url);
  const standaard = mijnclubVenster(brusselDatum());
  const datum = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s ?? '') ? s : null);
  const van = datum(url.searchParams.get('van')) ?? standaard.van;
  const tot = datum(url.searchParams.get('tot')) ?? standaard.tot;
  if (tot < van) return fout(400, 'tot moet na van liggen');

  const { ploegen, gekozen } = await ploegenVoor(ctx);
  const getoond = new Set(ploegen.filter((p) => p.tonen).map((p) => p.guid));

  // Filteren op voorwaarden en daarna in JavaScript op de getoonde ploegen,
  // niet met een IN-lijst van GUID's: D1 staat honderd parameters toe.
  const r = await db
    .prepare(
      `SELECT w.id, w.wedstrijd_guid, w.team_guid, w.datum, w.begin, w.thuis, w.tegenstander,
              w.locatie_tekst, w.uitslag, w.status, o.forfait
         FROM wedstrijden w
         JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
         LEFT JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
        WHERE w.seizoen = ?1 AND t.gevolgd = 1 AND w.bij_bond = 1 AND w.datum >= ?2 AND w.datum <= ?3
        ORDER BY w.datum, w.begin`
    )
    .bind(seizoen.code, van, tot)
    .all();
  const naamVan = new Map(ploegen.map((p) => [p.guid, p.naam_kort || p.naam]));
  const wedstrijden = (r.results ?? [])
    .filter((w) => getoond.has(w.team_guid))
    .map((w) => ({
      id: w.id,
      datum: w.datum,
      uur: w.begin,
      ploeg: naamVan.get(w.team_guid),
      team_guid: w.team_guid,
      thuis: w.thuis === 1,
      tegenstander: w.tegenstander,
      locatie: w.locatie_tekst,
      uitslag: netteUitslag(w.uitslag),
      forfait: w.forfait ?? null,
      status: w.status,
      wedstrijdblad: wedstrijdbladUrl(w.wedstrijd_guid),
    }));

  return json({ van, tot, gekozen, ploegen, wedstrijden });
}

/** GET /api/mijnclub/ploegen — enkel de keuze, voor Mijn voorkeuren. */
export async function mijnclubPloegen(ctx) {
  return json(await ploegenVoor(ctx));
}

/**
 * POST /api/mijnclub/keuze  { ploegen: [{ team_guid, tonen, op_de_hoogte }] }
 *
 * De volledige keuze, voor alle gevolgde ploegen samen: zo is ze daarna een
 * gemaakte keuze en geen standaard meer. Een ploeg die niet gevolgd wordt,
 * wordt geweigerd. In één batch: alles of niets.
 */
export async function mijnclubKeuzeBewaren(ctx) {
  const { db, persoon, request, seizoen } = ctx;
  const body = (await leesJson(request)) ?? {};
  if (!Array.isArray(body.ploegen)) return fout(400, 'ploegen ontbreekt');
  const gevolgd = new Set((await gevolgdePloegen(db, seizoen.code)).map((p) => p.guid));
  const bit = (v) => (v === true || v === 1 ? 1 : v === false || v === 0 ? 0 : null);
  const rijen = [];
  for (const k of body.ploegen) {
    if (!gevolgd.has(k?.team_guid)) return fout(400, `onbekende of niet gevolgde ploeg: ${k?.team_guid}`);
    const tonen = bit(k.tonen);
    const hoogte = bit(k.op_de_hoogte);
    if (tonen === null || hoogte === null) return fout(400, 'tonen en op_de_hoogte moeten ja of nee zijn');
    rijen.push([k.team_guid, tonen, hoogte]);
  }
  await db.batch([
    db.prepare(`DELETE FROM mijnclub_ploegen WHERE persoon_id = ?`).bind(persoon.id),
    ...rijen.map(([guid, tonen, hoogte]) =>
      db
        .prepare(`INSERT INTO mijnclub_ploegen (persoon_id, team_guid, tonen, op_de_hoogte) VALUES (?, ?, ?, ?)`)
        .bind(persoon.id, guid, tonen, hoogte)
    ),
  ]);
  return json(await ploegenVoor(ctx));
}
