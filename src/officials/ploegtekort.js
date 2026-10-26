// Ploegverantwoordelijken en coaches verwittigen bij te weinig scheidsrechters
// (0.37.0, uit YOAssist V34 `ploegcontacten.js`).
//
// In YOAssist twee eigen lijsten (ploeg_pv, ploeg_coaches) met een sjabloon;
// hier zijn het gewoon de rollen PLOEGV en COACH van de ploeg in het seizoen
// (beslist in I1). Wie ze zijn, beheert TeamAssist al: de bond levert de
// coaches, een beheerder koppelt de rest. Geen sjabloon nodig.
//
// Woensdag 20 uur geruststellen (de club zoekt), donderdag 20 uur opnieuw als
// het nog niet gelukt is, met de vraag om mee te zoeken. Wie woensdag een
// bericht kreeg en donderdag niet meer, weet zo dat het geregeld is.

import { logSchrijf } from '../lib/logboek.js';
import { verwittig } from '../lib/verwittigen.js';
import { aantalNodig } from './regels.js';
import { komendWeekend } from './woensdag.js';

const DAG_KORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

/** '2026-10-11' → 'zo 11/10': wie de app niet opent, leest liever een dag dan een datum. */
function dagLeesbaar(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAG_KORT[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

export function tekstPloegTekort({ voornaam, ronde, wedstrijden, contact }) {
  const lijst = wedstrijden
    .map(
      (w) =>
        `- ${dagLeesbaar(w.datum)} ${w.uur} ${w.thuis} - ${w.uit}${w.locatie ? ` (${w.locatie})` : ''}: ` +
        `nog ${w.nogNodig} scheidsrechter${w.nogNodig === 1 ? '' : 's'} nodig`
    )
    .join('\n');
  const wie = contact.map((c) => `${c.naam} (${c.email})`).join(', ');
  const enkel = wedstrijden.length === 1;
  const eerste = wedstrijden[0];

  if (ronde === 'woensdag') {
    return {
      kort: `Scheidsrechters gezocht voor ${wedstrijden.length} wedstrijd(en)`,
      onderwerp: enkel
        ? `Scheidsrechters gezocht: ${eerste.thuis} ${dagLeesbaar(eerste.datum)}`
        : `Scheidsrechters gezocht voor ${wedstrijden.length} wedstrijden`,
      tekst:
        `Hallo ${voornaam},\n\nVoor ${enkel ? 'deze wedstrijd' : 'deze wedstrijden'} van het komende weekend zijn er ` +
        `nog niet genoeg scheidsrechters:\n\n${lijst}\n\n` +
        'We zoeken een oplossing bij onze Youth Officials. Je hoeft nu niets te doen. ' +
        'Is het tegen donderdagavond nog niet gelukt, dan laten we het je weten.' +
        (wie ? `\n\nVragen? Neem contact op met ${wie}.` : ''),
    };
  }
  return {
    kort: `Nog geen scheidsrechters voor ${wedstrijden.length} wedstrijd(en)`,
    onderwerp: enkel
      ? `Nog geen scheidsrechters: ${eerste.thuis} ${dagLeesbaar(eerste.datum)}`
      : `Nog geen scheidsrechters voor ${wedstrijden.length} wedstrijden`,
    tekst:
      `Hallo ${voornaam},\n\nHet is ons nog niet gelukt om genoeg scheidsrechters te vinden voor ` +
      `${enkel ? 'deze wedstrijd' : 'deze wedstrijden'}:\n\n${lijst}\n\n` +
      'Kan iemand van de ploeg inspringen — een ouder, of een speler met een scheidsrechterscursus? ' +
      (wie ? `Laat het dan weten aan ${wie}.` : 'Laat het dan weten aan de club.'),
  };
}

/**
 * Eigen thuiswedstrijden van het komende weekend met te weinig scheidsrechters:
 * bond en club samen minder dan twee — wat 'nog nodig' in het cluboverzicht
 * toont, ook als de wedstrijd niet in de aanduidingslijst staat. Overgeslagen:
 * forfait, een onbekende categorie (G08, ROL: daar komt nooit iemand), en
 * wat een beheerder als 'twee refs' bevestigde.
 */
export async function tekortKomendWeekend(db, seizoen, nu = new Date()) {
  const [van, tot] = komendWeekend(nu);
  const r = await db
    .prepare(
      `SELECT w.id, w.team_guid, w.seizoen, w.datum, w.begin, w.tegenstander, w.locatie_tekst, t.naam AS ploeg,
              o.off_aantal, o.bond_officials,
              (SELECT COUNT(*) FROM officials_aanduidingen a WHERE a.wedstrijd_id = w.id AND a.status = 'toegewezen') AS bezet
         FROM wedstrijden w
         JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
         JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
         JOIN officials_categorieen c ON c.code = o.cat_code
        WHERE w.seizoen = ? AND w.bij_bond = 1 AND t.officials = 1
          AND o.forfait IS NULL AND o.refs_bevestigd = 0
          AND w.datum BETWEEN ? AND ?
        ORDER BY w.datum, w.begin`
    )
    .bind(seizoen, van, tot)
    .all();
  return {
    van,
    tot,
    wedstrijden: (r.results ?? [])
      .map((m) => ({
        id: m.id, teamGuid: m.team_guid, datum: m.datum, uur: m.begin, thuis: m.ploeg, uit: m.tegenstander ?? '?',
        locatie: m.locatie_tekst, nogNodig: aantalNodig(m.off_aantal, { bondOfficials: m.bond_officials }) - m.bezet,
      }))
      .filter((w) => w.nogNodig > 0),
  };
}

/**
 * Eén bericht per persoon, ook als hij PV van de ene en coach van een andere
 * ploeg is. Via verwittig(): kanaal, en bij een minderjarige ook de ouders.
 *
 * @param {'woensdag'|'donderdag'} ronde
 */
export async function verwittigPloegen(ctx, ronde, nu = new Date()) {
  const { db, seizoen } = ctx;
  const { van, tot, wedstrijden } = await tekortKomendWeekend(db, seizoen.code, nu);
  const r = { ronde, van, tot, wedstrijden: wedstrijden.length, ontvangers: 0, verstuurd: 0, zonder_contact: [] };
  if (!wedstrijden.length) return r;

  // Wie PV of coach is van de ploegen met een tekort: op de voorwaarden van
  // het weekend, niet op een lijst ploegen (D1: honderd parameters).
  const p = await db
    .prepare(
      `SELECT DISTINCT ro.team_guid, p.id, p.voornaam
         FROM rollen ro JOIN personen p ON p.id = ro.persoon_id AND p.actief = 1
        WHERE ro.rol IN ('PLOEGV', 'COACH') AND ro.seizoen = ?
        ORDER BY p.voornaam`
    )
    .bind(seizoen.code)
    .all();
  const perPloeg = new Map();
  for (const x of p.results ?? []) perPloeg.set(x.team_guid, [...(perPloeg.get(x.team_guid) ?? []), x]);

  const perPersoon = new Map();
  for (const w of wedstrijden) {
    const mensen = perPloeg.get(w.teamGuid) ?? [];
    if (!mensen.length) r.zonder_contact.push(w);
    for (const m of mensen) {
      const plek = perPersoon.get(m.id) ?? { voornaam: m.voornaam, wedstrijden: [] };
      if (!plek.wedstrijden.includes(w)) plek.wedstrijden.push(w);
      perPersoon.set(m.id, plek);
    }
  }

  const b = await db
    .prepare(
      `SELECT DISTINCT p.voornaam || ' ' || p.achternaam AS naam, p.email
         FROM rollen r JOIN personen p ON p.id = r.persoon_id
        WHERE r.rol = 'YOADM' AND p.actief = 1 AND p.email IS NOT NULL AND p.email != ''
        ORDER BY p.voornaam`
    )
    .all();
  const contact = b.results ?? [];

  for (const [persoon_id, { voornaam, wedstrijden: eigen }] of perPersoon) {
    const t = tekstPloegTekort({ voornaam, ronde, wedstrijden: eigen, contact });
    const uit = await verwittig(ctx, { persoon_id, soort: 'officials', onderwerp: t.onderwerp, inhoud: t.tekst, kort: t.kort })
      .catch(() => null);
    if (uit?.verstuurd) r.verstuurd += 1;
  }
  r.ontvangers = perPersoon.size;

  await logSchrijf(db, {
    soort: 'officials',
    wat: `PV's en coaches verwittigd (${ronde})`,
    details:
      `${van} tot ${tot}: ${wedstrijden.length} wedstrijd(en) met te weinig scheidsrechters, ` +
      `${r.verstuurd} van ${r.ontvangers} bericht(en) verstuurd` +
      (r.zonder_contact.length ? `, ${r.zonder_contact.length} zonder PV of coach: ${r.zonder_contact.map((w) => w.thuis).join(', ')}` : ''),
  });
  return r;
}
