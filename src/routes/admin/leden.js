// Spelers en staf synchroniseren.
//
// Per gevolgde ploeg wordt `TeamDetailByGuid` opgehaald en naast de club
// gelegd. Standaard een droogloop: dit maakt personen aan en koppelt ze aan
// ploegen, en een verkeerde koppeling is handwerk om te herstellen.
//
// Enkel gevolgde ploegen. Een ploeg waar de club niets mee doet, hoeft geen
// gegevens van minderjarigen in de databank te hebben staan.

import { json, fout } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';
import { haalVbl, teamDetailUrl } from '../../lib/vbl.js';
import { maakLedenplan } from '../../lib/ledensync.js';

function nieuwId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function gevolgdePloegen(db, seizoen, alleen) {
  if (alleen) {
    const rij = await db
      .prepare(`SELECT guid, naam FROM teams WHERE guid = ? AND seizoen = ? AND gevolgd = 1`)
      .bind(alleen, seizoen)
      .first();
    return rij ? [rij] : [];
  }
  const rijen = await db
    .prepare(
      `SELECT guid, naam FROM teams
        WHERE seizoen = ? AND gevolgd = 1 AND bij_bond = 1
        ORDER BY categorie, naam`
    )
    .bind(seizoen)
    .all();
  return rijen.results ?? [];
}

async function contextVoorPloeg(db, guid, seizoen) {
  // Alle personen ophalen om op te matchen. Bij een paar honderd leden is dat
  // ruim binnen wat D1 aankan, en het spaart een query per lid uit — die zou de
  // grens van honderd gebonden parameters snel raken.
  const personen = await db
    .prepare(
      `SELECT id, voornaam, achternaam, naam_vbl, naam_bron, rel_guid, lid_nr,
              geboortedatum, geboortedatum_bron
         FROM personen WHERE actief = 1`
    )
    .all();

  const inPloeg = await db
    .prepare(
      `SELECT ts.persoon_id, ts.bij_bond, ts.bron, p.rel_guid
         FROM team_spelers ts
         JOIN personen p ON p.id = ts.persoon_id
        WHERE ts.team_guid = ? AND ts.seizoen = ?`
    )
    .bind(guid, seizoen)
    .all();

  const rollen = await db
    .prepare(
      `SELECT r.id, r.persoon_id, r.bron, p.rel_guid
         FROM rollen r
         JOIN personen p ON p.id = r.persoon_id
        WHERE r.rol = 'COACH' AND r.team_guid = ? AND r.seizoen = ?`
    )
    .bind(guid, seizoen)
    .all();

  return {
    personen: personen.results ?? [],
    inPloeg: inPloeg.results ?? [],
    rollen: rollen.results ?? [],
  };
}

async function schrijfPersoon(db, lid) {
  const id = nieuwId('p');
  await db
    .prepare(
      `INSERT INTO personen (id, voornaam, achternaam, naam_vbl, naam_bron,
                             rel_guid, lid_nr, geboortedatum, geboortedatum_bron)
            VALUES (?, ?, ?, ?, 'afgeleid', ?, ?, ?, ?)`
    )
    .bind(
      id,
      lid.voornaam,
      lid.achternaam,
      lid.naam_vbl,
      lid.rel_guid,
      lid.lid_nr,
      lid.geboortedatum,
      lid.geboortedatum ? 'vbl' : 'club'
    )
    .run();
  return id;
}

async function zetInPloeg(db, persoonId, guid, seizoen) {
  await db
    .prepare(
      `INSERT INTO team_spelers (persoon_id, team_guid, seizoen, bron, bij_bond)
            VALUES (?, ?, ?, 'vbl', 1)
       ON CONFLICT (persoon_id, team_guid, seizoen)
       DO UPDATE SET bij_bond = 1`
    )
    .bind(persoonId, guid, seizoen)
    .run();
}

async function zetCoach(db, persoonId, guid, seizoen) {
  // De staf van de bond klopt in de praktijk, dus de rol wordt toegekend en niet
  // enkel voorgesteld. Een handmatig toegevoegde coach draagt bron 'club' en
  // blijft daardoor buiten schot.
  await db
    .prepare(
      `INSERT OR IGNORE INTO rollen (persoon_id, rol, team_guid, seizoen, bron)
            VALUES (?, 'COACH', ?, ?, 'vbl')`
    )
    .bind(persoonId, guid, seizoen)
    .run();
}

async function verwerkPloeg(db, ploeg, seizoen, uitvoeren) {
  const data = await haalVbl(teamDetailUrl(ploeg.guid));
  const records = Array.isArray(data) ? data : [data];
  const spelers = records.flatMap((r) => r.spelers ?? []);
  const staf = records.flatMap((r) => r.tvlijst ?? []);

  const context = await contextVoorPloeg(db, ploeg.guid, seizoen);
  const plan = maakLedenplan({ spelers, staf, ...context });

  if (!uitvoeren) return { ploeg: ploeg.guid, naam: ploeg.naam, ...plan };

  for (const lid of plan.nieuw) {
    const id = await schrijfPersoon(db, lid);
    if (lid.soort === 'speler') await zetInPloeg(db, id, ploeg.guid, seizoen);
    else await zetCoach(db, id, ploeg.guid, seizoen);
  }

  // Koppelen: een bestaande persoon krijgt de sleutel van de bond erbij.
  for (const lid of plan.koppelen) {
    await db
      .prepare(
        `UPDATE personen SET rel_guid = ?, lid_nr = coalesce(?, lid_nr),
                             naam_vbl = ?, gewijzigd = datetime('now')
          WHERE id = ?`
      )
      .bind(lid.rel_guid, lid.lid_nr, lid.naam_vbl, lid.persoon_id)
      .run();
    if (lid.soort === 'speler') await zetInPloeg(db, lid.persoon_id, ploeg.guid, seizoen);
    else await zetCoach(db, lid.persoon_id, ploeg.guid, seizoen);
  }

  for (const lid of plan.bijwerken) {
    if (lid.verschillen.includes('naam')) {
      await db
        .prepare(
          `UPDATE personen SET naam_vbl = ?, voornaam = ?, achternaam = ?,
                               naam_bron = 'afgeleid', gewijzigd = datetime('now')
            WHERE id = ? AND naam_bron <> 'club'`
        )
        .bind(lid.naam_vbl, lid.voornaam, lid.achternaam, lid.persoon_id)
        .run();
    }
    if (lid.verschillen.includes('geboortedatum')) {
      await db
        .prepare(
          `UPDATE personen SET geboortedatum = ?, geboortedatum_bron = 'vbl',
                               gewijzigd = datetime('now')
            WHERE id = ? AND geboortedatum_bron <> 'club'`
        )
        .bind(lid.geboortedatum, lid.persoon_id)
        .run();
    }
    if (lid.verschillen.includes('lidnummer')) {
      await db
        .prepare(`UPDATE personen SET lid_nr = ?, gewijzigd = datetime('now') WHERE id = ?`)
        .bind(lid.lid_nr, lid.persoon_id)
        .run();
    }
    if (lid.soort === 'speler') await zetInPloeg(db, lid.persoon_id, ploeg.guid, seizoen);
    else await zetCoach(db, lid.persoon_id, ploeg.guid, seizoen);
  }

  for (const lid of plan.ongewijzigd) {
    if (lid.soort === 'speler') await zetInPloeg(db, lid.persoon_id, ploeg.guid, seizoen);
    else await zetCoach(db, lid.persoon_id, ploeg.guid, seizoen);
  }

  // Wie niet meer bij de bond staat, blijft in de ploeg met een vlag. Er hangen
  // aanwezigheden aan, en een speler die één keer ontbreekt is nog geen speler
  // die weg is.
  for (const rij of plan.uit_ploeg) {
    await db
      .prepare(
        `UPDATE team_spelers SET bij_bond = 0
          WHERE persoon_id = ? AND team_guid = ? AND seizoen = ?`
      )
      .bind(rij.persoon_id, ploeg.guid, seizoen)
      .run();
  }

  for (const rol of plan.rollen_weg) {
    await db.prepare(`DELETE FROM rollen WHERE id = ? AND bron = 'vbl'`).bind(rol.id).run();
  }

  return { ploeg: ploeg.guid, naam: ploeg.naam, ...plan };
}

export async function ledenSync(ctx) {
  const { db, persoon, request, seizoen } = ctx;
  const url = new URL(request.url);
  const uitvoeren = url.searchParams.get('uitvoeren') === '1';
  const alleen = url.searchParams.get('team');

  const ploegen = await gevolgdePloegen(db, seizoen.code, alleen);
  if (!ploegen.length) {
    return fout(400, 'er is geen enkele gevolgde ploeg om te synchroniseren');
  }

  const uitslagen = [];
  for (const ploeg of ploegen) {
    try {
      uitslagen.push(await verwerkPloeg(db, ploeg, seizoen.code, uitvoeren));
    } catch (e) {
      // Eén ploeg die faalt mag de rest niet tegenhouden: dan blijft de hele
      // club hangen op één stukke GUID.
      uitslagen.push({ ploeg: ploeg.guid, naam: ploeg.naam, status: 'fout', melding: e.message });
      await logSchrijf(db, {
        soort: 'fout',
        wie: persoon.id,
        wat: 'leden ophalen mislukt',
        details: `${ploeg.guid} — ${e.message}`,
        afgehandeld: 0,
      });
    }
  }

  const tel = (veld) => uitslagen.reduce((n, u) => n + (u[veld]?.length ?? 0), 0);
  const totalen = {
    nieuw: tel('nieuw'),
    koppelen: tel('koppelen'),
    bijwerken: tel('bijwerken'),
    ongewijzigd: tel('ongewijzigd'),
    twijfel: tel('twijfel'),
    uit_ploeg: tel('uit_ploeg'),
  };
  const problemen = uitslagen.some((u) => u.status !== 'ok');

  if (uitvoeren) {
    await logSchrijf(db, {
      soort: 'sync',
      wie: persoon.id,
      wat: 'leden gesynchroniseerd',
      details:
        `${ploegen.length} ploegen: ${totalen.nieuw} nieuw, ${totalen.koppelen} gekoppeld, ` +
        `${totalen.bijwerken} bijgewerkt, ${totalen.twijfel} twijfelgevallen`,
      afgehandeld: problemen ? 0 : 1,
    });
  }

  return json({ droogloop: !uitvoeren, seizoen: seizoen.code, totalen, ploegen: uitslagen });
}
