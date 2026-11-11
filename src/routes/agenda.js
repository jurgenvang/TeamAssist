// Mijn agenda (T21): alles wat iemand van het gezin te doen heeft, in één
// lijst — de trainingen en wedstrijden van zijn ploeg, de wedstrijden waarop
// hij als official aangeduid is, en de taken bij een wedstrijd.
//
// Eén route in plaats van vier oproepen vanuit de browser: het venster, de
// volgorde en vooral de botsing tussen spelen en fluiten horen op één plaats,
// waar ze apart te testen zijn. Beslist met Jurgen, 10 november 2026:
//  - een ouder ziet één lijst voor het hele gezin, met 'voor …' bij elk item;
//  - fluiten: enkel wat aangeduid is; wat nog een antwoord vraagt, blijft in
//    Aanduidingen, met hier enkel een teller die ernaar verwijst;
//  - een botsing wordt getoond, nooit geweigerd: de club beslist.
//
// Wie er in de lijst staat, komt uit het token en ouder_kind — nooit uit het
// verzoek. Er is dus geen `namens`: een ouder ziet altijd zichzelf en al zijn
// kinderen samen.

import { json } from '../lib/http.js';
import { brusselDatum } from '../lib/klok.js';
import { rechtenVoor } from '../lib/rechten-db.js';
import { botst, opkomstUur } from '../officials/regels.js';
import { aantalTeBeantwoorden, wedstrijdbladUrl } from '../officials/routes.js';
import { TAAKNAMEN } from './admin/wedstrijdtaken.js';


// Bij veel kinderen zou de lijst anders de honderd-parametergrens van D1
// kunnen raken; niemand heeft er veertig.
const MAX_PERSONEN = 40;

/** De eerste dag na 'deze en volgende maand', zoals grensMaand in de frontend. */
export function grensDatum(vandaag) {
  const [j, m] = vandaag.split('-').map(Number);
  return new Date(Date.UTC(j, m + 1, 1)).toISOString().slice(0, 10);
}

/**
 * Welke items botsen voor dezelfde persoon? Enkel waar er gefloten of een
 * taak gedaan wordt: twee trainingen of een training en een wedstrijd van
 * dezelfde ploeg plant de club zelf, en daar is niets te melden. Dezelfde
 * regel als bij aanduiden (regels.js): twee uur in dezelfde zaal, tweeënhalf
 * uur bij een andere.
 */
export function markeerBotsingen(items) {
  for (const it of items) it.botsingen = [];
  const perPersoon = new Map();
  for (const it of items) perPersoon.set(it.voor.id, [...(perPersoon.get(it.voor.id) ?? []), it]);
  for (const lijst of perPersoon.values()) {
    for (let i = 0; i < lijst.length; i += 1) {
      for (let k = i + 1; k < lijst.length; k += 1) {
        const a = lijst[i];
        const b = lijst[k];
        if (a.soort !== 'fluiten' && a.soort !== 'taak' && b.soort !== 'fluiten' && b.soort !== 'taak') continue;
        // Een taak bij de wedstrijd die je zelf speelt of fluit, is dezelfde plek
        // en hetzelfde moment: dat is geen botsing.
        if (a.wedstrijd_id && a.wedstrijd_id === b.wedstrijd_id) continue;
        if (!botst({ datum: a.datum, uur: a.uur, accGuid: a.acc }, { datum: b.datum, uur: b.uur, accGuid: b.acc })) continue;
        a.botsingen.push(korteNaam(b));
        b.botsingen.push(korteNaam(a));
      }
    }
  }
  return items;
}

function korteNaam(it) {
  const wat = { training: 'training', wedstrijd: 'wedstrijd', fluiten: 'fluiten', taak: it.taak_naam?.toLowerCase() ?? 'taak' }[it.soort];
  return `${wat} om ${it.uur}${it.ploeg ? ` (${it.ploeg})` : ''}`;
}

const naam = (r) => `${r.voornaam ?? ''} ${r.achternaam ?? ''}`.trim();
const ploegNaam = (r) => r.naam_kort || r.ploeg_naam || '';

/** GET /api/mij/agenda */
export async function agenda(ctx) {
  const { db, persoon, rechten, seizoen } = ctx;
  const vandaag = brusselDatum();

  const kinderen = (
    await db
      .prepare(
        `SELECT p.id, p.voornaam, p.achternaam FROM ouder_kind ok JOIN personen p ON p.id = ok.kind_id
          WHERE ok.ouder_id = ? AND p.actief = 1 ORDER BY p.voornaam`
      )
      .bind(persoon.id)
      .all()
  ).results ?? [];
  const personen = [{ id: persoon.id, naam: naam(persoon), ik: true }, ...kinderen.map((k) => ({ id: k.id, naam: naam(k), ik: false }))].slice(0, MAX_PERSONEN);
  const wie = new Map(personen.map((p) => [p.id, p]));
  const ids = personen.map((p) => p.id);
  const plek = ids.map(() => '?').join(',');

  // Trainingen en wedstrijden van de ploegen waarin iemand van het gezin speelt.
  // Eén rij per activiteit én persoon: twee kinderen in dezelfde ploeg hebben
  // elk hun eigen opgave.
  const trainingen = (
    await db
      .prepare(
        `SELECT t.id, t.datum, t.begin, t.einde, t.status, t.locatie_tekst, z.naam AS zaal, z.vbl_acc_guid AS acc,
                tm.naam AS ploeg_naam, tm.naam_kort, ts.persoon_id,
                a.opgave_status, a.opgave_reden, a.uitgesloten, a.uitgesloten_reden
           FROM trainingen t
           JOIN team_spelers ts ON ts.team_guid = t.team_guid AND ts.seizoen = t.seizoen AND ts.persoon_id IN (${plek})
           JOIN teams tm ON tm.guid = t.team_guid AND tm.seizoen = t.seizoen
           LEFT JOIN zalen z ON z.id = t.zaal_id
           LEFT JOIN aanwezigheden a ON a.soort = 'training' AND a.activiteit_id = t.id AND a.persoon_id = ts.persoon_id
          WHERE t.seizoen = ? AND t.datum >= ?`
      )
      .bind(...ids, seizoen.code, vandaag)
      .all()
  ).results ?? [];

  const wedstrijden = (
    await db
      .prepare(
        `SELECT w.id, w.wedstrijd_guid, w.datum, w.begin, w.status, w.thuis, w.tegenstander, w.locatie_tekst,
                w.vbl_acc_guid AS acc, w.uitslag, o.forfait, tm.naam AS ploeg_naam, tm.naam_kort, ts.persoon_id,
                a.opgave_status, a.opgave_reden, a.uitgesloten, a.uitgesloten_reden
           FROM wedstrijden w
           JOIN team_spelers ts ON ts.team_guid = w.team_guid AND ts.seizoen = w.seizoen AND ts.persoon_id IN (${plek})
           JOIN teams tm ON tm.guid = w.team_guid AND tm.seizoen = w.seizoen
           LEFT JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
           LEFT JOIN aanwezigheden a ON a.soort = 'wedstrijd' AND a.activiteit_id = w.id AND a.persoon_id = ts.persoon_id
          WHERE w.seizoen = ? AND w.datum >= ? AND w.bij_bond = 1`
      )
      .bind(...ids, seizoen.code, vandaag)
      .all()
  ).results ?? [];

  // Fluiten: enkel wat aangeduid is.
  const fluiten = (
    await db
      .prepare(
        `SELECT w.id, w.wedstrijd_guid, w.datum, w.begin, w.tegenstander, w.locatie_tekst, w.vbl_acc_guid AS acc,
                w.uitslag, o.forfait, c.label AS cat_label, tm.naam AS ploeg_naam, tm.naam_kort, a.persoon_id
           FROM officials_aanduidingen a
           JOIN wedstrijden w ON w.id = a.wedstrijd_id
           JOIN teams tm ON tm.guid = w.team_guid AND tm.seizoen = w.seizoen
           LEFT JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
           LEFT JOIN officials_categorieen c ON c.code = o.cat_code
          WHERE a.status = 'toegewezen' AND a.persoon_id IN (${plek}) AND w.seizoen = ? AND w.datum >= ?`
      )
      .bind(...ids, seizoen.code, vandaag)
      .all()
  ).results ?? [];

  const taken = (
    await db
      .prepare(
        `SELECT k.id AS taak_id, k.taak, k.probleem_gemeld, w.id, w.wedstrijd_guid, w.datum, w.begin, w.thuis,
                w.tegenstander, w.locatie_tekst, w.vbl_acc_guid AS acc, tm.naam AS ploeg_naam, tm.naam_kort, k.persoon_id
           FROM wedstrijdtaken k
           JOIN wedstrijden w ON w.id = k.wedstrijd_id
           JOIN teams tm ON tm.guid = w.team_guid AND tm.seizoen = w.seizoen
          WHERE k.persoon_id IN (${plek}) AND w.seizoen = ? AND w.datum >= ?`
      )
      .bind(...ids, seizoen.code, vandaag)
      .all()
  ).results ?? [];

  const voor = (id) => wie.get(id);
  const items = [
    ...trainingen.map((r) => ({
      soort: 'training', sleutel: `training-${r.id}-${r.persoon_id}`, id: r.id, voor: voor(r.persoon_id),
      datum: r.datum, uur: r.begin, einde: r.einde, ploeg: ploegNaam(r), locatie: r.zaal ?? r.locatie_tekst ?? null,
      acc: r.acc ?? null, status: r.status, opgave_status: r.opgave_status ?? null, opgave_reden: r.opgave_reden ?? null,
      uitgesloten: r.uitgesloten === 1, uitgesloten_reden: r.uitgesloten_reden ?? null,
    })),
    ...wedstrijden.map((r) => ({
      soort: 'wedstrijd', sleutel: `wedstrijd-${r.id}-${r.persoon_id}`, id: r.id, wedstrijd_id: r.id, voor: voor(r.persoon_id),
      datum: r.datum, uur: r.begin, ploeg: ploegNaam(r), tegenstander: r.tegenstander, thuis: r.thuis === 1,
      locatie: r.locatie_tekst, acc: r.acc ?? null, status: r.status, uitslag: r.uitslag ?? null, forfait: r.forfait ?? null,
      wedstrijdblad: wedstrijdbladUrl(r.wedstrijd_guid),
      opgave_status: r.opgave_status ?? null, opgave_reden: r.opgave_reden ?? null,
      uitgesloten: r.uitgesloten === 1, uitgesloten_reden: r.uitgesloten_reden ?? null,
    })),
    ...fluiten.map((r) => ({
      soort: 'fluiten', sleutel: `fluiten-${r.id}-${r.persoon_id}`, id: r.id, wedstrijd_id: r.id, voor: voor(r.persoon_id),
      datum: r.datum, uur: r.begin, ploeg: ploegNaam(r), tegenstander: r.tegenstander, thuis: true,
      locatie: r.locatie_tekst, acc: r.acc ?? null, uitslag: r.uitslag ?? null, forfait: r.forfait ?? null,
      cat_label: r.cat_label ?? null, opkomst: opkomstUur(r.begin), wedstrijdblad: wedstrijdbladUrl(r.wedstrijd_guid),
    })),
    ...taken.map((r) => ({
      soort: 'taak', sleutel: `taak-${r.taak_id}`, id: r.taak_id, wedstrijd_id: r.id, voor: voor(r.persoon_id),
      datum: r.datum, uur: r.begin, ploeg: ploegNaam(r), tegenstander: r.tegenstander, thuis: r.thuis === 1,
      locatie: r.locatie_tekst, acc: r.acc ?? null, taak: r.taak, taak_naam: TAAKNAMEN[r.taak] ?? r.taak,
      probleem_gemeld: r.probleem_gemeld === 1, wedstrijdblad: wedstrijdbladUrl(r.wedstrijd_guid),
    })),
  ].sort((a, b) => `${a.datum} ${a.uur}`.localeCompare(`${b.datum} ${b.uur}`) || a.voor.naam.localeCompare(b.voor.naam));

  markeerBotsingen(items);

  // Wat er in Aanduidingen nog op een antwoord wacht, per official van het
  // gezin. Met de rechten van die persoon zelf: een kind dat YO is, ziet
  // enkel U10/U12.
  const grens = grensDatum(vandaag);
  const teBeantwoorden = [];
  let isOfficial = false;
  for (const p of personen) {
    const r = p.ik ? rechten : await rechtenVoor(db, p.id, seizoen.code);
    if (!r.mag('officials.opgeven')) continue;
    isOfficial = true;
    const aantal = await aantalTeBeantwoorden(db, seizoen.code, p.id, r.mag('officials.vanaf_u14'), grens);
    if (aantal) teBeantwoorden.push({ id: p.id, naam: p.naam, ik: p.ik, aantal });
  }

  // Wie speelt noch fluit noch een taak heeft (bv. enkel ADMIN), krijgt geen
  // lege agenda te zien.
  const speelt = (
    await db
      .prepare(`SELECT 1 AS ja FROM team_spelers WHERE seizoen = ? AND persoon_id IN (${plek}) LIMIT 1`)
      .bind(seizoen.code, ...ids)
      .first()
  )?.ja === 1;

  return json({
    tonen: speelt || isOfficial || fluiten.length > 0 || taken.length > 0,
    gezin: personen.length > 1,
    grens,
    agenda: items,
    te_beantwoorden: teBeantwoorden,
  });
}
