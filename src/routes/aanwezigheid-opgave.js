// Aanwezigheid opgeven: door een speler voor zichzelf, of door een ouder
// namens zijn kind.
//
// De gebruiker komt altijd uit het geverifieerde token (ctx.persoon), nooit
// uit de request body — namens wie er ingevuld wordt, staat wel in de body,
// maar wordt tegen ouder_kind gecontroleerd vóór er iets gebeurt.

import { json, fout, leesJson } from '../lib/http.js';
import { magOpgaveZetten, bouwOpgave } from '../lib/aanwezigheidregels.js';
import { logSchrijf } from '../lib/logboek.js';

async function haalActiviteit(db, soort, id) {
  const tabel = soort === 'training' ? 'trainingen' : 'wedstrijden';
  return db
    .prepare(`SELECT id, team_guid, seizoen, datum, begin FROM ${tabel} WHERE id = ?`)
    .bind(id)
    .first();
}

async function haalTeamInstelling(db, teamGuid, seizoen, soort) {
  const rij = await db
    .prepare(
      `SELECT opgave_toegelaten_training, opgave_toegelaten_wedstrijd,
              opgave_termijn_training_uren, opgave_termijn_wedstrijd_uren
         FROM teams WHERE guid = ? AND seizoen = ?`
    )
    .bind(teamGuid, seizoen)
    .first();
  if (!rij) return null;
  return soort === 'training'
    ? { opgave_toegelaten: rij.opgave_toegelaten_training, opgave_termijn_uren: rij.opgave_termijn_training_uren }
    : { opgave_toegelaten: rij.opgave_toegelaten_wedstrijd, opgave_termijn_uren: rij.opgave_termijn_wedstrijd_uren };
}

/**
 * Bepaalt namens wie er ingevuld wordt en met welke hoedanigheid, en
 * controleert dat de aanroeper daar recht toe heeft.
 *
 * @param {string} voorPersoonId  wie het opgeeft (de speler zelf of het kind)
 */
async function controleerNamens(db, aanroeper, voorPersoonId) {
  if (voorPersoonId === aanroeper.id) {
    return { ok: true, hoedanigheid: 'SPELER', doorPersoonId: aanroeper.id };
  }
  const koppeling = await db
    .prepare(`SELECT 1 AS ja FROM ouder_kind WHERE ouder_id = ? AND kind_id = ?`)
    .bind(aanroeper.id, voorPersoonId)
    .first();
  if (!koppeling) {
    return { ok: false, status: 403, fout: 'je mag niet namens deze persoon invullen' };
  }
  return { ok: true, hoedanigheid: 'OUVO', doorPersoonId: aanroeper.id };
}

export async function opgaveZetten(ctx) {
  const { db, persoon: aanroeper, request } = ctx;
  const body = await leesJson(request);
  const { soort, activiteit_id, status, reden, toelichting } = body ?? {};
  const voorPersoonId = body?.persoon_id ?? aanroeper.id;

  if (!['training', 'wedstrijd'].includes(soort)) return fout(400, 'soort moet training of wedstrijd zijn');
  if (!activiteit_id) return fout(400, 'activiteit_id ontbreekt');

  const namens = await controleerNamens(db, aanroeper, voorPersoonId);
  if (!namens.ok) return fout(namens.status, namens.fout);

  const activiteit = await haalActiviteit(db, soort, activiteit_id);
  if (!activiteit) return fout(404, 'die activiteit bestaat niet');

  // Enkel spelers van het team zelf mogen opgeven — geen aanwezigheid voor een
  // ploeg waar iemand geen deel van uitmaakt.
  const inTeam = await db
    .prepare(`SELECT 1 AS ja FROM team_spelers WHERE persoon_id = ? AND team_guid = ? AND seizoen = ?`)
    .bind(voorPersoonId, activiteit.team_guid, activiteit.seizoen)
    .first();
  if (!inTeam) return fout(403, 'deze persoon speelt niet in dit team');

  const teamInstelling = await haalTeamInstelling(db, activiteit.team_guid, activiteit.seizoen, soort);
  if (!teamInstelling) return fout(404, 'dat team bestaat niet in dit seizoen');

  const huidigeRij = await db
    .prepare(`SELECT * FROM aanwezigheden WHERE soort = ? AND activiteit_id = ? AND persoon_id = ?`)
    .bind(soort, activiteit_id, voorPersoonId)
    .first();

  const toelating = magOpgaveZetten({ huidigeRij, activiteit, teamInstelling });
  if (!toelating.mag) return fout(403, toelating.reden);

  let velden;
  try {
    velden = bouwOpgave({ status, reden, toelichting, doorPersoonId: namens.doorPersoonId });
  } catch (e) {
    return fout(400, e.message);
  }

  if (huidigeRij) {
    await db
      .prepare(
        `UPDATE aanwezigheden
            SET opgave_status = ?, opgave_reden = ?, opgave_toelichting = ?,
                opgave_door = ?, opgave_tijdstip = datetime('now')
          WHERE id = ?`
      )
      .bind(velden.opgave_status, velden.opgave_reden, velden.opgave_toelichting, velden.opgave_door, huidigeRij.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO aanwezigheden
               (soort, activiteit_id, team_guid, seizoen, persoon_id, hoedanigheid,
                opgave_status, opgave_reden, opgave_toelichting, opgave_door, opgave_tijdstip)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        soort, activiteit_id, activiteit.team_guid, activiteit.seizoen, voorPersoonId, namens.hoedanigheid,
        velden.opgave_status, velden.opgave_reden, velden.opgave_toelichting, velden.opgave_door
      )
      .run();
  }

  await logSchrijf(db, {
    soort: 'beheer',
    wie: aanroeper.id,
    wat: 'aanwezigheid opgegeven',
    details: `${voorPersoonId}: ${soort} ${activiteit_id} → ${velden.opgave_status}`,
  });

  return json({ soort, activiteit_id, persoon_id: voorPersoonId, ...velden });
}

/**
 * Geeft de eerstvolgende trainingen en wedstrijden van de aanroeper zelf en
 * zijn kinderen, met de bestaande opgave erbij.
 *
 * Eén rij per (activiteit, specifieke persoon) — niet per activiteit met een
 * los-gekoppelde 'iemand van deze ouder'. Bij twee kinderen in dezelfde ploeg
 * zou een simpele LEFT JOIN met 'persoon_id IN (...)' niet kunnen zeggen van
 * welk kind de opgave is; de join hieronder loopt daarom over team_spelers,
 * zodat elk kind zijn eigen rij krijgt.
 */
export async function mijnOpgaven(ctx) {
  const { db, persoon, seizoen } = ctx;

  const kinderen = await db
    .prepare(`SELECT kind_id FROM ouder_kind WHERE ouder_id = ?`)
    .bind(persoon.id)
    .all();
  const ids = [persoon.id, ...(kinderen.results ?? []).map((r) => r.kind_id)];

  // Een vaste bovengrens is veiliger dan te vertrouwen op 'dat gebeurt toch
  // niet' — bij veel kinderen zou de lijst anders de honderd-parametergrens
  // van D1 kunnen raken.
  const veilig = ids.slice(0, 40);
  const plekhouders = veilig.map(() => '?').join(',');

  const trainingen = await db
    .prepare(
      `SELECT t.id, 'training' AS soort, t.datum, t.begin, t.team_guid, ts.persoon_id AS voor_persoon_id,
              p.voornaam AS voor_voornaam, p.achternaam AS voor_achternaam,
              a.opgave_status, a.uitgesloten, a.uitgesloten_reden
         FROM trainingen t
         JOIN team_spelers ts
           ON ts.team_guid = t.team_guid AND ts.seizoen = t.seizoen AND ts.persoon_id IN (${plekhouders})
         JOIN personen p ON p.id = ts.persoon_id
         LEFT JOIN aanwezigheden a
           ON a.soort = 'training' AND a.activiteit_id = t.id AND a.persoon_id = ts.persoon_id
        WHERE t.seizoen = ? AND t.status = 'gepland' AND t.datum >= date('now')`
    )
    .bind(...veilig, seizoen.code)
    .all();

  const wedstrijden = await db
    .prepare(
      `SELECT w.id, 'wedstrijd' AS soort, w.datum, w.begin, w.team_guid, ts.persoon_id AS voor_persoon_id,
              p.voornaam AS voor_voornaam, p.achternaam AS voor_achternaam,
              a.opgave_status, a.uitgesloten, a.uitgesloten_reden
         FROM wedstrijden w
         JOIN team_spelers ts
           ON ts.team_guid = w.team_guid AND ts.seizoen = w.seizoen AND ts.persoon_id IN (${plekhouders})
         JOIN personen p ON p.id = ts.persoon_id
         LEFT JOIN aanwezigheden a
           ON a.soort = 'wedstrijd' AND a.activiteit_id = w.id AND a.persoon_id = ts.persoon_id
        WHERE w.seizoen = ? AND w.status = 'gepland' AND w.datum >= date('now')`
    )
    .bind(...veilig, seizoen.code)
    .all();

  const alles = [...(trainingen.results ?? []), ...(wedstrijden.results ?? [])].sort(
    (a, b) => `${a.datum}${a.begin}`.localeCompare(`${b.datum}${b.begin}`)
  );

  return json({ activiteiten: alles });
}
