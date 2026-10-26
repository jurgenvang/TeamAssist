// GET /api/admin/officials/overzicht[?voorbij=1&weekends=2&dagen=60]
// (0.39.0, uit YOAssist `routes/admin/overzicht.js`).
//
// De thuiswedstrijden van de ploegen met officials, met per wedstrijd de
// scheidsrechters van de bond, wie zich beschikbaar of niet beschikbaar zette,
// wie er van de club op staat, en of er iets aandacht vraagt. De cijfers
// bovenaan gaan enkel over de eerstvolgende volledige weekends; de lijst reikt
// verder, zodat 'toon meer' geen tweede oproep kost.
//
// Met ?voorbij=1 begint de lijst bij de eerste van de vorige maand: om achteraf
// recht te zetten vóór een maand wordt afgesloten. Een voorbije wedstrijd telt
// nooit mee in de cijfers en is nooit een 'probleem'.

import { json } from '../lib/http.js';
import { aantalNodig, vblOfficials } from './regels.js';
import { wedstrijdbladUrl } from './routes.js';
import { weekendVenster, vensterLabel, beginVorigeMaand } from './venster.js';

const VOORWAARDE = `w.seizoen = ?1 AND w.bij_bond = 1 AND t.officials = 1 AND w.thuis = 1 AND w.datum BETWEEN ?2 AND ?3`;
const BASIS = `FROM wedstrijden w
  JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
  JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen`;

const naam = (x) => `${x.voornaam} ${x.achternaam}`.trim();

export async function clubOverzicht(ctx) {
  const { db, seizoen, request } = ctx;
  const url = new URL(request.url);
  const weekends = Math.min(Math.max(Number(url.searchParams.get('weekends') ?? 2) || 2, 1), 12);
  const dagen = Math.min(Math.max(Number(url.searchParams.get('dagen') ?? 60) || 60, 1), 365);
  const nu = new Date();
  const venster = weekendVenster(nu, weekends);
  const vandaag = nu.toISOString().slice(0, 10);
  const metVoorbij = url.searchParams.get('voorbij') === '1';
  const van = metVoorbij ? beginVorigeMaand(nu) : vandaag;
  const tot = new Date(nu.getTime() + dagen * 86400000).toISOString().slice(0, 10);
  const params = [seizoen.code, van, tot];

  const w = await db
    .prepare(
      `SELECT w.id, w.wedstrijd_guid, w.datum, w.begin, w.tegenstander, w.locatie_tekst, w.vbl_acc_guid, w.uitslag,
              t.naam AS ploeg, o.cat_code, o.poule_naam, o.off_namen, o.off_aantal, o.off_gewist, o.bond_officials,
              o.forfait, o.scope, o.scope_reden, o.scope_uit, o.refs_bevestigd,
              c.label AS cat_label, c.groep AS cat_groep, c.tarief_cent
         ${BASIS}
         LEFT JOIN officials_categorieen c ON c.code = o.cat_code
        WHERE ${VOORWAARDE}
        ORDER BY w.datum, w.begin, t.naam`
    )
    .bind(...params)
    .all();
  const wedstrijden = w.results ?? [];

  // Antwoorden en aanduidingen elk in één query, op dezelfde voorwaarden —
  // niet met een lijst id's: D1 staat honderd gebonden parameters toe.
  const b = await db
    .prepare(
      `SELECT b.wedstrijd_id, b.status, p.id, p.voornaam, p.achternaam,
              max(CASE WHEN r.rol = 'YOPLUS' THEN 1 ELSE 0 END) AS vanaf_u14
         FROM officials_beschikbaarheid b
         JOIN personen p ON p.id = b.persoon_id
         LEFT JOIN rollen r ON r.persoon_id = p.id AND r.rol IN ('YO', 'YOPLUS')
         JOIN wedstrijden w ON w.id = b.wedstrijd_id
         JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
        WHERE ${VOORWAARDE}
        GROUP BY b.wedstrijd_id, p.id
        ORDER BY p.achternaam, p.voornaam`
    )
    .bind(...params)
    .all();
  const a = await db
    .prepare(
      `SELECT a.wedstrijd_id, p.id, p.voornaam, p.achternaam
         FROM officials_aanduidingen a
         JOIN personen p ON p.id = a.persoon_id
         JOIN wedstrijden w ON w.id = a.wedstrijd_id
         JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
        WHERE ${VOORWAARDE} AND a.status = 'toegewezen'
        ORDER BY a.toegewezen_op, p.achternaam`
    )
    .bind(...params)
    .all();

  const antwoorden = new Map();
  for (const x of b.results ?? []) {
    const plek = antwoorden.get(x.wedstrijd_id) ?? { ja: [], nee: [] };
    plek[x.status].push({ id: x.id, naam: naam(x), vanaf_u14: x.vanaf_u14 === 1 });
    antwoorden.set(x.wedstrijd_id, plek);
  }
  const aangeduid = new Map();
  for (const x of a.results ?? []) {
    aangeduid.set(x.wedstrijd_id, [...(aangeduid.get(x.wedstrijd_id) ?? []), { id: x.id, naam: naam(x) }]);
  }

  const lijst = wedstrijden.map((x) => {
    const antwoord = antwoorden.get(x.id) ?? { ja: [], nee: [] };
    const toegewezen = aangeduid.get(x.id) ?? [];
    const voorbij = x.datum < vandaag;
    const forfait = x.forfait ?? null;
    const nodig = forfait ? 0 : aantalNodig(x.off_aantal, { bondOfficials: x.bond_officials });
    let vblRefs = [];
    try {
      vblRefs = x.off_namen ? JSON.parse(x.off_namen) : [];
    } catch {
      vblRefs = [];
    }
    return {
      id: x.id,
      datum: x.datum,
      uur: x.begin,
      ploeg: x.ploeg,
      tegenstander: x.tegenstander,
      locatie: x.locatie_tekst,
      poule: x.poule_naam,
      uitslag: x.uitslag ?? null,
      cat_code: x.cat_code,
      cat_label: x.cat_label,
      cat_groep: x.cat_groep,
      tarief_cent: x.tarief_cent ?? null,
      wedstrijdblad: wedstrijdbladUrl(x.wedstrijd_guid),
      // De namen worden een dag na de wedstrijd gewist; het aantal blijft.
      vbl_aantal: x.off_aantal,
      vbl_refs: vblRefs,
      vbl_namen_gewist: x.off_gewist === 1,
      bond_officials: x.bond_officials ?? null,
      vbl_officials: vblOfficials(x.off_aantal, x.bond_officials),
      beschikbaar: antwoord.ja,
      niet_beschikbaar: antwoord.nee,
      toegewezen,
      in_scope: x.scope === 1,
      scope_reden: x.scope_reden,
      scope_uit: x.scope_uit === 1,
      refs_bevestigd: x.refs_bevestigd === 1,
      nodig,
      forfait,
      voorbij,
      in_venster: !voorbij && x.datum <= venster.tot,
      // Aandacht nodig: in de lijst, en te weinig volk — nog niet genoeg
      // aangeduid, of niemand beschikbaar om uit te kiezen.
      probleem: !voorbij && !forfait && x.scope === 1 && (toegewezen.length < nodig || antwoord.ja.length === 0),
    };
  });

  const inVenster = lijst.filter((x) => x.in_venster);
  return json({
    van,
    tot,
    met_voorbij: metVoorbij,
    venster: { ...venster, label: vensterLabel(venster) },
    aantal: lijst.length,
    in_venster: inVenster.length,
    in_scope: inVenster.filter((x) => x.in_scope).length,
    onvolledig: inVenster.filter((x) => x.in_scope && x.toegewezen.length < x.nodig).length,
    zonder_beschikbaren: inVenster.filter((x) => x.in_scope && !x.forfait && x.beschikbaar.length === 0).length,
    met_probleem: inVenster.filter((x) => x.probleem).length,
    wedstrijden: lijst,
  });
}
