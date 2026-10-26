// De wedstrijden voor de officials ophalen (module Officials, 0.33.0).
//
// Naar het voorbeeld van YOAssist (`sync.js` daar): één oproep
// OrgMatchesByGuid voor de hele club, enkel de thuiswedstrijden van ploegen
// met `teams.officials = 1`. Los van de gewone wedstrijdsync, om twee redenen:
//  - een ploeg kan officials krijgen zonder dat TeamAssist haar beheert
//    (`gevolgd = 0`, beslist in I1); de gewone sync haalt die niet op;
//  - één oproep in plaats van één per ploeg, binnen het maximum aan uitgaande
//    oproepen van een Worker.
//
// Wie beheert welke rij in `wedstrijden`: voor een gevolgde ploeg de gewone
// sync (met de taken en de meldingen aan de begeleiding); deze sync raakt daar
// enkel `officials_wedstrijd`. Voor een niet-gevolgde ploeg maakt en werkt deze
// sync de rij zelf bij — enkel de thuiswedstrijd, zonder taken.
//
// Dezelfde veiligheden als in YOAssist: een mislukte oproep wijzigt niets, nul
// wedstrijden terwijl er bewaard zijn wijzigt niets, en verdwijnen er meer dan
// DREMPEL_VERDWENEN tegelijk, dan wordt er niets als verdwenen gezet.

import { haalVbl, VBL_BASIS } from '../lib/vbl.js';
import { vblDatumNaarIso, vblTijdNaarUur } from '../lib/datum.js';
import { wijzigingshash } from '../lib/wedstrijdsync.js';
import { normaliseerForfait, scheidsrechters, vblSeizoen } from './regels.js';

export const DREMPEL_VERDWENEN = 3;

export function orgMatchesUrl(clubGuid, basis = VBL_BASIS) {
  return `${basis}/OrgMatchesByGuid?issguid=${encodeURIComponent(clubGuid)}`;
}

const schoon = (s) => String(s ?? '').trim();

/** Een ruw record naar wat de officials nodig hebben; null als het onbruikbaar is. */
export function leesOfficialsWedstrijd(r) {
  const guid = schoon(r?.guid);
  const datum = vblDatumNaarIso(r?.datumString);
  const begin = vblTijdNaarUur(r?.beginTijd);
  if (!guid || !datum || !begin) return null;
  const namen = scheidsrechters(r.wedOff);
  return {
    wedstrijd_guid: guid,
    seizoen_vbl: guid.slice(4, 8),
    thuis_guid: schoon(r.tTGUID),
    tegenstander: schoon(r.tUNaam) || null,
    datum,
    begin,
    locatie_tekst: schoon(r.accNaam) || null,
    vbl_acc_guid: schoon(r.accGUID) || null,
    poule_naam: schoon(r.pouleNaam) || null,
    uitslag: r.gespeeld === 'G' && schoon(r.uitslag) ? schoon(r.uitslag) : null,
    forfait: normaliseerForfait(r.uitslag),
    off_namen: namen,
    off_aantal: namen.length,
  };
}

/**
 * Zuiver: legt wat de bond gaf naast wat er staat.
 *
 * @param {Array} records        ruwe OrgMatchesByGuid-records
 * @param {object} o
 * @param {Array}  o.ploegen      teams met officials = 1: {guid, categorie, gevolgd}
 * @param {Array}  o.bestaand     wedstrijden van die ploegen (thuis), met
 *                                `heeft_officials` en de kolommen van officials_wedstrijd
 * @param {string} o.seizoen      TeamAssist-code, '2026-27'
 * @param {Set}    o.autoScope    categorieën die vanzelf in de lijst komen (U10/U12)
 * @param {string} o.vandaag      'jjjj-mm-dd'
 */
export function maakOfficialsplan(records, { ploegen, bestaand, seizoen, autoScope, vandaag }) {
  const code = vblSeizoen(seizoen);
  const ploegOp = new Map(ploegen.map((p) => [p.guid, p]));
  const bestaandOp = new Map(bestaand.map((b) => [`${b.wedstrijd_guid}|${b.team_guid}`, b]));

  const plan = {
    nieuweWedstrijden: [], // enkel voor niet-gevolgde ploegen
    basisGewijzigd: [], // idem: datum, uur, zaal of tegenstander veranderde
    officialsNieuw: [],
    officialsBijwerken: [],
    nieuweForfaits: [],
    wachtOpSync: [], // gevolgde ploeg, maar de gewone sync maakte de rij nog niet
    verdwenen: [],
    genegeerdVerdwenen: [],
    gevonden: 0,
    status: 'ok',
    melding: null,
  };

  const gezien = new Set();
  for (const r of records) {
    const w = leesOfficialsWedstrijd(r);
    if (!w || w.seizoen_vbl !== code) continue;
    const ploeg = ploegOp.get(w.thuis_guid);
    if (!ploeg) continue; // enkel thuiswedstrijden van ploegen met officials

    const sleutel = `${w.wedstrijd_guid}|${ploeg.guid}`;
    gezien.add(sleutel);
    plan.gevonden += 1;
    const oud = bestaandOp.get(sleutel);
    const rij = {
      ...w,
      team_guid: ploeg.guid,
      cat_code: ploeg.categorie,
      hash: wijzigingshash({ ...w, thuis: true }),
    };

    if (!oud) {
      if (ploeg.gevolgd) {
        plan.wachtOpSync.push(rij);
        continue;
      }
      plan.nieuweWedstrijden.push(rij);
      plan.officialsNieuw.push({ ...rij, scope: autoScope.has(ploeg.categorie) });
      continue;
    }

    if (!ploeg.gevolgd && oud.wijzigingshash !== rij.hash) {
      plan.basisGewijzigd.push({ ...rij, id: oud.id, was: oud, toekomst: rij.datum >= vandaag });
    }
    if (!oud.heeft_officials) {
      plan.officialsNieuw.push({ ...rij, id: oud.id, scope: autoScope.has(ploeg.categorie) });
      continue;
    }
    if (rij.forfait && !oud.forfait) plan.nieuweForfaits.push({ id: oud.id, ...rij });
    plan.officialsBijwerken.push({ ...rij, id: oud.id });
  }

  // Verdwenen: enkel voor niet-gevolgde ploegen — de gewone sync doet de rest.
  const weg = bestaand.filter(
    (b) => b.bij_bond !== 0 && b.bron !== 'handmatig' && !ploegOp.get(b.team_guid)?.gevolgd &&
      !gezien.has(`${b.wedstrijd_guid}|${b.team_guid}`)
  );
  if (weg.length > DREMPEL_VERDWENEN) {
    plan.genegeerdVerdwenen = weg;
    plan.status = 'deels';
    plan.melding =
      `${weg.length} wedstrijden ontbraken in het antwoord, meer dan ${DREMPEL_VERDWENEN}: ` +
      'er is niets als verdwenen gezet, want dat wijst eerder op een storing.';
  } else {
    plan.verdwenen = weg;
  }

  if (plan.gevonden === 0 && bestaand.length > 0) {
    return {
      ...plan,
      nieuweWedstrijden: [], basisGewijzigd: [], officialsNieuw: [], officialsBijwerken: [],
      nieuweForfaits: [], verdwenen: [], status: 'mislukt',
      melding: 'De bond gaf nul wedstrijden terug terwijl er bewaard zijn; er is niets gewijzigd.',
    };
  }
  return plan;
}
