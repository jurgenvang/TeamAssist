// Mijn club (T7): de regels, als zuivere functies — zonder databank en zonder
// netwerk, zodat ze apart te testen zijn (test/mijnclub.test.mjs).
//
// Beslist met Jurgen, 20 november 2026:
//  - het venster is het vorige en het komende weekend;
//  - wie nog niets koos, ziet zijn eigen ploegen, en alle ploegen als hij aan
//    geen enkele hangt;
//  - 'op de hoogte houden' meldt een gewijzigde datum, uur of zaal, en een
//    nieuwe uitslag — gebundeld per ophaling, één bericht per persoon.

import { plusDagen } from './klok.js';

/**
 * Het venster van Mijn club: van de zaterdag van het vorige weekend tot de
 * zondag van het komende. Tijdens een weekend is dat weekend het komende, en
 * staat het weekend ervoor er nog in — zo staan de uitslagen van gisteren er
 * altijd bij.
 *
 * vrijdag 20/11/2026  → za 14/11 – zo 22/11
 * zaterdag 21/11/2026 → za 14/11 – zo 22/11
 * maandag 23/11/2026  → za 21/11 – zo 29/11
 */
export function mijnclubVenster(vandaag) {
  const dag = new Date(`${vandaag}T00:00:00Z`).getUTCDay(); // 0 = zondag
  const weekdag = dag === 0 ? 7 : dag; // 1 = maandag … 7 = zondag
  // De zondag van het komende weekend: deze week, of vandaag als het zondag is.
  const tot = plusDagen(vandaag, 7 - weekdag);
  // De zaterdag daarvoor is die van het komende weekend; een week vroeger die
  // van het vorige.
  return { van: plusDagen(tot, -8), tot };
}

/**
 * Welke ploegen iemand ziet. `keuzes` zijn zijn rijen uit `mijnclub_ploegen`.
 * Heeft hij ooit gekozen (een rij met `tonen` ingevuld), dan geldt die keuze
 * voor alle ploegen samen: een ploeg zonder rij staat dan uit. Anders de
 * standaard: zijn eigen ploegen, en alle als hij aan geen enkele hangt.
 */
export function toonPloegen(ploegen, eigen, keuzes) {
  const opGuid = new Map(keuzes.map((k) => [k.team_guid, k]));
  const gekozen = keuzes.some((k) => k.tonen === 0 || k.tonen === 1);
  const eigenGevolgd = ploegen.filter((p) => eigen.has(p.guid));
  return ploegen.map((p) => {
    const k = opGuid.get(p.guid);
    let tonen;
    if (gekozen) tonen = k?.tonen === 1;
    else tonen = eigenGevolgd.length ? eigen.has(p.guid) : true;
    return { ...p, eigen: eigen.has(p.guid), tonen, op_de_hoogte: k?.op_de_hoogte === 1 };
  });
}

/**
 * Een uitslag zoals ze er hoort uit te zien: '62- 58' → '62-58'. De bond
 * geeft ze met opvulspaties door, en TeamAssist bewaart ze zo; enkel bij het
 * tonen netjes maken, zodat een andere vorm in de databank niet bij de
 * volgende ophaling als 'nieuwe uitslag' gemeld wordt. Een andere vorm
 * blijft zoals ze is.
 */
export function netteUitslag(ruw) {
  const s = String(ruw ?? '').trim();
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(s);
  return m ? `${Number(m[1])}-${Number(m[2])}` : s || null;
}

const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const kortDatum = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAGEN[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};
const tegen = (w) => `${w.thuis ? 'thuis' : 'uit'} tegen ${w.tegenstander ?? '?'}`;

/**
 * Wat er voor volgers te melden valt uit het plan van één ploeg
 * (`maakWedstrijdplan`). Een eigen definitie, naast die voor de begeleiding:
 *  - een gewijzigde datum, uur of zaal — enkel als het plan ze meldbaar vindt,
 *    zodat de stille periodes (begin van het seizoen, tweede ronde) ook hier
 *    niemand overspoelen;
 *  - een nieuwe uitslag, ook bij een wedstrijd die verder niet veranderde.
 * Een nieuwe wedstrijd of een andere tegenstander alleen: niets.
 */
export function volgerRegels(ploeg, plan) {
  const naam = ploeg.naam_kort || ploeg.naam;
  const regels = [];
  for (const w of plan.gewijzigd ?? []) {
    const oud = w.was ?? {};
    const moment = oud.datum !== w.datum || oud.begin !== w.begin;
    const zaal = (oud.locatie_tekst ?? null) !== (w.locatie_tekst ?? null);
    if (w.meldbaar && (moment || zaal)) {
      const delen = [];
      if (moment) delen.push(`nu ${kortDatum(w.datum)} om ${w.begin} (was ${kortDatum(oud.datum)} om ${oud.begin})`);
      if (zaal) delen.push(`nu in ${w.locatie_tekst ?? 'een nog onbekende zaal'}${oud.locatie_tekst ? ` (was ${oud.locatie_tekst})` : ''}`);
      regels.push({ team_guid: ploeg.guid, tekst: `${naam} ${tegen(w)}: ${delen.join(', ')}` });
    }
    if (w.uitslag && netteUitslag(oud.uitslag) !== netteUitslag(w.uitslag)) {
      regels.push({ team_guid: ploeg.guid, tekst: `${naam} ${tegen(w)} (${kortDatum(w.datum)}): ${netteUitslag(w.uitslag)}` });
    }
  }
  for (const w of plan.uitslag_bijgewerkt ?? []) {
    // Enkel een echt nieuwe uitslag, niet dezelfde in een andere vorm.
    if (w.uitslag && netteUitslag(w.was?.uitslag) !== netteUitslag(w.uitslag)) {
      regels.push({ team_guid: ploeg.guid, tekst: `${naam} ${tegen(w)} (${kortDatum(w.datum)}): ${netteUitslag(w.uitslag)}` });
    }
  }
  return regels;
}

/** Eén bericht per persoon, met de regels van de ploegen die hij volgt. */
export function bundelPerPersoon(regels, volgers) {
  const perPloeg = new Map();
  for (const r of regels) perPloeg.set(r.team_guid, [...(perPloeg.get(r.team_guid) ?? []), r.tekst]);
  const perPersoon = new Map();
  for (const v of volgers) {
    const eigen = perPloeg.get(v.team_guid);
    if (eigen) perPersoon.set(v.persoon_id, [...(perPersoon.get(v.persoon_id) ?? []), ...eigen]);
  }
  return perPersoon;
}
