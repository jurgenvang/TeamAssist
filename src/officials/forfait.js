// Forfait verwerken (0.37.0, uit YOAssist V40 `forfait.js`).
//
// Krijgt een wedstrijd een forfait terwijl er iemand van de club op staat,
// dan beslist de instelling `forfait_aanduiding`:
//  - 'vrijgeven' (standaard): de aanduiding vervalt, maar enkel als het
//    forfait vóór de wedstrijddag bekend is. Dan gaat de wedstrijd zeker niet
//    door, en hoort de official het op tijd.
//  - 'melden': de aanduiding blijft; de beheerders beslissen.
// Een forfait dat pas op de dag zelf of achteraf verschijnt, wordt nooit
// automatisch vrijgegeven: de official kan al ter plaatse geweest zijn, en dan
// beslist de beheerder bij de vergoedingen.

import { logSchrijf } from '../lib/logboek.js';
import { verwittig } from '../lib/verwittigen.js';
import { instellingLezen } from '../routes/admin/instellingen.js';
import { beheerders, verwittigAllen } from './ontvangers.js';
import { maandVan } from './vergoeding.js';

export function tekstForfaitBeheer({ vrijgegeven = [], teBekijken = [] }) {
  const regel = (w) => `- ${w.datum} ${w.uur} ${w.wedstrijd}: ${w.officials.join(', ')}`;
  const delen = [];
  if (vrijgegeven.length) delen.push(`Automatisch vrijgegeven (forfait vóór de wedstrijddag):\n${vrijgegeven.map(regel).join('\n')}`);
  if (teBekijken.length) {
    delen.push(
      `Zelf te bekijken — de aanduiding staat nog:\n${teBekijken.map(regel).join('\n')}\n\n` +
        'Is het forfait pas op de dag zelf of achteraf gekend, dan kan de official al ter plaatse ' +
        'geweest zijn. Bekijk dat bij het afsluiten van de vergoedingen.'
    );
  }
  const aantal = vrijgegeven.length + teBekijken.length;
  return {
    kort: `${aantal} wedstrijd${aantal === 1 ? '' : 'en'} met forfait waar iemand van de club op stond`,
    onderwerp: `Forfait: ${aantal} wedstrijd${aantal === 1 ? '' : 'en'} met een aanduiding`,
    tekst: `Hallo,\n\n${delen.join('\n\n')}`,
  };
}

/**
 * @param {{db, env}} ctx
 * @param {{id: number}[]} nieuwe  plan.nieuweForfaits uit de officials-sync
 */
export async function verwerkForfaits(ctx, nieuwe, nu = new Date()) {
  const { db } = ctx;
  const uitkomst = { vrijgegeven: [], teBekijken: [] };
  if (!nieuwe?.length) return uitkomst;

  const vandaag = nu.toISOString().slice(0, 10);
  const modus = await instellingLezen(db, 'forfait_aanduiding', 'vrijgeven');
  const afgesloten = new Set(((await db.prepare(`SELECT maand FROM officials_maanden`).all()).results ?? []).map((x) => x.maand));

  for (const f of nieuwe) {
    // Per wedstrijd één query: onder de honderd parameters van D1, hoeveel
    // forfaits er ook tegelijk binnenkomen.
    const r = await db
      .prepare(
        `SELECT a.persoon_id, p.voornaam, p.achternaam, w.datum, w.begin, w.tegenstander, t.naam AS ploeg
           FROM officials_aanduidingen a
           JOIN personen p ON p.id = a.persoon_id
           JOIN wedstrijden w ON w.id = a.wedstrijd_id
           JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
          WHERE a.wedstrijd_id = ? AND a.status = 'toegewezen'`
      )
      .bind(f.id)
      .all();
    const op = r.results ?? [];
    if (!op.length) continue;

    const m = op[0];
    const vooraf = m.datum > vandaag;
    // Voorbij en in een afgesloten maand: de vergoeding ligt vast, en de
    // beheerders daar nu mee lastigvallen is ruis.
    if (!vooraf && afgesloten.has(maandVan(m.datum))) continue;

    const wedstrijd = `${m.ploeg} - ${m.tegenstander ?? '?'}`;
    const item = { id: f.id, datum: m.datum, uur: m.begin, wedstrijd, officials: op.map((a) => `${a.voornaam} ${a.achternaam}`.trim()) };
    if (!(vooraf && modus === 'vrijgeven')) {
      uitkomst.teBekijken.push(item);
      continue;
    }

    for (const a of op) {
      await db
        .prepare(
          `UPDATE officials_aanduidingen SET status = 'vrijgegeven', gewijzigd_op = datetime('now')
            WHERE wedstrijd_id = ? AND persoon_id = ? AND status = 'toegewezen'`
        )
        .bind(f.id, a.persoon_id)
        .run();
      await logSchrijf(db, {
        soort: 'officials',
        wat: `vrijgegeven (forfait): ${wedstrijd} (${m.datum} om ${m.begin})`,
        details: `${a.voornaam} ${a.achternaam}`.trim(),
      });
      await verwittig(ctx, {
        persoon_id: a.persoon_id,
        soort: 'vrijgave',
        onderwerp: `Gaat niet door (forfait): ${wedstrijd}`,
        kort: `${m.datum} om ${m.begin} — forfait, gaat niet door`,
        inhoud:
          `Hallo ${a.voornaam},\n\n${wedstrijd} (${m.datum} om ${m.begin}) gaat niet door: er is forfait gegeven.\n\n` +
          'Je aanduiding is daarom vervallen. Je hoeft niets te doen.',
      }).catch(() => null);
    }
    uitkomst.vrijgegeven.push(item);
  }

  if (uitkomst.vrijgegeven.length || uitkomst.teBekijken.length) {
    await verwittigAllen(ctx, await beheerders(db), tekstForfaitBeheer(uitkomst));
  }
  return uitkomst;
}
