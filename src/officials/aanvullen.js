// POST /api/admin/officials/automatisch  { dagen?: 14, uitvoeren?: false }
// (0.35.0, uit YOAssist `routes/admin/auto.js`).
//
// Standaard een droogloop: je krijgt terug wat er zou gebeuren zonder dat er
// iets verandert. Pas met uitvoeren: true wordt er weggeschreven. Die volgorde
// is opzettelijk — een automaat die meteen twintig mensen inplant zonder dat
// iemand het gezien heeft, verliest snel het vertrouwen.
//
// Anders dan in YOAssist krijgt wie automatisch aangeduid wordt, hetzelfde
// bericht als bij een handmatige aanduiding: voor de official is er geen
// verschil, en anders hoort hij het pas in de herinnering de avond ervoor.

import { json, leesJson } from '../lib/http.js';
import { logSchrijf } from '../lib/logboek.js';
import { aantalNodig } from './regels.js';
import { plan } from './autotoewijzing.js';
import { verwittigAanduiding } from './routes.js';

const LIJST = `FROM wedstrijden w
  JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
  JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
  LEFT JOIN officials_categorieen c ON c.code = o.cat_code
 WHERE w.seizoen = ?1 AND w.bij_bond = 1 AND t.officials = 1 AND o.scope = 1
   AND o.forfait IS NULL AND w.datum BETWEEN ?2 AND ?3`;

export async function automatischAanvullen(ctx) {
  const { db, seizoen, persoon: beheerder } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const dagen = Math.min(Math.max(Number(body.dagen ?? 14) || 14, 1), 120);
  const uitvoeren = body.uitvoeren === true;
  const vandaag = new Date().toISOString().slice(0, 10);
  const tot = new Date(Date.now() + dagen * 86400000).toISOString().slice(0, 10);

  const r = await db
    .prepare(
      `SELECT w.id, w.datum, w.begin, w.vbl_acc_guid, w.tegenstander, w.locatie_tekst, t.naam AS ploeg,
              o.off_aantal, o.bond_officials, c.groep AS cat_groep,
              (SELECT COUNT(*) FROM officials_aanduidingen a
                WHERE a.wedstrijd_id = w.id AND a.status = 'toegewezen') AS bezet
         ${LIJST}
        ORDER BY w.datum, w.begin`
    )
    .bind(seizoen.code, vandaag, tot)
    .all();
  const wedstrijden = (r.results ?? [])
    .map((x) => ({
      id: x.id,
      datum: x.datum,
      uur: x.begin,
      accGuid: x.vbl_acc_guid,
      catGroep: x.cat_groep,
      rij: x,
      omschrijving: `${x.datum} ${x.begin} ${x.ploeg} - ${x.tegenstander ?? '?'}`,
      nodig: aantalNodig(x.off_aantal, { bondOfficials: x.bond_officials }),
      bezet: x.bezet,
    }))
    .filter((w) => w.nodig > w.bezet);

  if (!wedstrijden.length) {
    return json({
      dagen, uitgevoerd: false, aantal_toegewezen: 0, aantal_onvolledig: 0, toewijzingen: [], onvolledig: [],
      verdeling: [], boodschap: 'Alle wedstrijden in dit venster zijn al volledig aangeduid.',
    });
  }

  // Wie 'ja' zei, met zijn rol. Op de voorwaarden van de lijst filteren, niet
  // op een lijst id's: D1 staat honderd gebonden parameters per query toe.
  const v = await db
    .prepare(
      `SELECT b.wedstrijd_id, p.id, p.voornaam, p.achternaam,
              max(CASE WHEN ro.rol = 'YOPLUS' THEN 1 ELSE 0 END) AS vanaf_u14
         FROM officials_beschikbaarheid b
         JOIN personen p ON p.id = b.persoon_id AND p.actief = 1
         JOIN rollen ro ON ro.persoon_id = p.id AND ro.rol IN ('YO', 'YOPLUS')
         JOIN wedstrijden w ON w.id = b.wedstrijd_id
         JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
         JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
        WHERE b.status = 'ja' AND w.seizoen = ?1 AND w.bij_bond = 1 AND t.officials = 1 AND o.scope = 1
          AND o.forfait IS NULL AND w.datum BETWEEN ?2 AND ?3
        GROUP BY b.wedstrijd_id, p.id
        ORDER BY p.id`
    )
    .bind(seizoen.code, vandaag, tot)
    .all();

  const naam = new Map();
  const official = new Map();
  const kandidaten = new Map();
  const perWedstrijd = new Map(wedstrijden.map((w) => [w.id, w]));
  for (const k of v.results ?? []) {
    const w = perWedstrijd.get(k.wedstrijd_id);
    if (!w) continue;
    // Dezelfde grens als bij handmatig aanduiden: een YO enkel U10/U12.
    if (!k.vanaf_u14 && w.catGroep !== 'U10U12') continue;
    naam.set(k.id, `${k.voornaam} ${k.achternaam}`.trim());
    official.set(k.id, { id: k.id, voornaam: k.voornaam });
    kandidaten.set(w.id, [...(kandidaten.get(w.id) ?? []), k.id]);
  }

  // De huidige belasting en agenda van elke official, dit seizoen.
  const a = await db
    .prepare(
      `SELECT a.persoon_id, w.id, w.datum, w.begin, w.vbl_acc_guid
         FROM officials_aanduidingen a JOIN wedstrijden w ON w.id = a.wedstrijd_id
        WHERE a.status = 'toegewezen' AND w.bij_bond = 1 AND w.seizoen = ?`
    )
    .bind(seizoen.code)
    .all();
  const telling = new Map();
  const agenda = new Map();
  for (const x of a.results ?? []) {
    telling.set(x.persoon_id, (telling.get(x.persoon_id) ?? 0) + 1);
    agenda.set(x.persoon_id, [
      ...(agenda.get(x.persoon_id) ?? []),
      { id: x.id, datum: x.datum, uur: x.begin, accGuid: x.vbl_acc_guid },
    ]);
  }

  const uitkomst = plan({ wedstrijden, kandidaten, telling, agenda });

  let verwittigd = 0;
  if (uitvoeren && uitkomst.toewijzingen.length) {
    await db.batch(
      uitkomst.toewijzingen.map((t) =>
        db
          .prepare(
            `INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, status, toegewezen_door, toegewezen_op, gewijzigd_op)
             VALUES (?, ?, 'toegewezen', ?, datetime('now'), datetime('now'))
             ON CONFLICT (wedstrijd_id, persoon_id) DO UPDATE
               SET status = 'toegewezen', toegewezen_door = excluded.toegewezen_door, gewijzigd_op = datetime('now')`
          )
          .bind(t.id, t.persoon_id, beheerder.id)
      )
    );
    await logSchrijf(db, {
      soort: 'officials',
      wie: beheerder.id,
      wat: `automatisch aangevuld: ${uitkomst.toewijzingen.length} aanduiding(en)`,
      details: uitkomst.toewijzingen
        .map((t) => `${perWedstrijd.get(t.id).omschrijving}: ${naam.get(t.persoon_id)}`)
        .join('; ')
        .slice(0, 2000),
    });
    for (const t of uitkomst.toewijzingen) {
      const w = perWedstrijd.get(t.id).rij;
      if (await verwittigAanduiding(ctx, official.get(t.persoon_id), w)) verwittigd += 1;
    }
  }

  return json({
    dagen,
    uitgevoerd: uitvoeren,
    aantal_toegewezen: uitkomst.toewijzingen.length,
    aantal_onvolledig: uitkomst.onvolledig.length,
    verwittigd,
    toewijzingen: uitkomst.toewijzingen.map((t) => ({
      wedstrijd_id: t.id,
      persoon_id: t.persoon_id,
      naam: naam.get(t.persoon_id),
      wedstrijd: perWedstrijd.get(t.id).omschrijving,
    })),
    onvolledig: uitkomst.onvolledig.map((o) => ({
      wedstrijd_id: o.id,
      wedstrijd: perWedstrijd.get(o.id).omschrijving,
      tekort: o.tekort,
      reden: o.reden,
      geweigerd: o.geweigerd.map((g) => ({ ...g, naam: naam.get(g.persoon_id) })),
    })),
    // Enkel wie in dit venster kandidaat was: de rest van de club hoort niet
    // in een droogloop over deze wedstrijden.
    verdeling: uitkomst.verdeling
      .filter((x) => naam.has(x.persoon_id))
      .map((x) => ({ ...x, naam: naam.get(x.persoon_id) })),
  });
}
