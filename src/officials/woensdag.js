// De woensdagregel met de API, en de avondcontrole (0.34.0, uit YOAssist
// `woensdag.js`).
//
// Sinds de woensdaglijst van de bond (woensdaglijst.js) is dit de terugval: om
// 20 uur, als er dan nog geen lijst is. Kandidaten zijn de thuiswedstrijden van
// het komende weekend, vanaf U14, met minder dan twee scheidsrechters in de API.
//
// Twee dingen die de regel bewust niet doet:
//  - wedstrijden binnenhalen die een beheerder eruit zette (scope_uit); anders
//    vecht de beheerder elke week tegen de automaat;
//  - iets doen met wat al in de lijst staat.
// Anders dan in YOAssist enkel gekende categorieën vanaf U14: een G08 of ROL
// krijgt nooit een scheidsrechter van de bond, en komt dus ook niet in de
// lijst (zoals de woensdaglijst en Regio het sinds V41 al deden).

import { vblOfficials } from './regels.js';

/** Het eerstvolgende weekend vanaf een dag, als [zaterdag, zondag]. Op woensdag dat van dezelfde week. */
export function komendWeekend(vanaf) {
  const dag = vanaf.getUTCDay(); // 0 = zondag, 6 = zaterdag
  const naarZaterdag = (6 - dag + 7) % 7;
  const zaterdag = new Date(vanaf.getTime() + naarZaterdag * 86400000);
  const zondag = new Date(zaterdag.getTime() + 86400000);
  return [zaterdag.toISOString().slice(0, 10), zondag.toISOString().slice(0, 10)];
}

/** De thuiswedstrijden waar de officials over gaan: in het seizoen, bij de bond, ploeg met officials, vanaf U14. */
export const EIGEN_VANAF_U14 = `FROM wedstrijden w
  JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
  JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
  JOIN officials_categorieen c ON c.code = o.cat_code
 WHERE w.seizoen = ? AND w.bij_bond = 1 AND t.officials = 1 AND c.groep != 'U10U12'`;

const alsWedstrijd = (k) => ({
  id: k.id,
  datum: k.datum,
  uur: k.uur,
  thuis: k.thuis,
  uit: k.uit,
  locatie: k.locatie,
  catCode: k.cat_code,
  catLabel: k.cat_label,
});

/**
 * @returns {{gescoopt, wedstrijden, van, tot}}
 */
export async function pasWoensdagregelToe(db, seizoen, nu = new Date()) {
  const [van, tot] = komendWeekend(nu);
  const r = await db
    .prepare(
      `SELECT w.id, w.datum, w.begin AS uur, t.naam AS thuis, w.tegenstander AS uit, w.locatie_tekst AS locatie,
              o.off_aantal, o.bond_officials, o.cat_code, c.label AS cat_label
         ${EIGEN_VANAF_U14}
          AND o.scope = 0 AND o.scope_uit = 0 AND o.off_aantal < 2
          AND o.forfait IS NULL   -- gaat niet door: geen officials nodig
          AND w.datum BETWEEN ? AND ?
        ORDER BY w.datum, w.begin, t.naam`
    )
    .bind(seizoen, van, tot)
    .all();
  const kandidaten = r.results ?? [];
  if (!kandidaten.length) return { gescoopt: 0, wedstrijden: [], van, tot };

  const nuIso = nu.toISOString();
  await db.batch(
    kandidaten.map((k) =>
      db
        .prepare(`UPDATE officials_wedstrijd SET scope = 1, scope_reden = 'woensdag', scope_op = ? WHERE wedstrijd_id = ?`)
        .bind(nuIso, k.id)
    )
  );
  return {
    gescoopt: kandidaten.length,
    van,
    tot,
    wedstrijden: kandidaten.map((k) => ({ ...alsWedstrijd(k), nogNodig: Math.max(0, 2 - k.off_aantal) })),
  };
}

/**
 * Avondcontrole: wedstrijden die via de woensdagregel in de lijst kwamen maar
 * intussen twee scheidsrechters van de bond hebben. Niet automatisch eruit:
 * er kan al iemand van de club op staan of zich beschikbaar gezet hebben, en
 * dat stil laten verdwijnen is erger dan de beheerder laten beslissen.
 */
export async function zoekOverbodigeScope(db, seizoen, vandaag = new Date().toISOString().slice(0, 10)) {
  const r = await db
    .prepare(
      `SELECT w.id, w.datum, w.begin AS uur, t.naam AS thuis, w.tegenstander AS uit,
              o.off_aantal, o.bond_officials,
              (SELECT COUNT(*) FROM officials_aanduidingen a
                WHERE a.wedstrijd_id = w.id AND a.status = 'toegewezen') AS eigen,
              (SELECT COUNT(*) FROM officials_beschikbaarheid b WHERE b.wedstrijd_id = w.id) AS antwoorden
         ${EIGEN_VANAF_U14}
          AND o.scope = 1 AND o.scope_reden = 'woensdag'
          AND o.off_aantal >= 2
          AND w.datum >= ?
        ORDER BY w.datum, w.begin`
    )
    .bind(seizoen, vandaag)
    .all();
  return (r.results ?? []).map((x) => ({
    id: x.id,
    datum: x.datum,
    uur: x.uur,
    omschrijving: `${x.datum} ${x.uur} ${x.thuis} - ${x.uit ?? '?'}`,
    vblAantal: vblOfficials(x.off_aantal, x.bond_officials),
    eigenToegewezen: x.eigen,
    antwoorden: x.antwoorden,
  }));
}
