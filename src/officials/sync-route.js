// POST /api/admin/officials/sync — standaard een droogloop, met ?uitvoeren=1
// echt. Ook de uurcron roept dit aan, meteen na de gewone wedstrijdsync, zodat
// de rijen van gevolgde ploegen er dan al staan.

import { json, fout } from '../lib/http.js';
import { logSchrijf } from '../lib/logboek.js';
import { haalVbl } from '../lib/vbl.js';
import { instellingLezen } from '../routes/admin/instellingen.js';
import { maakOfficialsplan, orgMatchesUrl } from './sync.js';

async function lees(db, seizoen) {
  const ploegen = await db
    .prepare(`SELECT guid, categorie, gevolgd FROM teams WHERE seizoen = ? AND officials = 1 AND bij_bond = 1`)
    .bind(seizoen)
    .all();
  const bestaand = await db
    .prepare(
      `SELECT w.id, w.wedstrijd_guid, w.team_guid, w.datum, w.begin, w.locatie_tekst, w.tegenstander,
              w.wijzigingshash, w.bij_bond, w.bron,
              o.wedstrijd_id IS NOT NULL AS heeft_officials, o.forfait
         FROM wedstrijden w
         JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
         LEFT JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
        WHERE w.seizoen = ? AND w.thuis = 1 AND t.officials = 1`
    )
    .bind(seizoen)
    .all();
  const auto = await db.prepare(`SELECT code FROM officials_categorieen WHERE auto_scope = 1`).all();
  return {
    ploegen: ploegen.results ?? [],
    bestaand: bestaand.results ?? [],
    autoScope: new Set((auto.results ?? []).map((r) => r.code)),
  };
}

async function voerUit(db, seizoen, plan) {
  for (const w of plan.nieuweWedstrijden) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO wedstrijden
               (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander,
                locatie_tekst, vbl_acc_guid, uitslag, wijzigingshash, laatst_gezien)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(w.wedstrijd_guid, w.team_guid, seizoen, w.datum, w.begin, w.tegenstander,
        w.locatie_tekst, w.vbl_acc_guid, w.uitslag, w.hash)
      .run();
  }

  for (const w of plan.basisGewijzigd) {
    await db
      .prepare(
        `UPDATE wedstrijden SET datum = ?, begin = ?, tegenstander = ?, locatie_tekst = ?, vbl_acc_guid = ?,
                uitslag = ?, wijzigingshash = ?, bij_bond = 1, laatst_gezien = datetime('now')
          WHERE id = ?`
      )
      .bind(w.datum, w.begin, w.tegenstander, w.locatie_tekst, w.vbl_acc_guid, w.uitslag, w.hash, w.id)
      .run();
    // Enkel wat nog moet komen: een verschuiving van een gespeelde wedstrijd
    // vraagt niemands aandacht.
    if (w.toekomst) {
      await logSchrijf(db, {
        soort: 'officials',
        wat: `wedstrijd gewijzigd: ${w.wedstrijd_guid}`,
        details: `was ${w.was.datum} ${w.was.begin} ${w.was.locatie_tekst ?? ''}, wordt ${w.datum} ${w.begin} ${w.locatie_tekst ?? ''}`,
        afgehandeld: 0,
      });
    }
  }

  // Een uitslag of een niet-gewijzigde rij van een niet-gevolgde ploeg: enkel
  // als gezien markeren en de uitslag bijwerken.
  for (const w of plan.officialsBijwerken) {
    await db
      .prepare(`UPDATE wedstrijden SET uitslag = coalesce(?, uitslag), laatst_gezien = datetime('now') WHERE id = ? AND bron = 'vbl'`)
      .bind(w.uitslag, w.id)
      .run();
  }

  for (const o of plan.officialsNieuw) {
    const id = o.id ?? (await db
      .prepare(`SELECT id FROM wedstrijden WHERE wedstrijd_guid = ? AND team_guid = ?`)
      .bind(o.wedstrijd_guid, o.team_guid)
      .first('id'));
    if (!id) continue;
    await db
      .prepare(
        `INSERT OR IGNORE INTO officials_wedstrijd
               (wedstrijd_id, cat_code, poule_naam, off_namen, off_aantal, forfait, scope, scope_reden, scope_op, hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, o.cat_code, o.poule_naam, JSON.stringify(o.off_namen), o.off_aantal, o.forfait,
        o.scope ? 1 : 0, o.scope ? 'auto' : null, o.scope ? new Date().toISOString() : null, o.hash)
      .run();
  }

  // De scheidsrechters van de bond zitten bewust niet in de hash: ze
  // veranderen vaak. Ze worden wel altijd bijgewerkt — de woensdagregel en
  // 'nog nodig' leunen erop. Scope en de bevestiging blijven staan.
  for (const o of plan.officialsBijwerken) {
    await db
      .prepare(
        `UPDATE officials_wedstrijd
            SET cat_code = ?, poule_naam = ?, off_namen = ?, off_aantal = ?, off_gewist = 0, forfait = ?, hash = ?
          WHERE wedstrijd_id = ?`
      )
      .bind(o.cat_code, o.poule_naam, JSON.stringify(o.off_namen), o.off_aantal, o.forfait, o.hash, o.id)
      .run();
  }

  const vandaag = new Date().toISOString().slice(0, 10);
  for (const f of plan.nieuweForfaits) {
    // Wat er met eigen aanduidingen gebeurt, komt in 3f (forfait.js); hier
    // enkel zichtbaar maken. Voorbije forfaits niet: dat gaf in YOAssist bij de
    // eerste ronde een vloed aan openstaande regels.
    if (f.datum >= vandaag) {
      await logSchrijf(db, {
        soort: 'officials',
        wat: `forfait: ${f.wedstrijd_guid}`,
        details: `${f.datum} ${f.begin} — ${f.forfait === 'thuis' ? 'thuisploeg' : f.forfait === 'uit' ? 'bezoekers' : 'beide ploegen'}`,
        afgehandeld: 0,
      });
    }
  }

  for (const w of plan.verdwenen) {
    await db.prepare(`UPDATE wedstrijden SET bij_bond = 0 WHERE id = ?`).bind(w.id).run();
  }

  // Namen van scheidsrechters wissen vanaf een dag na de wedstrijd; het aantal
  // blijft, dat is nodig voor de historiek. Filteren op een voorwaarde, niet op
  // een lijst id's (D1: honderd parameters).
  const gewist = await db
    .prepare(
      `UPDATE officials_wedstrijd SET off_namen = NULL, off_gewist = 1
        WHERE off_gewist = 0 AND off_namen IS NOT NULL
          AND wedstrijd_id IN (SELECT id FROM wedstrijden WHERE datum < date('now', '-1 day'))`
    )
    .run();

  // Een bevestiging 'er komen twee refs' is overbodig zodra de bond ze zelf
  // toont; laten staan zou een label tonen dat niemand nog durft weg te halen.
  const bevestigd = await db
    .prepare(
      `UPDATE officials_wedstrijd SET refs_bevestigd = 0, refs_bevestigd_door = NULL, refs_bevestigd_op = NULL
        WHERE refs_bevestigd = 1 AND off_aantal >= 2`
    )
    .run();

  return { namen_gewist: gewist.meta?.changes ?? 0, bevestigingen_gewist: bevestigd.meta?.changes ?? 0 };
}

export async function officialsSync(ctx) {
  const { db, persoon, request, seizoen } = ctx;
  const uitvoeren = new URL(request.url).searchParams.get('uitvoeren') === '1';
  const clubGuid = await instellingLezen(db, 'club_guid', null);
  if (!clubGuid) return fout(400, 'club_guid is niet ingesteld');

  const gelezen = await lees(db, seizoen.code);
  if (!gelezen.ploegen.length) return fout(400, 'geen enkele ploeg met officials in dit seizoen');

  let records;
  try {
    const data = await haalVbl(orgMatchesUrl(clubGuid));
    records = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
    if (!records) throw new Error('onverwachte vorm van OrgMatchesByGuid (geen lijst)');
  } catch (e) {
    await logSchrijf(db, { soort: 'fout', wie: persoon?.id ?? null, wat: 'officials: ophalen mislukt', details: e.message, afgehandeld: 0 });
    return fout(502, `ophalen bij de bond mislukt: ${e.message}`);
  }

  const plan = maakOfficialsplan(records, {
    ...gelezen,
    seizoen: seizoen.code,
    vandaag: new Date().toISOString().slice(0, 10),
  });
  const totalen = {
    gevonden: plan.gevonden,
    nieuw: plan.nieuweWedstrijden.length,
    officials_nieuw: plan.officialsNieuw.length,
    bijgewerkt: plan.officialsBijwerken.length,
    gewijzigd: plan.basisGewijzigd.length,
    nieuwe_forfaits: plan.nieuweForfaits.length,
    wacht_op_sync: plan.wachtOpSync.length,
    verdwenen: plan.verdwenen.length,
  };

  if (plan.status === 'mislukt') {
    await logSchrijf(db, { soort: 'fout', wie: persoon?.id ?? null, wat: 'officials: synchronisatie afgebroken', details: plan.melding, afgehandeld: 0 });
    return fout(502, plan.melding);
  }
  if (!uitvoeren) return json({ droogloop: true, status: plan.status, melding: plan.melding, totalen });

  const extra = await voerUit(db, seizoen.code, plan);
  await logSchrijf(db, {
    soort: 'sync',
    wie: persoon?.id ?? null,
    wat: 'officials gesynchroniseerd',
    details: JSON.stringify(totalen),
  });
  return json({ droogloop: false, status: plan.status, melding: plan.melding, totalen: { ...totalen, ...extra } });
}
