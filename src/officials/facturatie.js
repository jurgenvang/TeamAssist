// Facturatie van de officials (0.36.0, uit YOAssist `routes/admin/facturatie.js`
// en `routes/vergoeding.js`).
//
// Een maand afsluiten legt de bedragen vast in een momentopname. Daarna
// wijzigen ze niet meer: wat er nadien nog verandert aan de aanduidingen van
// die maand, komt als correctie in de eerstvolgende afsluiting. Dat is
// boekhoudkundig de juiste weg, en een betaald bedrag verandert nooit met
// terugwerkende kracht. `officials_vergoeding_verwerkt` is het spoor van wat
// er al is meegeteld: zonder dat spoor valt een correctie niet te berekenen.
//
// Een wedstrijd heet in dat spoor bij haar GUID (zoals in YOAssist, en zoals de
// migratie ze overzet), niet bij haar id: een rij in `wedstrijden` kan ooit
// opnieuw gemaakt worden, de GUID van de bond blijft.

import { json, fout, leesJson } from '../lib/http.js';
import { logSchrijf } from '../lib/logboek.js';
import { verwittig, verwittigExtern } from '../lib/verwittigen.js';
import { instellingLezen } from '../routes/admin/instellingen.js';
import { voorWie } from './routes.js';
import {
  maandBereik, maandVan, magAfsluiten, bouwRegels, perOfficial, alsBedrag,
  wedstrijdenPerOfficial, verwerktAlsItems, wedstrijdRegel,
} from './vergoeding.js';

const vandaag = () => new Date().toISOString().slice(0, 10);

/** De thuiswedstrijden van de officials, met wat de facturatie ervan nodig heeft. */
const OFFICIALS_WEDSTRIJD = `(SELECT w.id, w.wedstrijd_guid, w.seizoen, w.datum, w.bij_bond, w.tegenstander AS uit_naam,
          t.naam AS thuis_naam, o.cat_code, o.forfait
     FROM wedstrijden w
     JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
     JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen)`;

const naamVan = (r) => `${r.voornaam ?? ''} ${r.achternaam ?? ''}`.trim();

/**
 * Wat er in een af te sluiten maand hoort, plus de correcties op eerder
 * afgesloten maanden.
 */
export async function berekenMaand(db, seizoen, maand) {
  const bereik = maandBereik(maand);
  if (!bereik) return { fout: 'ongeldige maand, gebruik jjjj-mm' };

  // Werk in de maand zelf. Een wedstrijd die niet meer bij de bond staat,
  // telt niet vanzelf mee — er is misschien niet gefloten — maar wordt getoond.
  const r = await db
    .prepare(
      `SELECT a.persoon_id, m.id AS wedstrijd_id, m.wedstrijd_guid, m.datum, m.bij_bond, m.thuis_naam, m.uit_naam,
              m.cat_code, m.forfait, p.voornaam, p.achternaam, c.label AS cat_label, c.tarief_cent
         FROM officials_aanduidingen a
         JOIN ${OFFICIALS_WEDSTRIJD} m ON m.id = a.wedstrijd_id
         JOIN personen p ON p.id = a.persoon_id
         LEFT JOIN officials_categorieen c ON c.code = m.cat_code
        WHERE a.status = 'toegewezen' AND m.seizoen = ? AND m.datum BETWEEN ? AND ?
        ORDER BY m.datum, p.achternaam`
    )
    .bind(seizoen, bereik.van, bereik.tot)
    .all();

  const teVergoeden = [];
  const zonderTarief = [];
  const verdwenen = [];
  for (const x of r.results ?? []) {
    const naam = naamVan(x);
    const omschrijving = `${x.datum} ${x.thuis_naam} - ${x.uit_naam ?? '?'}`;
    if (x.tarief_cent === null || x.tarief_cent === undefined) {
      // Op nul zetten zou stil verkeerd zijn; melden en de afsluiting
      // tegenhouden is eerlijker.
      zonderTarief.push({ naam, omschrijving, catCode: x.cat_code ?? '(geen)' });
      continue;
    }
    if (!x.bij_bond) {
      verdwenen.push({ naam, omschrijving, persoonId: x.persoon_id, wedstrijdGuid: x.wedstrijd_guid });
      continue;
    }
    teVergoeden.push({
      // Het id om 'weg' te kunnen zeggen bij het nakijken: dat is vrijgeven.
      wedstrijdId: x.wedstrijd_id, wedstrijdGuid: x.wedstrijd_guid, persoonId: x.persoon_id, naam, catCode: x.cat_code, catLabel: x.cat_label,
      tariefCent: x.tarief_cent, datum: x.datum, thuisNaam: x.thuis_naam, uitNaam: x.uit_naam, forfait: x.forfait,
    });
  }

  // Correcties: wat er al verwerkt is in andere maanden, naast wat er nu hoort.
  const e = await db
    .prepare(
      `SELECT v.wedstrijd_guid, v.persoon_id, v.maand AS verwerkt_in, v.cat_code, v.tarief_cent, v.aantal AS verwerkt_aantal,
              m.datum, m.bij_bond, m.thuis_naam, m.uit_naam, a.status AS aanduiding_status,
              p.voornaam, p.achternaam, c.label AS cat_label
         FROM officials_vergoeding_verwerkt v
         LEFT JOIN ${OFFICIALS_WEDSTRIJD} m ON m.wedstrijd_guid = v.wedstrijd_guid
         LEFT JOIN officials_aanduidingen a ON a.wedstrijd_id = m.id AND a.persoon_id = v.persoon_id
         LEFT JOIN personen p ON p.id = v.persoon_id
         LEFT JOIN officials_categorieen c ON c.code = v.cat_code
        WHERE v.maand != ?`
    )
    .bind(maand)
    .all();

  const verwerkt = new Map();
  for (const x of e.results ?? []) {
    const s = `${x.wedstrijd_guid}|${x.persoon_id}`;
    const b = verwerkt.get(s) ?? { ...x, saldo: 0, betreftMaand: x.datum ? maandVan(x.datum) : x.verwerkt_in };
    b.saldo += x.verwerkt_aantal;
    verwerkt.set(s, b);
  }

  const correcties = [];
  for (const x of verwerkt.values()) {
    // Wat hoort het nu te zijn? Eén als de aanduiding nog staat en de
    // wedstrijd nog bij de bond, anders nul.
    const hoort = x.aanduiding_status === 'toegewezen' && x.bij_bond === 1 ? 1 : 0;
    const verschil = hoort - x.saldo;
    if (verschil === 0) continue;
    correcties.push({
      wedstrijdGuid: x.wedstrijd_guid, persoonId: x.persoon_id, naam: x.voornaam ? naamVan(x) : x.persoon_id,
      betreftMaand: x.betreftMaand, catCode: x.cat_code, catLabel: x.cat_label, tariefCent: x.tarief_cent,
      aantal: verschil, datum: x.datum, thuisNaam: x.thuis_naam, uitNaam: x.uit_naam,
    });
  }

  // Aanduidingen op een afgesloten maand die nog nooit verwerkt zijn: ook een
  // correctie, maar dan positief.
  const afgesloten = new Set(
    ((await db.prepare(`SELECT maand FROM officials_maanden`).all()).results ?? []).map((x) => x.maand)
  );
  if (afgesloten.size) {
    const n = await db
      .prepare(
        `SELECT a.persoon_id, m.wedstrijd_guid, m.datum, m.cat_code, m.thuis_naam, m.uit_naam,
                p.voornaam, p.achternaam, c.label AS cat_label, c.tarief_cent
           FROM officials_aanduidingen a
           JOIN ${OFFICIALS_WEDSTRIJD} m ON m.id = a.wedstrijd_id
           JOIN personen p ON p.id = a.persoon_id
           LEFT JOIN officials_categorieen c ON c.code = m.cat_code
          WHERE a.status = 'toegewezen' AND m.bij_bond = 1 AND m.seizoen = ? AND m.datum < ?`
      )
      .bind(seizoen, bereik.van)
      .all();
    for (const x of n.results ?? []) {
      const maandVanWedstrijd = maandVan(x.datum);
      if (!afgesloten.has(maandVanWedstrijd)) continue;
      if (verwerkt.has(`${x.wedstrijd_guid}|${x.persoon_id}`)) continue;
      if (x.tarief_cent === null) continue;
      correcties.push({
        wedstrijdGuid: x.wedstrijd_guid, persoonId: x.persoon_id, naam: naamVan(x), betreftMaand: maandVanWedstrijd,
        catCode: x.cat_code, catLabel: x.cat_label, tariefCent: x.tarief_cent, aantal: 1,
        datum: x.datum, thuisNaam: x.thuis_naam, uitNaam: x.uit_naam,
      });
    }
  }

  const regels = bouwRegels(teVergoeden, correcties);
  return {
    maand,
    seizoen,
    regels,
    officials: perOfficial(regels),
    wedstrijden: wedstrijdenPerOfficial([
      ...teVergoeden.map((w) => ({ ...w, soort: 'wedstrijd', aantal: 1 })),
      ...correcties.map((c) => ({ ...c, soort: 'correctie' })),
    ]),
    teVergoeden,
    correcties,
    zonderTarief,
    verdwenen,
    totaalCent: regels.reduce((s, x) => s + x.bedragCent, 0),
  };
}

const metBedragen = (o, wedstrijden) => ({
  ...o,
  totaal: alsBedrag(o.totaalCent),
  regels: o.regels.map((x) => ({ ...x, bedrag: alsBedrag(x.bedragCent) })),
  wedstrijden: wedstrijden.get(o.persoonId) ?? [],
});

async function ontvangers(db) {
  return String(await instellingLezen(db, 'facturatie_ontvangers', ''))
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** GET /api/admin/officials/facturatie — wat er afgesloten is, en wat er klaarstaat. */
export async function facturatieOverzicht(ctx) {
  const { db, seizoen } = ctx;
  const a = await db
    .prepare(
      `SELECT maand, afgesloten_op, afgesloten_door, totaal_cent, aantal_officials, verstuurd_op, verstuurd_naar
         FROM officials_maanden ORDER BY maand DESC`
    )
    .all();
  const afgesloten = a.results ?? [];
  const m = await db
    .prepare(
      `SELECT substr(m.datum, 1, 7) AS maand, COUNT(*) AS aanduidingen
         FROM officials_aanduidingen a JOIN ${OFFICIALS_WEDSTRIJD} m ON m.id = a.wedstrijd_id
        WHERE a.status = 'toegewezen' AND m.seizoen = ?
        GROUP BY maand ORDER BY maand`
    )
    .bind(seizoen.code)
    .all();
  const dicht = new Set(afgesloten.map((x) => x.maand));
  return json({
    seizoen: seizoen.code,
    ontvangers: (await ontvangers(db)).join(', '),
    afgesloten: afgesloten.map((x) => ({ ...x, totaal: alsBedrag(x.totaal_cent) })),
    open: (m.results ?? []).filter((x) => !dicht.has(x.maand)).map((x) => ({ ...x, ...magAfsluiten(x.maand, vandaag()) })),
  });
}

/** GET /api/admin/officials/facturatie/voorbeeld?maand=jjjj-mm — de droogloop. */
export async function facturatieVoorbeeld(ctx) {
  const { db, seizoen } = ctx;
  const maand = new URL(ctx.request.url).searchParams.get('maand');
  if (await db.prepare(`SELECT 1 FROM officials_maanden WHERE maand = ?`).bind(maand).first()) {
    return fout(409, `${maand} is al afgesloten`);
  }
  const b = await berekenMaand(db, seizoen.code, maand);
  if (b.fout) return fout(400, b.fout);
  return json({
    maand,
    aantal_officials: b.officials.length,
    totaal_cent: b.totaalCent,
    totaal: alsBedrag(b.totaalCent),
    officials: b.officials.map((o) => metBedragen(o, b.wedstrijden)),
    zonder_tarief: b.zonderTarief,
    verdwenen: b.verdwenen,
    aantal_correcties: b.correcties.length,
    kan_afsluiten: b.zonderTarief.length === 0 && magAfsluiten(maand, vandaag()).mag,
  });
}

/** POST /api/admin/officials/facturatie/afsluiten  { maand, versturen? } */
export async function facturatieAfsluiten(ctx) {
  const { db, seizoen, persoon } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const maand = body.maand;
  const mag = magAfsluiten(maand, vandaag());
  if (!mag.mag) return fout(409, mag.reden);
  if (await db.prepare(`SELECT 1 FROM officials_maanden WHERE maand = ?`).bind(maand).first()) {
    return fout(409, `${maand} is al afgesloten`);
  }

  const b = await berekenMaand(db, seizoen.code, maand);
  if (b.fout) return fout(400, b.fout);
  if (b.zonderTarief.length) {
    return fout(
      409,
      `${b.zonderTarief.length} aanduiding(en) staan op een categorie zonder tarief ` +
        `(${[...new Set(b.zonderTarief.map((z) => z.catCode))].join(', ')}); vul eerst een tarief in of geef ze vrij`
    );
  }

  const opdrachten = [
    db
      .prepare(`INSERT INTO officials_maanden (maand, seizoen, afgesloten_door, totaal_cent, aantal_officials) VALUES (?, ?, ?, ?, ?)`)
      .bind(maand, seizoen.code, persoon.id, b.totaalCent, b.officials.length),
  ];
  for (const x of b.regels) {
    opdrachten.push(
      db
        .prepare(
          `INSERT INTO officials_vergoeding_regels
             (maand, persoon_id, naam, soort, betreft_maand, cat_code, cat_label, aantal, tarief_cent, bedrag_cent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(maand, x.persoonId, x.naam, x.soort, x.betreftMaand, x.catCode, x.catLabel, x.aantal, x.tariefCent, x.bedragCent)
    );
  }
  // Het spoor: ook de correcties zelf, anders duikt dezelfde rechtzetting
  // elke maand opnieuw op.
  for (const w of b.teVergoeden) {
    opdrachten.push(
      db
        .prepare(
          `INSERT INTO officials_vergoeding_verwerkt (wedstrijd_guid, persoon_id, maand, cat_code, tarief_cent, aantal)
           VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT (wedstrijd_guid, persoon_id, maand) DO NOTHING`
        )
        .bind(w.wedstrijdGuid, w.persoonId, maand, w.catCode, w.tariefCent)
    );
  }
  for (const c of b.correcties) {
    opdrachten.push(
      db
        .prepare(
          `INSERT INTO officials_vergoeding_verwerkt (wedstrijd_guid, persoon_id, maand, cat_code, tarief_cent, aantal)
           VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (wedstrijd_guid, persoon_id, maand) DO UPDATE SET aantal = excluded.aantal`
        )
        .bind(c.wedstrijdGuid, c.persoonId, maand, c.catCode, c.tariefCent, c.aantal)
    );
  }
  await db.batch(opdrachten);

  await logSchrijf(db, {
    soort: 'officials',
    wie: persoon.id,
    wat: `vergoedingen ${maand} afgesloten`,
    details: `${b.officials.length} officials, ${alsBedrag(b.totaalCent)}` + (b.correcties.length ? `, ${b.correcties.length} correctie(s)` : ''),
  });

  const verzending = body.versturen === false ? null : await verstuurOverzichten(ctx, maand, b);
  return json({
    maand,
    aantal_officials: b.officials.length,
    totaal_cent: b.totaalCent,
    totaal: alsBedrag(b.totaalCent),
    aantal_correcties: b.correcties.length,
    verzending,
  });
}

/** Elke official zijn eigen overzicht, plus de verzamelstaat naar de ontvangers. */
async function verstuurOverzichten(ctx, maand, b) {
  const { db } = ctx;
  for (const o of b.officials) {
    const regels = o.regels
      .map((x) => {
        const wat = x.soort === 'correctie'
          ? `correctie ${x.betreftMaand}: ${x.aantal > 0 ? '+' : ''}${x.aantal} × ${x.catLabel ?? x.catCode}`
          : `${x.aantal} × ${x.catLabel ?? x.catCode}`;
        return `  ${wat} — ${alsBedrag(x.bedragCent)}`;
      })
      .join('\n');
    // De wedstrijden zelf erbij: wie '2 × U12' leest, wil kunnen nagaan welke
    // twee dat waren zonder de app te openen.
    const lijst = (b.wedstrijden.get(o.persoonId) ?? []).map((w) => `  ${wedstrijdRegel(w)}`).join('\n');
    await verwittig(ctx, {
      persoon_id: o.persoonId,
      soort: 'vergoeding',
      onderwerp: `Je vergoeding voor ${maand}`,
      kort: `${maand}: ${alsBedrag(o.totaalCent)}`,
      inhoud:
        `Hallo ${o.naam.split(' ')[0]},\n\nOverzicht van je vergoeding voor ${maand}:\n\n${regels}\n\n` +
        `Totaal: ${alsBedrag(o.totaalCent)}\n\n` +
        (lijst ? `Wedstrijden:\n${lijst}\n\n` : '') +
        'Je vindt dit ook terug in de app bij Mijn vergoeding.',
    }).catch(() => null);
  }

  const naar = await ontvangers(db);
  if (naar.length) {
    const lijst = b.officials.map((o) => `${o.naam}: ${o.aantalWedstrijden} × — ${alsBedrag(o.totaalCent)}`).join('\n');
    await verwittigExtern(ctx, naar, {
      onderwerp: `Verzamelstaat vergoedingen ${maand}`,
      inhoud:
        `Vergoedingen voor ${maand}, ${b.officials.length} officials:\n\n${lijst}\n\nTotaal: ${alsBedrag(b.totaalCent)}` +
        (b.correcties.length ? `\n\nBevat ${b.correcties.length} correctie(s) op eerdere maanden.` : ''),
    });
  }

  await db
    .prepare(`UPDATE officials_maanden SET verstuurd_op = ?, verstuurd_naar = ? WHERE maand = ?`)
    .bind(new Date().toISOString(), naar.join(', ') || null, maand)
    .run();
  return { officials: b.officials.length, ontvangers: naar.length };
}

/** De bewaarde detailregels van afgesloten maanden, uit het spoor — nooit uit de huidige aanduidingen. */
async function verwerktDetail(db, { maand = null, persoonId = null }) {
  const r = await db
    .prepare(
      `SELECT v.maand, v.wedstrijd_guid, v.persoon_id, v.cat_code, v.aantal,
              m.datum, m.thuis_naam, m.uit_naam, m.forfait, c.label AS cat_label
         FROM officials_vergoeding_verwerkt v
         JOIN officials_maanden am ON am.maand = v.maand
         LEFT JOIN ${OFFICIALS_WEDSTRIJD} m ON m.wedstrijd_guid = v.wedstrijd_guid
         LEFT JOIN officials_categorieen c ON c.code = v.cat_code
        WHERE (?1 IS NULL OR v.maand = ?1) AND (?2 IS NULL OR v.persoon_id = ?2)`
    )
    .bind(maand, persoonId)
    .all();
  return verwerktAlsItems(r.results ?? []);
}

/** GET /api/admin/officials/facturatie/staat?maand= — een bewaarde verzamelstaat. */
export async function facturatieStaat(ctx) {
  const { db } = ctx;
  const maand = new URL(ctx.request.url).searchParams.get('maand');
  const kop = await db
    .prepare(
      `SELECT m.*, trim(coalesce(p.voornaam, '') || ' ' || coalesce(p.achternaam, '')) AS afgesloten_door_naam
         FROM officials_maanden m LEFT JOIN personen p ON p.id = m.afgesloten_door WHERE m.maand = ?`
    )
    .bind(maand)
    .first();
  if (!kop) return fout(404, `${maand} is niet afgesloten`);
  const r = await db
    .prepare(`SELECT * FROM officials_vergoeding_regels WHERE maand = ? ORDER BY naam, soort DESC, betreft_maand, cat_code`)
    .bind(maand)
    .all();
  const wedstrijden = wedstrijdenPerOfficial(await verwerktDetail(db, { maand }));
  const officials = perOfficial(
    (r.results ?? []).map((x) => ({
      persoonId: x.persoon_id, naam: x.naam, soort: x.soort, betreftMaand: x.betreft_maand, catCode: x.cat_code,
      catLabel: x.cat_label, aantal: x.aantal, tariefCent: x.tarief_cent, bedragCent: x.bedrag_cent,
    }))
  );
  return json({ ...kop, totaal: alsBedrag(kop.totaal_cent), officials: officials.map((o) => metBedragen(o, wedstrijden)) });
}

/** POST /api/admin/officials/facturatie/ontvangers  { ontvangers } — wie de verzamelstaat krijgt. */
export async function ontvangersZetten(ctx) {
  const { db, persoon } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const adressen = String(body.ontvangers ?? '')
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const ongeldig = adressen.filter((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a));
  if (ongeldig.length) return fout(400, `controleer: ${ongeldig.join(', ')}`);
  await db
    .prepare(
      `INSERT INTO instellingen (sleutel, waarde) VALUES ('facturatie_ontvangers', ?)
       ON CONFLICT (sleutel) DO UPDATE SET waarde = excluded.waarde`
    )
    .bind(adressen.join(', '))
    .run();
  await logSchrijf(db, { soort: 'officials', wie: persoon.id, wat: 'ontvangers verzamelstaat', details: adressen.join(', ') || '(geen)' });
  return json({ ontvangers: adressen });
}

/** GET /api/admin/officials/facturatie/officials — per official, over alle afgesloten maanden. */
export async function facturatiePerOfficial(ctx) {
  const { db } = ctx;
  const r = await db
    .prepare(
      `SELECT persoon_id, naam, SUM(aantal) AS aantal, SUM(bedrag_cent) AS bedrag_cent,
              COUNT(DISTINCT maand) AS maanden, MAX(maand) AS laatste_maand
         FROM officials_vergoeding_regels GROUP BY persoon_id ORDER BY naam`
    )
    .all();
  const m = await db
    .prepare(
      `SELECT persoon_id, maand, SUM(bedrag_cent) AS bedrag_cent, SUM(aantal) AS aantal
         FROM officials_vergoeding_regels GROUP BY persoon_id, maand ORDER BY maand DESC`
    )
    .all();
  const per = new Map();
  for (const x of m.results ?? []) {
    per.set(x.persoon_id, [...(per.get(x.persoon_id) ?? []), { maand: x.maand, aantal: x.aantal, bedrag_cent: x.bedrag_cent, bedrag: alsBedrag(x.bedrag_cent) }]);
  }
  const rijen = r.results ?? [];
  const totaal = rijen.reduce((s, x) => s + x.bedrag_cent, 0);
  return json({
    officials: rijen.map((x) => ({ ...x, bedrag: alsBedrag(x.bedrag_cent), per_maand: per.get(x.persoon_id) ?? [] })),
    totaal_cent: totaal,
    totaal: alsBedrag(totaal),
  });
}

/** GET /api/admin/officials/tarieven — de categorieën met hun tarief. */
export async function tarievenTonen(ctx) {
  const r = await ctx.db.prepare(`SELECT code, label, groep, tarief_cent FROM officials_categorieen ORDER BY volgorde, code`).all();
  return json({ tarieven: (r.results ?? []).map((x) => ({ ...x, tarief: alsBedrag(x.tarief_cent) })) });
}

/**
 * POST /api/admin/officials/tarieven  { code, tarief_cent }
 *
 * Een nieuw tarief geldt voor wat nog niet afgesloten is. Een afgesloten maand
 * ligt vast, en ook een correctie rekent met het tarief van toen (het staat
 * in het spoor), niet met het nieuwe.
 */
export async function tariefZetten(ctx) {
  const { db, persoon } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const cent = Number(body.tarief_cent);
  if (!Number.isInteger(cent) || cent < 0 || cent > 100000) return fout(400, 'tarief_cent moet een geheel aantal cent zijn');
  const oud = await db.prepare(`SELECT tarief_cent FROM officials_categorieen WHERE code = ?`).bind(body.code).first();
  if (!oud) return fout(404, 'onbekende categorie');
  await db.prepare(`UPDATE officials_categorieen SET tarief_cent = ? WHERE code = ?`).bind(cent, body.code).run();
  await logSchrijf(db, {
    soort: 'officials',
    wie: persoon.id,
    wat: `tarief ${body.code} gewijzigd`,
    details: `${alsBedrag(oud.tarief_cent)} → ${alsBedrag(cent)}`,
  });
  return json({ code: body.code, tarief_cent: cent });
}

/**
 * GET /api/officials/vergoeding[?namens=] — Mijn vergoeding.
 *
 * Recentste maand bovenaan. De lopende maand staat er ook bij, met de
 * vermelding dat er nog niets vastligt: zonder die regel komt de vraag 'ik heb
 * vorige week gefloten, waarom staat er niets' bij de beheerder terecht. Een
 * ouder ziet die van zijn kind (namens), zoals hij er ook voor invult.
 */
export async function mijnVergoeding(ctx) {
  const { db, seizoen } = ctx;
  const wie = await voorWie(ctx, new URL(ctx.request.url).searchParams.get('namens'));
  if (wie.fout) return wie.fout;

  const r = await db
    .prepare(
      `SELECT r.*, a.afgesloten_op FROM officials_vergoeding_regels r
         JOIN officials_maanden a ON a.maand = r.maand
        WHERE r.persoon_id = ?
        ORDER BY r.maand DESC, r.soort DESC, r.betreft_maand, r.cat_code`
    )
    .bind(wie.id)
    .all();
  const perMaand = new Map();
  for (const x of r.results ?? []) {
    const m = perMaand.get(x.maand) ?? { maand: x.maand, afgesloten_op: x.afgesloten_op, afgesloten: true, regels: [], totaalCent: 0, aantal: 0 };
    m.regels.push({
      soort: x.soort, betreft_maand: x.betreft_maand, cat_code: x.cat_code, cat_label: x.cat_label, aantal: x.aantal,
      tarief_cent: x.tarief_cent, bedrag_cent: x.bedrag_cent, bedrag: alsBedrag(x.bedrag_cent),
    });
    m.totaalCent += x.bedrag_cent;
    m.aantal += x.aantal;
    perMaand.set(x.maand, m);
  }

  const detail = new Map();
  for (const item of await verwerktDetail(db, { persoonId: wie.id })) {
    detail.set(item.maand, [...(detail.get(item.maand) ?? []), item]);
  }

  // De lopende maand, en eerdere die nog niet afgesloten zijn.
  const dicht = new Set(((await db.prepare(`SELECT maand FROM officials_maanden`).all()).results ?? []).map((x) => x.maand));
  const l = await db
    .prepare(
      `SELECT m.wedstrijd_guid, m.datum, m.thuis_naam, m.uit_naam, m.cat_code, m.forfait, c.label AS cat_label, c.tarief_cent
         FROM officials_aanduidingen a
         JOIN ${OFFICIALS_WEDSTRIJD} m ON m.id = a.wedstrijd_id
         LEFT JOIN officials_categorieen c ON c.code = m.cat_code
        WHERE a.status = 'toegewezen' AND a.persoon_id = ? AND m.bij_bond = 1 AND m.seizoen = ? AND m.datum <= ?
        ORDER BY m.datum`
    )
    .bind(wie.id, seizoen.code, vandaag())
    .all();
  const nogNiet = new Map();
  for (const x of l.results ?? []) {
    const maand = maandVan(x.datum);
    if (dicht.has(maand) || x.tarief_cent === null || x.tarief_cent === undefined) continue;
    const m = nogNiet.get(maand) ?? { maand, afgesloten: false, regels: new Map(), totaalCent: 0, aantal: 0 };
    const regel = m.regels.get(x.cat_code) ?? {
      soort: 'wedstrijd', betreft_maand: null, cat_code: x.cat_code, cat_label: x.cat_label, aantal: 0, tarief_cent: x.tarief_cent, bedrag_cent: 0,
    };
    regel.aantal += 1;
    regel.bedrag_cent += x.tarief_cent;
    m.regels.set(x.cat_code, regel);
    m.totaalCent += x.tarief_cent;
    m.aantal += 1;
    nogNiet.set(maand, m);
    detail.set(maand, [...(detail.get(maand) ?? []), {
      persoonId: wie.id, wedstrijdGuid: x.wedstrijd_guid, datum: x.datum, thuisNaam: x.thuis_naam, uitNaam: x.uit_naam,
      catCode: x.cat_code, catLabel: x.cat_label, soort: 'wedstrijd', aantal: 1, forfait: x.forfait,
    }]);
  }

  const wedstrijden = (maand) => wedstrijdenPerOfficial(detail.get(maand) ?? []).get(wie.id) ?? [];
  const maanden = [
    ...[...nogNiet.values()].map((m) => ({
      ...m, regels: [...m.regels.values()].map((x) => ({ ...x, bedrag: alsBedrag(x.bedrag_cent) })),
    })),
    ...perMaand.values(),
  ]
    .map(({ totaalCent, ...m }) => ({ ...m, totaal_cent: totaalCent, totaal: alsBedrag(totaalCent), wedstrijden: wedstrijden(m.maand) }))
    .sort((a, b) => b.maand.localeCompare(a.maand));

  // Enkel wat vastligt telt mee in het seizoenstotaal; de lopende maand kan
  // nog wijzigen en zou het cijfer misleidend maken.
  const seizoenTotaal = [...perMaand.values()].reduce((s, m) => s + m.totaalCent, 0);
  return json({
    seizoen: seizoen.code,
    namens: wie.namens,
    maanden,
    seizoen_totaal_cent: seizoenTotaal,
    seizoen_totaal: alsBedrag(seizoenTotaal),
    aantal_afgesloten: perMaand.size,
  });
}
