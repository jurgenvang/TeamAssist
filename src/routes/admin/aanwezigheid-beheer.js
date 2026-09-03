// Wat een coach, coördinator of beheerder doet met aanwezigheid: bekijken,
// vaststellen, iemand vooraf uitsluiten, en een selectie samenstellen en
// publiceren.

import { json, fout, leesJson } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';

async function haalActiviteit(db, soort, id) {
  const tabel = soort === 'training' ? 'trainingen' : 'wedstrijden';
  return db.prepare(`SELECT id, team_guid, seizoen FROM ${tabel} WHERE id = ?`).bind(id).first();
}

/**
 * Toont wie er is opgegeven, uitgesloten of vastgesteld voor een activiteit,
 * met de spelers die nog niets hebben opgegeven erbij — anders zou 'niemand
 * heeft nog geantwoord' onzichtbaar zijn.
 */
export async function aanwezigheidTonen(ctx) {
  const { db, rechten, request } = ctx;
  const url = new URL(request.url);
  const soort = url.searchParams.get('soort');
  const activiteitId = url.searchParams.get('activiteit');
  if (!['training', 'wedstrijd'].includes(soort) || !activiteitId) {
    return fout(400, 'soort en activiteit zijn verplicht');
  }

  const activiteit = await haalActiviteit(db, soort, activiteitId);
  if (!activiteit) return fout(404, 'die activiteit bestaat niet');
  if (!rechten.mag('team.aanwezigheid.bekijken', activiteit.team_guid)) {
    return fout(403, 'geen recht op deze ploeg');
  }

  const spelers = await db
    .prepare(
      `SELECT p.id, p.voornaam, p.achternaam,
              a.opgave_status, a.opgave_reden, a.opgave_toelichting, a.opgave_tijdstip,
              a.uitgesloten, a.uitgesloten_reden,
              a.vaststelling_status
         FROM team_spelers ts
         JOIN personen p ON p.id = ts.persoon_id
         LEFT JOIN aanwezigheden a
           ON a.soort = ? AND a.activiteit_id = ? AND a.persoon_id = p.id
        WHERE ts.team_guid = ? AND ts.seizoen = ? AND p.actief = 1
        ORDER BY p.achternaam, p.voornaam`
    )
    .bind(soort, activiteitId, activiteit.team_guid, activiteit.seizoen)
    .all();

  let selectie = null;
  if (soort === 'wedstrijd') {
    const wed = await db
      .prepare(`SELECT selectie_gepubliceerd FROM wedstrijden WHERE id = ?`)
      .bind(activiteitId)
      .first();
    const team = await db
      .prepare(`SELECT selectie_aan FROM teams WHERE guid = ? AND seizoen = ?`)
      .bind(activiteit.team_guid, activiteit.seizoen)
      .first();
    if (team?.selectie_aan) {
      const rijen = await db
        .prepare(`SELECT persoon_id FROM wedstrijdselecties WHERE wedstrijd_id = ?`)
        .bind(activiteitId)
        .all();
      selectie = {
        aan: true,
        gepubliceerd: Boolean(wed?.selectie_gepubliceerd),
        geselecteerd: (rijen.results ?? []).map((r) => r.persoon_id),
      };
    }
  }

  return json({ spelers: spelers.results ?? [], selectie });
}

export async function vaststellen(ctx) {
  const { db, persoon: beheerder, rechten, request } = ctx;
  const body = await leesJson(request);
  const { soort, activiteit_id, persoon_id, status } = body ?? {};

  if (!['training', 'wedstrijd'].includes(soort)) return fout(400, 'soort moet training of wedstrijd zijn');
  if (!activiteit_id || !persoon_id) return fout(400, 'activiteit_id en persoon_id zijn verplicht');
  if (!['aanwezig', 'afwezig', 'te_laat'].includes(status)) {
    return fout(400, "status moet 'aanwezig', 'afwezig' of 'te_laat' zijn");
  }

  const activiteit = await haalActiviteit(db, soort, activiteit_id);
  if (!activiteit) return fout(404, 'die activiteit bestaat niet');
  if (!rechten.mag('team.aanwezigheid.vaststellen', activiteit.team_guid)) {
    return fout(403, 'geen recht op deze ploeg');
  }

  const bestaand = await db
    .prepare(`SELECT id FROM aanwezigheden WHERE soort = ? AND activiteit_id = ? AND persoon_id = ?`)
    .bind(soort, activiteit_id, persoon_id)
    .first();

  if (bestaand) {
    await db
      .prepare(
        `UPDATE aanwezigheden
            SET vaststelling_status = ?, vaststelling_door = ?, vaststelling_tijdstip = datetime('now')
          WHERE id = ?`
      )
      .bind(status, beheerder.id, bestaand.id)
      .run();
  } else {
    // Vaststellen zonder voorafgaande opgave kan: iemand die nooit opgaf, maar
    // wel op training verscheen.
    await db
      .prepare(
        `INSERT INTO aanwezigheden
               (soort, activiteit_id, team_guid, seizoen, persoon_id, hoedanigheid,
                vaststelling_status, vaststelling_door, vaststelling_tijdstip)
             VALUES (?, ?, ?, ?, ?, 'SPELER', ?, ?, datetime('now'))`
      )
      .bind(soort, activiteit_id, activiteit.team_guid, activiteit.seizoen, persoon_id, status, beheerder.id)
      .run();
  }

  await logSchrijf(db, {
    soort: 'beheer',
    wie: beheerder.id,
    wat: 'aanwezigheid vastgesteld',
    details: `${persoon_id}: ${soort} ${activiteit_id} → ${status}`,
  });

  return json({ soort, activiteit_id, persoon_id, vaststelling_status: status });
}

/**
 * Een speler vooraf uitsluiten, of dat terugdraaien. De enige plaats waar een
 * volwassene eenzijdig iets oplegt aan een minderjarige — vandaar de
 * verplichte reden en het altijd loggen, ook bij het terugdraaien.
 */
export async function uitsluiten(ctx) {
  const { db, persoon: beheerder, rechten, request } = ctx;
  const body = await leesJson(request);
  const { soort, activiteit_id, persoon_id, uitgesloten, reden } = body ?? {};

  if (!['training', 'wedstrijd'].includes(soort)) return fout(400, 'soort moet training of wedstrijd zijn');
  if (!activiteit_id || !persoon_id) return fout(400, 'activiteit_id en persoon_id zijn verplicht');
  if (uitgesloten && !reden?.trim()) return fout(400, 'een reden is verplicht bij uitsluiten');

  const activiteit = await haalActiviteit(db, soort, activiteit_id);
  if (!activiteit) return fout(404, 'die activiteit bestaat niet');
  // Bewust niet team.aanwezigheid.vaststellen: uitsluiten heeft zijn eigen
  // recht, speler.uitsluiten, dat PLOEGV niet heeft — zie architectuur 8.3.
  if (!rechten.mag('speler.uitsluiten', activiteit.team_guid)) {
    return fout(403, 'geen recht om iemand uit te sluiten op deze ploeg');
  }

  const bestaand = await db
    .prepare(`SELECT id FROM aanwezigheden WHERE soort = ? AND activiteit_id = ? AND persoon_id = ?`)
    .bind(soort, activiteit_id, persoon_id)
    .first();

  const waarde = uitgesloten ? 1 : 0;
  const opgeslagenReden = uitgesloten ? reden.trim() : null;

  if (bestaand) {
    await db
      .prepare(
        `UPDATE aanwezigheden
            SET uitgesloten = ?, uitgesloten_reden = ?, uitgesloten_door = ?, uitgesloten_tijdstip = datetime('now')
          WHERE id = ?`
      )
      .bind(waarde, opgeslagenReden, beheerder.id, bestaand.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO aanwezigheden
               (soort, activiteit_id, team_guid, seizoen, persoon_id, hoedanigheid,
                uitgesloten, uitgesloten_reden, uitgesloten_door, uitgesloten_tijdstip)
             VALUES (?, ?, ?, ?, ?, 'SPELER', ?, ?, ?, datetime('now'))`
      )
      .bind(soort, activiteit_id, activiteit.team_guid, activiteit.seizoen, persoon_id, waarde, opgeslagenReden, beheerder.id)
      .run();
  }

  await logSchrijf(db, {
    soort: 'beheer',
    wie: beheerder.id,
    wat: uitgesloten ? 'speler vooraf uitgesloten' : 'uitsluiting teruggedraaid',
    details: `${persoon_id}: ${soort} ${activiteit_id}${opgeslagenReden ? ` — ${opgeslagenReden}` : ''}`,
  });

  return json({ soort, activiteit_id, persoon_id, uitgesloten: Boolean(waarde) });
}

/** Een klad-selectie samenstellen: wie de coach voorlopig meeneemt. */
export async function selectieZetten(ctx) {
  const { db, persoon: beheerder, rechten, request } = ctx;
  const body = await leesJson(request);
  const { wedstrijd_id, persoon_ids } = body ?? {};
  if (!wedstrijd_id || !Array.isArray(persoon_ids)) {
    return fout(400, 'wedstrijd_id en persoon_ids zijn verplicht');
  }

  const wed = await db
    .prepare(`SELECT team_guid, seizoen, selectie_gepubliceerd FROM wedstrijden WHERE id = ?`)
    .bind(wedstrijd_id)
    .first();
  if (!wed) return fout(404, 'die wedstrijd bestaat niet');
  if (!rechten.mag('team.selectie.beheren', wed.team_guid)) return fout(403, 'geen recht op deze ploeg');

  // Enkel spelers van de eigen ploeg — doorschuiven komt later (architectuur
  // 8.2, backlog T1-verwant).
  if (persoon_ids.length > 90) return fout(400, 'te veel spelers in één keer');
  const plekhouders = persoon_ids.map(() => '?').join(',');
  const geldig = await db
    .prepare(
      `SELECT persoon_id FROM team_spelers
        WHERE team_guid = ? AND seizoen = ? AND persoon_id IN (${plekhouders})`
    )
    .bind(wed.team_guid, wed.seizoen, ...persoon_ids)
    .all();
  const geldigeIds = new Set((geldig.results ?? []).map((r) => r.persoon_id));
  const ongeldig = persoon_ids.filter((id) => !geldigeIds.has(id));
  if (ongeldig.length) return fout(400, `niet elke opgegeven speler speelt in deze ploeg: ${ongeldig.join(', ')}`);

  await db.prepare(`DELETE FROM wedstrijdselecties WHERE wedstrijd_id = ?`).bind(wedstrijd_id).run();
  for (const id of persoon_ids) {
    await db
      .prepare(`INSERT INTO wedstrijdselecties (wedstrijd_id, persoon_id) VALUES (?, ?)`)
      .bind(wedstrijd_id, id)
      .run();
  }

  await logSchrijf(db, {
    soort: 'beheer',
    wie: beheerder.id,
    wat: 'selectie bijgewerkt',
    details: `wedstrijd ${wedstrijd_id}: ${persoon_ids.length} spelers (klad)`,
  });

  return json({ wedstrijd_id, aantal: persoon_ids.length, gepubliceerd: Boolean(wed.selectie_gepubliceerd) });
}

/**
 * Publiceert de klad-selectie in één beweging. Vanaf hier ziet de hele ploeg
 * de namen — architectuur 8.4.
 */
export async function selectiePubliceren(ctx) {
  const { db, persoon: beheerder, rechten, request } = ctx;
  const body = await leesJson(request);
  const wedstrijdId = body?.wedstrijd_id;
  if (!wedstrijdId) return fout(400, 'wedstrijd_id ontbreekt');

  const wed = await db.prepare(`SELECT team_guid FROM wedstrijden WHERE id = ?`).bind(wedstrijdId).first();
  if (!wed) return fout(404, 'die wedstrijd bestaat niet');
  if (!rechten.mag('team.selectie.beheren', wed.team_guid)) return fout(403, 'geen recht op deze ploeg');

  await db
    .prepare(`UPDATE wedstrijden SET selectie_gepubliceerd = 1 WHERE id = ?`)
    .bind(wedstrijdId)
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: beheerder.id,
    wat: 'selectie gepubliceerd',
    details: `wedstrijd ${wedstrijdId}`,
  });

  // Er is nog geen verstuurkanaal (fase 5); de publicatie zelf gebeurt al wel,
  // en de melding aan de ploeg volgt zodra dat kanaal bestaat.
  return json({ wedstrijd_id: wedstrijdId, gepubliceerd: true });
}
