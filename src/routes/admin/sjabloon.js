// Het sjabloon: exporteren, en inlezen met een droogloop.
//
// Vooraf ingevuld exporteren per ploeg, zodat een beheerder corrigeert in
// plaats van overtypt (backlog, punt A). Bij het inlezen wordt nooit een
// nieuwe speler geraden — een onbekende id is een fout, geen aanleiding om te
// matchen op naam zoals bij de VBL-synchronisatie. Die spelers komen al uit
// de bond; dit sjabloon vult enkel aan wat de bond niet levert.

import { json, fout } from '../../lib/http.js';
import { csvSchrijven, csvLezen } from '../../lib/csv.js';
import { pasPersoonAan } from '../../lib/persoonwijzigen.js';
import { maakSjabloonplan } from '../../lib/sjabloonplan.js';
import { logSchrijf } from '../../lib/logboek.js';

const KOLOMMEN = [
  { sleutel: 'id', label: 'id' },
  { sleutel: 'lidnummer', label: 'lidnummer' },
  { sleutel: 'naam_bond', label: 'naam_bond' },
  { sleutel: 'voornaam', label: 'voornaam' },
  { sleutel: 'achternaam', label: 'achternaam' },
  { sleutel: 'geboortedatum', label: 'geboortedatum' },
  { sleutel: 'email_speler', label: 'email_speler' },
  { sleutel: 'email_ouder', label: 'email_ouder' },
  { sleutel: 'tel_vast', label: 'tel_vast' },
  { sleutel: 'tel_gsm', label: 'tel_gsm' },
  { sleutel: 'straat', label: 'straat' },
  { sleutel: 'nummer', label: 'nummer' },
  { sleutel: 'bus', label: 'bus' },
  { sleutel: 'postcode', label: 'postcode' },
  { sleutel: 'gemeente', label: 'gemeente' },
];

async function spelersVanTeam(db, teamGuid, seizoen) {
  const rijen = await db
    .prepare(
      `SELECT p.* FROM team_spelers ts
         JOIN personen p ON p.id = ts.persoon_id
        WHERE ts.team_guid = ? AND ts.seizoen = ? AND p.actief = 1
        ORDER BY p.achternaam, p.voornaam`
    )
    .bind(teamGuid, seizoen)
    .all();
  return rijen.results ?? [];
}

async function ouderkoppelingenVanTeam(db, teamGuid, seizoen) {
  // Een join op team_spelers in plaats van filteren op een lijst kind-id's:
  // dat laatste zou bij een grote ploeg de honderd-parametergrens van D1
  // kunnen raken.
  const rijen = await db
    .prepare(
      `SELECT ok.kind_id, ok.ouder_id, p.email AS ouder_email
         FROM ouder_kind ok
         JOIN personen p ON p.id = ok.ouder_id
        WHERE ok.kind_id IN (SELECT persoon_id FROM team_spelers WHERE team_guid = ? AND seizoen = ?)
          AND p.email IS NOT NULL`
    )
    .bind(teamGuid, seizoen)
    .all();
  return rijen.results ?? [];
}

export async function sjabloonExporteren(ctx) {
  const { db, request, seizoen } = ctx;
  const team = new URL(request.url).searchParams.get('team');
  if (!team) return fout(400, 'team ontbreekt');

  const ploeg = await db
    .prepare(`SELECT naam FROM teams WHERE guid = ? AND seizoen = ?`)
    .bind(team, seizoen.code)
    .first();
  if (!ploeg) return fout(404, 'die ploeg bestaat niet in dit seizoen');

  const spelers = await spelersVanTeam(db, team, seizoen.code);
  const koppelingen = await ouderkoppelingenVanTeam(db, team, seizoen.code);
  const emailsPerKind = new Map();
  for (const k of koppelingen) {
    if (!emailsPerKind.has(k.kind_id)) emailsPerKind.set(k.kind_id, []);
    emailsPerKind.get(k.kind_id).push(k.ouder_email);
  }

  const rijen = spelers.map((p) => ({
    id: p.id,
    lidnummer: p.lid_nr ?? '',
    naam_bond: p.naam_vbl ?? '',
    voornaam: p.voornaam ?? '',
    achternaam: p.achternaam ?? '',
    geboortedatum: p.geboortedatum ?? '',
    email_speler: p.email ?? '',
    email_ouder: (emailsPerKind.get(p.id) ?? []).join('; '),
    tel_vast: p.tel_vast ?? '',
    tel_gsm: p.tel_gsm ?? '',
    straat: p.straat ?? '',
    nummer: p.nummer ?? '',
    bus: p.bus ?? '',
    postcode: p.postcode ?? '',
    gemeente: p.gemeente ?? '',
  }));

  const csv = csvSchrijven(rijen, KOLOMMEN);
  const bestandsnaam = `sjabloon-${(ploeg.naam || team).replace(/[^\w-]+/g, '_')}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${bestandsnaam}"`,
    },
  });
}

async function bouwPlan(db, teamGuid, seizoen, csvTekst) {
  const rijen = csvLezen(csvTekst);
  const spelers = await spelersVanTeam(db, teamGuid, seizoen);
  const koppelingen = await ouderkoppelingenVanTeam(db, teamGuid, seizoen);
  const alleActieven = await db
    .prepare(`SELECT id, email FROM personen WHERE actief = 1 AND email IS NOT NULL`)
    .all();

  return maakSjabloonplan(rijen, spelers, koppelingen, alleActieven.results ?? []);
}

function nieuwId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function sjabloonImporteren(ctx) {
  const { db, persoon: beheerder, request, seizoen } = ctx;
  const url = new URL(request.url);
  const team = url.searchParams.get('team');
  const uitvoeren = url.searchParams.get('uitvoeren') === '1';
  if (!team) return fout(400, 'team ontbreekt');

  const ploeg = await db
    .prepare(`SELECT guid FROM teams WHERE guid = ? AND seizoen = ?`)
    .bind(team, seizoen.code)
    .first();
  if (!ploeg) return fout(404, 'die ploeg bestaat niet in dit seizoen');

  const csvTekst = await request.text();
  if (!csvTekst.trim()) return fout(400, 'geen bestand ontvangen');

  const plan = await bouwPlan(db, team, seizoen.code, csvTekst);

  if (!uitvoeren) return json({ droogloop: true, team, ...plan });

  for (const w of plan.spelerwijzigingen) {
    // Een fout hier zou betekenen dat de droogloop iets goedkeurde wat de
    // databank alsnog weigert (bijvoorbeeld een e-mailadres dat intussen door
    // iemand anders is ingenomen). Dat komt in het logboek terecht in plaats
    // van de hele import te laten stoppen — de andere rijen zijn onafhankelijk
    // van elkaar.
    const uitkomst = await pasPersoonAan(db, w.id, w.velden);
    if (uitkomst.fout) {
      await logSchrijf(db, {
        soort: 'fout',
        wie: beheerder.id,
        wat: 'sjabloonrij niet toegepast',
        details: `${w.naam} (${w.id}): ${uitkomst.fout}`,
        afgehandeld: 0,
      });
    }
  }

  for (const k of plan.nieuweOuderkoppelingen) {
    let ouderId = k.bestaande_persoon_id;
    if (!ouderId) {
      ouderId = nieuwId('p');
      await db
        .prepare(`INSERT INTO personen (id, voornaam, achternaam, email) VALUES (?, '', '', ?)`)
        .bind(ouderId, k.email)
        .run();
    }
    await db
      .prepare(`INSERT INTO ouder_kind (ouder_id, kind_id) VALUES (?, ?) ON CONFLICT DO NOTHING`)
      .bind(ouderId, k.kind_id)
      .run();
  }

  await logSchrijf(db, {
    soort: 'beheer',
    wie: beheerder.id,
    wat: 'sjabloon ingelezen',
    details:
      `team ${team}: ${plan.spelerwijzigingen.length} spelers bijgewerkt, ` +
      `${plan.nieuweOuderkoppelingen.length} ouderkoppelingen toegevoegd, ` +
      `${plan.rijfouten.length} rijfouten, ${plan.overgeslagenOuders.length} koppelingen niet in het bestand`,
    afgehandeld: plan.overgeslagenOuders.length ? 0 : 1,
  });

  return json({ droogloop: false, team, ...plan });
}
