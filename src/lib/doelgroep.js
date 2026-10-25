// Wie tot de doelgroep van een mededeling hoort.
//
// Eén SQL-voorwaarde, op twee plaatsen gebruikt: om de ontvangers op te
// lijsten bij het plaatsen, en om bij het aanmelden te beslissen of iemand de
// banner ziet. Zo kan het nooit gebeuren dat iemand een mail kreeg maar de
// banner niet ziet, of omgekeerd.
//
// Een voorwaarde en geen lijst met id's: D1 staat maar honderd gebonden
// parameters per query toe, en een mededeling aan de hele club gaat over
// honderden mensen.

export const DOELGROEPEN = ['iedereen', 'begeleiding', 'ploeg'];

// De rollen die samen 'de begeleiding' van een ploeg vormen. ADMIN en FINADM
// horen er niet bij: dat zijn clubbrede rollen, geen ploegwerking.
const BEGELEIDING = `('COORD', 'COACH', 'PLOEGV')`;

/**
 * De voorwaarde dat persoon `p` tot de doelgroep van mededeling `m` hoort.
 *
 * @param {string} p  SQL-uitdrukking voor het persoon-id
 * @param {string} m  alias van een rij met doelgroep, team_guid en seizoen
 */
export function inDoelgroep(p, m) {
  return `(
    ${m}.doelgroep = 'iedereen'
    OR (${m}.doelgroep = 'begeleiding' AND EXISTS (
          SELECT 1 FROM rollen r
           WHERE r.persoon_id = ${p} AND r.seizoen = ${m}.seizoen
             AND r.rol IN ${BEGELEIDING}))
    OR (${m}.doelgroep = 'ploeg' AND (
          EXISTS (SELECT 1 FROM team_spelers ts
                   WHERE ts.persoon_id = ${p}
                     AND ts.team_guid = ${m}.team_guid AND ts.seizoen = ${m}.seizoen)
          OR EXISTS (SELECT 1 FROM ouder_kind ok
                       JOIN team_spelers ts2 ON ts2.persoon_id = ok.kind_id
                      WHERE ok.ouder_id = ${p}
                        AND ts2.team_guid = ${m}.team_guid AND ts2.seizoen = ${m}.seizoen)
          OR EXISTS (SELECT 1 FROM rollen r2
                      WHERE r2.persoon_id = ${p}
                        AND r2.team_guid = ${m}.team_guid AND r2.seizoen = ${m}.seizoen
                        AND r2.rol IN ${BEGELEIDING})))
  )`;
}

/**
 * Wie een mededeling als bericht krijgt: actief, met een account, en in de
 * doelgroep. Een account, omdat 'Mijn berichten' enkel bestaat voor wie
 * aanmeldt, en omdat een mail aan iemand die de app nog niet kent (een ouder
 * die enkel in het sjabloon staat) meer verwart dan informeert.
 */
export async function ontvangers(db, { doelgroep, team_guid = null, seizoen }) {
  const rijen = await db
    .prepare(
      `SELECT p.id, p.email
         FROM personen p,
              (SELECT ?1 AS doelgroep, ?2 AS team_guid, ?3 AS seizoen) m
        WHERE p.actief = 1
          AND EXISTS (SELECT 1 FROM accounts a WHERE a.persoon_id = p.id)
          AND ${inDoelgroep('p.id', 'm')}
        ORDER BY p.id`
    )
    .bind(doelgroep, team_guid, seizoen)
    .all();
  return rijen.results ?? [];
}
