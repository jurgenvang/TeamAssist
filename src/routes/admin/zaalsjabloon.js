// Het zaaluren-sjabloon: exporteren, en inlezen met een droogloop.
//
// Vooraf ingevuld met wat er al staat, net als het personensjabloon — een
// beheerder corrigeert in plaats van van nul te beginnen. Een onbekende
// zaalnaam wordt als nieuwe zaal aangemaakt bij het uitvoeren, zichtbaar
// vermeld in de droogloop; niets wordt ooit stil verwijderd.

import { json, fout } from '../../lib/http.js';
import { csvSchrijven, csvLezen } from '../../lib/csv.js';
import { maakZaalsjabloonplan } from '../../lib/zaalsjabloonplan.js';
import { logSchrijf } from '../../lib/logboek.js';

const KOLOMMEN = [
  { sleutel: 'zaal', label: 'zaal' },
  { sleutel: 'weekdag', label: 'weekdag' },
  { sleutel: 'begin', label: 'begin' },
  { sleutel: 'einde', label: 'einde' },
  { sleutel: 'seizoen', label: 'seizoen' },
];

async function alleZalen(db) {
  const rijen = await db.prepare(`SELECT id, naam FROM zalen WHERE actief = 1`).all();
  return rijen.results ?? [];
}

async function alleBlokken(db, seizoen) {
  const rijen = await db
    .prepare(
      `SELECT zb.id, zb.zaal_id, z.naam AS zaal_naam, zb.seizoen, zb.weekdag, zb.begin, zb.einde
         FROM zaal_blokken zb
         JOIN zalen z ON z.id = zb.zaal_id
        WHERE zb.seizoen = ?`
    )
    .bind(seizoen)
    .all();
  return rijen.results ?? [];
}

export async function zaalsjabloonExporteren(ctx) {
  const { db, seizoen } = ctx;
  const blokken = await alleBlokken(db, seizoen.code);

  const rijen = blokken
    .slice()
    .sort((a, b) => a.zaal_naam.localeCompare(b.zaal_naam) || a.weekdag - b.weekdag || a.begin.localeCompare(b.begin))
    .map((b) => ({
      zaal: b.zaal_naam,
      weekdag: String(b.weekdag),
      begin: b.begin,
      einde: b.einde,
      seizoen: b.seizoen,
    }));

  const csv = csvSchrijven(rijen, KOLOMMEN);
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="sjabloon-zaaluren-${seizoen.code}.csv"`,
    },
  });
}

export async function zaalsjabloonImporteren(ctx) {
  const { db, persoon: beheerder, request } = ctx;
  const url = new URL(request.url);
  const uitvoeren = url.searchParams.get('uitvoeren') === '1';

  const csvTekst = await request.text();
  if (!csvTekst.trim()) return fout(400, 'geen bestand ontvangen');

  const csvRijen = csvLezen(csvTekst);
  const seizoenenInBestand = [...new Set(csvRijen.map((r) => r.seizoen?.trim()).filter(Boolean))];

  const zalen = await alleZalen(db);
  // Blokken van elk seizoen dat in het bestand voorkomt, niet enkel het
  // huidige — dit sjabloon is bewust seizoensoverstijgend, zodat je het
  // rooster van een nog niet actief seizoen al kan voorbereiden.
  let blokken = [];
  for (const s of seizoenenInBestand) blokken = blokken.concat(await alleBlokken(db, s));

  const plan = maakZaalsjabloonplan(csvRijen, zalen, blokken);

  if (!uitvoeren) return json({ droogloop: true, ...plan });

  const zaalIdOpNaam = new Map(zalen.map((z) => [z.naam.trim().toLowerCase(), z.id]));
  for (const naam of plan.nieuweZalen) {
    const id = `z-${crypto.randomUUID()}`;
    await db.prepare(`INSERT INTO zalen (id, naam) VALUES (?, ?)`).bind(id, naam).run();
    zaalIdOpNaam.set(naam.toLowerCase(), id);
  }

  for (const b of plan.nieuweBlokken) {
    const zaalId = b.zaal_id ?? zaalIdOpNaam.get(b.zaal_naam.toLowerCase());
    await db
      .prepare(`INSERT INTO zaal_blokken (zaal_id, seizoen, weekdag, begin, einde) VALUES (?, ?, ?, ?, ?)`)
      .bind(zaalId, b.seizoen, b.weekdag, b.begin, b.einde)
      .run();
  }

  await logSchrijf(db, {
    soort: 'beheer',
    wie: beheerder.id,
    wat: 'zaaluren-sjabloon ingelezen',
    details:
      `${plan.nieuweZalen.length} nieuwe zalen, ${plan.nieuweBlokken.length} nieuwe blokken, ` +
      `${plan.rijfouten.length} rijfouten, ${plan.verdwenenBlokken.length} blokken niet meer in het bestand`,
    afgehandeld: plan.verdwenenBlokken.length ? 0 : 1,
  });

  return json({ droogloop: false, ...plan });
}
