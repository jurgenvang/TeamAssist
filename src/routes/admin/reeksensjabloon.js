// Het trainingsuren-sjabloon: welk team op welk moment in welke zaal traint.
//
// Een onbekend team (bijvoorbeeld een categorie die de bond nog niet
// synchroniseert, zoals een recreatieve reeks) laat de import nooit
// mislukken — die rij wordt gerapporteerd en overgeslagen, de rest gaat door.
// Zie src/lib/reeksensjabloonplan.js voor de reden waarom dat bewust anders
// is dan bij het personensjabloon.

import { json, fout } from '../../lib/http.js';
import { csvSchrijven, csvLezen } from '../../lib/csv.js';
import { maakReeksensjabloonplan } from '../../lib/reeksensjabloonplan.js';
import { logSchrijf } from '../../lib/logboek.js';

const KOLOMMEN = [
  { sleutel: 'team_naam', label: 'team_naam' },
  { sleutel: 'zaal', label: 'zaal' },
  { sleutel: 'weekdag', label: 'weekdag' },
  { sleutel: 'begin', label: 'begin' },
  { sleutel: 'einde', label: 'einde' },
  { sleutel: 'seizoen', label: 'seizoen' },
  { sleutel: 'van', label: 'van' },
  { sleutel: 'tot', label: 'tot' },
];

function grenzenVanSeizoen(seizoenCode) {
  const jaar = Number(seizoenCode.slice(0, 4));
  return { van: `${jaar}-08-01`, tot: `${jaar + 1}-06-30` };
}

async function alleTeams(db, seizoen) {
  const rijen = await db.prepare(`SELECT guid, naam, seizoen FROM teams WHERE seizoen = ?`).bind(seizoen).all();
  return rijen.results ?? [];
}

async function alleZalen(db) {
  const rijen = await db.prepare(`SELECT id, naam FROM zalen WHERE actief = 1`).all();
  return rijen.results ?? [];
}

async function alleReeksen(db, seizoen) {
  const rijen = await db
    .prepare(
      `SELECT tr.id, tr.team_guid, t.naam AS team_naam, tr.seizoen, tr.weekdag, tr.begin, tr.einde,
              tr.zaal_id, z.naam AS zaal_naam, tr.van, tr.tot
         FROM trainingsreeksen tr
         JOIN teams t ON t.guid = tr.team_guid AND t.seizoen = tr.seizoen
         LEFT JOIN zalen z ON z.id = tr.zaal_id
        WHERE tr.seizoen = ? AND tr.actief = 1`
    )
    .bind(seizoen)
    .all();
  return rijen.results ?? [];
}

export async function reeksensjabloonExporteren(ctx) {
  const { db, seizoen } = ctx;
  const reeksen = await alleReeksen(db, seizoen.code);

  const rijen = reeksen
    .slice()
    .sort((a, b) => a.team_naam.localeCompare(b.team_naam) || a.weekdag - b.weekdag)
    .map((r) => ({
      team_naam: r.team_naam,
      zaal: r.zaal_naam ?? '',
      weekdag: String(r.weekdag),
      begin: r.begin,
      einde: r.einde,
      seizoen: r.seizoen,
      van: r.van,
      tot: r.tot,
    }));

  const csv = csvSchrijven(rijen, KOLOMMEN);
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="sjabloon-trainingsuren-${seizoen.code}.csv"`,
    },
  });
}

export async function reeksensjabloonImporteren(ctx) {
  const { db, persoon: beheerder, request } = ctx;
  const url = new URL(request.url);
  const uitvoeren = url.searchParams.get('uitvoeren') === '1';

  const csvTekst = await request.text();
  if (!csvTekst.trim()) return fout(400, 'geen bestand ontvangen');

  const csvRijen = csvLezen(csvTekst);
  const seizoenenInBestand = [...new Set(csvRijen.map((r) => r.seizoen?.trim()).filter(Boolean))];
  if (!seizoenenInBestand.length) return fout(400, 'geen enkele rij heeft een seizoen ingevuld');

  let teams = [];
  let reeksen = [];
  for (const s of seizoenenInBestand) {
    teams = teams.concat(await alleTeams(db, s));
    reeksen = reeksen.concat(await alleReeksen(db, s));
  }
  const zalen = await alleZalen(db);

  // Bij meerdere seizoenen in hetzelfde bestand nemen we de grenzen van het
  // eerste als terugval; in de praktijk bevat één bestand typisch één
  // seizoen. Een rij met een eigen van/tot overschrijft dit sowieso.
  const seizoensgrenzen = grenzenVanSeizoen(seizoenenInBestand[0]);

  const plan = maakReeksensjabloonplan(csvRijen, teams, zalen, reeksen, seizoensgrenzen);

  if (!uitvoeren) return json({ droogloop: true, ...plan });

  for (const r of plan.nieuweReeksen) {
    await db
      .prepare(
        `INSERT INTO trainingsreeksen (team_guid, seizoen, weekdag, begin, einde, zaal_id, van, tot)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(r.team_guid, r.seizoen, r.weekdag, r.begin, r.einde, r.zaal_id, r.van, r.tot)
      .run();
  }

  await logSchrijf(db, {
    soort: 'beheer',
    wie: beheerder.id,
    wat: 'trainingsuren-sjabloon ingelezen',
    details:
      `${plan.nieuweReeksen.length} nieuwe reeksen, ${plan.onbekendeTeams.length} onbekende teams ` +
      `(overgeslagen, niet gefaald), ${plan.onbekendeZalen.length} onbekende zalen, ` +
      `${plan.rijfouten.length} rijfouten, ${plan.verdwenenReeksen.length} reeksen niet meer in het bestand`,
    afgehandeld: plan.onbekendeTeams.length || plan.onbekendeZalen.length || plan.verdwenenReeksen.length ? 0 : 1,
  });

  return json({ droogloop: false, ...plan });
}
