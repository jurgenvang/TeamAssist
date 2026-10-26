// De kern van de module Officials (0.33.0, uit YOAssist `gebruiker.js` en
// `admin/aanduiding.js`): wat een official ziet en opgeeft, en wat een
// beheerder aanduidt.
//
// Wie handelt, komt uit het token. Een ouder kan namens zijn kind handelen
// (`namens`), met de rechten van het kind — nooit met meer; dat het zijn kind
// is, komt uit ouder_kind (namens.js). De rechten zelf komen uit rechten.js:
// officials.opgeven (YO, YO+), officials.vanaf_u14 (YO+), officials.beheren
// (YOADM, ADMIN).

import { json, fout, leesJson } from '../lib/http.js';
import { logSchrijf } from '../lib/logboek.js';
import { verwittig } from '../lib/verwittigen.js';
import { rechtenVoor } from '../lib/rechten-db.js';
import { magNamens } from '../lib/namens.js';
import { aantalNodig, conflicten, opkomstUur } from './regels.js';
import { beheerders } from './ontvangers.js';

const vandaag = () => new Date().toISOString().slice(0, 10);

export function wedstrijdbladUrl(guid) {
  return `https://vblweb.wisseq.eu/Home/MatchDetail?wedguid=${encodeURIComponent(guid)}`;
}

/**
 * Voor wie wordt er gehandeld, en wat mag die? Zonder `namens` de aangemelde
 * persoon zelf, met zijn rechten uit het verzoek (een beheerder die 'kijkt
 * als YO' ziet dus wat een YO ziet). Met `namens` het kind, met zijn eigen
 * rechten.
 */
async function voorWie(ctx, namens) {
  const { db, persoon, rechten, seizoen } = ctx;
  if (!namens || namens === persoon.id) return { id: persoon.id, rechten, namens: null };
  if (!(await magNamens(db, persoon.id, namens))) return { fout: fout(403, 'je mag niet namens deze persoon handelen') };
  const kind = await db.prepare(`SELECT id, voornaam, achternaam FROM personen WHERE id = ? AND actief = 1`).bind(namens).first();
  if (!kind) return { fout: fout(404, 'die persoon bestaat niet') };
  return {
    id: kind.id,
    rechten: await rechtenVoor(db, kind.id, seizoen.code),
    namens: { id: kind.id, naam: `${kind.voornaam} ${kind.achternaam}`.trim() },
  };
}

/** De gedeelde voorwaarde: in het seizoen, bij de bond, in de lijst, ploeg met officials. */
const IN_LIJST = `w.seizoen = ?1 AND w.bij_bond = 1 AND o.scope = 1 AND t.officials = 1`;
const BASIS = `FROM wedstrijden w
  JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
  JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
  LEFT JOIN officials_categorieen c ON c.code = o.cat_code`;

/** GET /api/officials/wedstrijden[?namens=] — de lijst van een official, vanaf vandaag. */
export async function officialsWedstrijden(ctx) {
  const { db, request, seizoen } = ctx;
  const wie = await voorWie(ctx, new URL(request.url).searchParams.get('namens'));
  if (wie.fout) return wie.fout;
  if (!wie.rechten.mag('officials.opgeven')) return fout(403, 'geen Youth Official');

  // Een YO ziet enkel U10/U12; een YO+ alles wat in de lijst staat — ook wat
  // een beheerder of de woensdagregel erbij zette.
  const vanafU14 = wie.rechten.mag('officials.vanaf_u14');
  const r = await db
    .prepare(
      `SELECT w.id, w.wedstrijd_guid, w.datum, w.begin, w.tegenstander, w.locatie_tekst, w.uitslag,
              t.naam AS ploeg, o.cat_code, o.poule_naam, o.off_namen, o.off_aantal, o.off_gewist,
              o.bond_officials, o.forfait, o.scope_reden, c.label AS cat_label, c.groep AS cat_groep,
              b.status AS beschikbaarheid, a.status AS aanduiding
         ${BASIS}
         LEFT JOIN officials_beschikbaarheid b ON b.wedstrijd_id = w.id AND b.persoon_id = ?2
         LEFT JOIN officials_aanduidingen a ON a.wedstrijd_id = w.id AND a.persoon_id = ?2
        WHERE ${IN_LIJST} AND w.datum >= ?3 ${vanafU14 ? '' : "AND c.groep = 'U10U12'"}
        ORDER BY w.datum, w.begin, t.naam`
    )
    .bind(seizoen.code, wie.id, vandaag())
    .all();
  const lijst = r.results ?? [];

  // Wie er van de club op staat, in één query in plaats van per wedstrijd —
  // en niet met een IN-lijst van id's (D1: honderd parameters).
  const opWedstrijd = new Map();
  if (lijst.length) {
    const a = await db
      .prepare(
        `SELECT a.wedstrijd_id, p.id, p.voornaam, p.achternaam, p.tel_gsm, coalesce(v.gsm_delen, 1) AS gsm_delen
           FROM officials_aanduidingen a
           JOIN personen p ON p.id = a.persoon_id
           JOIN wedstrijden w ON w.id = a.wedstrijd_id
           LEFT JOIN officials_voorkeuren v ON v.persoon_id = p.id
          WHERE a.status = 'toegewezen' AND w.seizoen = ?1 AND w.datum >= ?2
          ORDER BY a.toegewezen_op`
      )
      .bind(seizoen.code, vandaag())
      .all();
    const rijen = a.results ?? [];
    // Het nummer van een collega enkel bij een wedstrijd waar je samen op
    // staat, en enkel als hij het deelt.
    const ikSta = new Set(rijen.filter((x) => x.id === wie.id).map((x) => x.wedstrijd_id));
    for (const x of rijen) {
      const ikZelf = x.id === wie.id;
      const nummer = !ikZelf && ikSta.has(x.wedstrijd_id) && x.gsm_delen === 1 ? x.tel_gsm || null : null;
      opWedstrijd.set(x.wedstrijd_id, [
        ...(opWedstrijd.get(x.wedstrijd_id) ?? []),
        { naam: `${x.voornaam} ${x.achternaam}`.trim(), ik_zelf: ikZelf, gsm: nummer, gsm_ontbreekt: ikZelf && !x.tel_gsm },
      ]);
    }
  }

  return json({
    namens: wie.namens,
    vanaf_u14: vanafU14,
    wedstrijden: lijst.map((w) => {
      let vblRefs = [];
      try {
        vblRefs = w.off_namen ? JSON.parse(w.off_namen) : [];
      } catch {
        vblRefs = [];
      }
      const club = opWedstrijd.get(w.id) ?? [];
      return {
        id: w.id,
        datum: w.datum,
        uur: w.begin,
        ploeg: w.ploeg,
        tegenstander: w.tegenstander,
        locatie: w.locatie_tekst,
        poule: w.poule_naam,
        cat_code: w.cat_code,
        cat_label: w.cat_label,
        cat_groep: w.cat_groep,
        wedstrijdblad: wedstrijdbladUrl(w.wedstrijd_guid),
        beschikbaarheid: w.beschikbaarheid ?? null,
        // Aangeduid: de beschikbaarheid ligt vast, enkel een probleem melden kan nog.
        toegewezen: w.aanduiding === 'toegewezen',
        nodig: aantalNodig(w.off_aantal, { bondOfficials: w.bond_officials, forfait: w.forfait }),
        bezet: club.length,
        opkomst: opkomstUur(w.begin),
        uitslag: w.uitslag ?? null,
        forfait: w.forfait ?? null,
        vbl_refs: vblRefs,
        vbl_aantal: w.off_aantal,
        vbl_namen_gewist: w.off_gewist === 1,
        club_refs: club,
      };
    }),
  });
}

/** Staat deze wedstrijd in de lijst van deze official? Zo niet: null. */
async function wedstrijdVoor(db, seizoen, id, vanafU14) {
  return db
    .prepare(
      `SELECT w.id, w.wedstrijd_guid, w.datum, w.begin, w.vbl_acc_guid, w.tegenstander, w.locatie_tekst,
              t.naam AS ploeg, o.forfait, o.off_aantal, o.bond_officials, c.groep AS cat_groep
         ${BASIS}
        WHERE ${IN_LIJST} AND w.id = ?2 ${vanafU14 ? '' : "AND c.groep = 'U10U12'"}`
    )
    .bind(seizoen, id)
    .first();
}

/** POST /api/officials/beschikbaarheid  { wedstrijd_id, status: 'ja'|'nee'|null, namens? } */
export async function beschikbaarheidZetten(ctx) {
  const { db, seizoen } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const id = Number(body.wedstrijd_id);
  if (!Number.isInteger(id)) return fout(400, 'wedstrijd_id ontbreekt');
  if (!['ja', 'nee', null].includes(body.status)) return fout(400, "status moet 'ja', 'nee' of null zijn");

  const wie = await voorWie(ctx, body.namens);
  if (wie.fout) return wie.fout;
  if (!wie.rechten.mag('officials.opgeven')) return fout(403, 'geen Youth Official');

  const w = await wedstrijdVoor(db, seizoen.code, id, wie.rechten.mag('officials.vanaf_u14'));
  if (!w) return fout(404, 'deze wedstrijd staat niet in jouw lijst');
  // Wissen mag nog (dat ruimt enkel op); iets nieuws invullen heeft geen zin
  // voor een wedstrijd die niet doorgaat, of die al voorbij is.
  if (body.status !== null && w.forfait) return fout(409, 'deze wedstrijd gaat niet door: er is forfait gegeven');
  if (body.status !== null && w.datum < vandaag()) return fout(409, 'deze wedstrijd is al voorbij');

  // Eens aangeduid, ligt de beschikbaarheid vast: wie niet kan, meldt een
  // probleem en de beheerder beslist.
  const aangeduid = await db
    .prepare(`SELECT 1 AS ja FROM officials_aanduidingen WHERE wedstrijd_id = ? AND persoon_id = ? AND status = 'toegewezen'`)
    .bind(id, wie.id)
    .first();
  if (aangeduid) return fout(409, 'je bent aangeduid voor deze wedstrijd; meld een probleem als het niet lukt');

  if (body.status === null) {
    await db.prepare(`DELETE FROM officials_beschikbaarheid WHERE persoon_id = ? AND wedstrijd_id = ?`).bind(wie.id, id).run();
  } else {
    await db
      .prepare(
        `INSERT INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status, gewijzigd)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT (persoon_id, wedstrijd_id) DO UPDATE SET status = excluded.status, gewijzigd = datetime('now')`
      )
      .bind(wie.id, id, body.status)
      .run();
  }
  return json({ wedstrijd_id: id, status: body.status, namens: wie.namens });
}

const omschrijving = (w) => `${w.ploeg} — ${w.tegenstander ?? '?'} (${w.datum} om ${w.begin})`;

/**
 * POST /api/officials/probleem  { wedstrijd_id, bericht, namens? }
 *
 * De uitweg voor wie aangeduid is maar niet kan. Zelf vrijgeven kan niet —
 * dat zou de beheerder voor verrassingen zetten — melden wel.
 */
export async function probleemMelden(ctx) {
  const { db } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const id = Number(body.wedstrijd_id);
  const bericht = String(body.bericht ?? '').trim();
  if (!Number.isInteger(id)) return fout(400, 'wedstrijd_id ontbreekt');
  if (bericht.length < 3) return fout(400, 'schrijf kort waarom het niet lukt');
  if (bericht.length > 1000) return fout(400, 'hou het bij duizend tekens');

  const wie = await voorWie(ctx, body.namens);
  if (wie.fout) return wie.fout;

  const a = await db
    .prepare(
      `SELECT a.status, w.datum, w.begin, w.tegenstander, t.naam AS ploeg, p.voornaam, p.achternaam
         FROM officials_aanduidingen a
         JOIN wedstrijden w ON w.id = a.wedstrijd_id
         JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
         JOIN personen p ON p.id = a.persoon_id
        WHERE a.wedstrijd_id = ? AND a.persoon_id = ? AND a.status = 'toegewezen'`
    )
    .bind(id, wie.id)
    .first();
  if (!a) return fout(404, 'je bent niet aangeduid voor deze wedstrijd');

  await db.prepare(`INSERT INTO officials_problemen (wedstrijd_id, persoon_id, bericht) VALUES (?, ?, ?)`).bind(id, wie.id, bericht).run();
  await logSchrijf(db, {
    soort: 'officials',
    wie: ctx.persoon.id,
    wat: `probleem gemeld: ${omschrijving(a)}`,
    details: `${a.voornaam} ${a.achternaam}${wie.namens ? ' (door een ouder)' : ''}: ${bericht.slice(0, 200)}`,
    afgehandeld: 0,
  });

  // Naar elke beheerder, niet naar één vast adres: wie er dat seizoen ook
  // beheert, moet dit zien.
  const naam = `${a.voornaam} ${a.achternaam}`.trim();
  for (const b of await beheerders(db)) {
    await verwittig(ctx, {
      persoon_id: b,
      soort: 'officials',
      onderwerp: `Probleem gemeld: ${a.ploeg} — ${a.tegenstander ?? ''}`.trim(),
      kort: `${naam}: ${bericht.slice(0, 120)}`,
      inhoud: `${naam} meldt een probleem bij ${omschrijving(a)}:\n\n"${bericht}"`,
    });
  }
  return json({ gemeld: true });
}

// --- beheer (officials.beheren) ------------------------------------------------

async function rollenVanOfficial(db, persoonId) {
  const r = await db.prepare(`SELECT rol FROM rollen WHERE persoon_id = ? AND rol IN ('YO', 'YOPLUS')`).bind(persoonId).all();
  const rollen = new Set((r.results ?? []).map((x) => x.rol));
  return { official: rollen.size > 0, vanafU14: rollen.has('YOPLUS') };
}

async function wedstrijdVoorBeheer(db, id) {
  return db
    .prepare(
      `SELECT w.id, w.wedstrijd_guid, w.datum, w.begin, w.vbl_acc_guid, w.tegenstander, w.locatie_tekst, w.bij_bond,
              t.naam AS ploeg, o.scope, o.forfait, o.off_aantal, o.bond_officials, o.refs_bevestigd, c.groep AS cat_groep
         FROM wedstrijden w
         JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
         JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
         LEFT JOIN officials_categorieen c ON c.code = o.cat_code
        WHERE w.id = ?`
    )
    .bind(id)
    .first();
}

/** Andere aanduidingen van deze persoon rond die dag: de kandidaten voor een botsing. */
async function aanduidingenRond(db, persoonId, datum) {
  const r = await db
    .prepare(
      `SELECT w.id, w.datum, w.begin AS uur, w.vbl_acc_guid AS accGuid, w.tegenstander, t.naam AS ploeg
         FROM officials_aanduidingen a
         JOIN wedstrijden w ON w.id = a.wedstrijd_id
         JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
        WHERE a.persoon_id = ? AND a.status = 'toegewezen' AND w.bij_bond = 1
          AND w.datum BETWEEN date(?, '-1 day') AND date(?, '+1 day')`
    )
    .bind(persoonId, datum, datum)
    .all();
  return r.results ?? [];
}

/**
 * GET /api/admin/officials/kandidaten?wedstrijd_id= — wie in aanmerking komt,
 * met zijn antwoord en een eventuele botsing. Een YO enkel bij U10/U12.
 */
export async function kandidatenTonen(ctx) {
  const { db, request } = ctx;
  const id = Number(new URL(request.url).searchParams.get('wedstrijd_id'));
  const w = Number.isInteger(id) ? await wedstrijdVoorBeheer(db, id) : null;
  if (!w) return fout(404, 'onbekende wedstrijd');

  const r = await db
    .prepare(
      `SELECT p.id, p.voornaam, p.achternaam,
              max(CASE WHEN ro.rol = 'YOPLUS' THEN 1 ELSE 0 END) AS vanaf_u14,
              b.status AS beschikbaarheid, a.status AS aanduiding
         FROM rollen ro
         JOIN personen p ON p.id = ro.persoon_id
         LEFT JOIN officials_beschikbaarheid b ON b.persoon_id = p.id AND b.wedstrijd_id = ?1
         LEFT JOIN officials_aanduidingen a ON a.persoon_id = p.id AND a.wedstrijd_id = ?1
        WHERE ro.rol IN ('YO', 'YOPLUS') AND p.actief = 1
        GROUP BY p.id
        ORDER BY p.voornaam, p.achternaam`
    )
    .bind(id)
    .all();

  const kandidaten = [];
  for (const k of r.results ?? []) {
    if (!k.vanaf_u14 && w.cat_groep !== 'U10U12') continue;
    const botsingen = conflicten(
      { id, datum: w.datum, uur: w.begin, accGuid: w.vbl_acc_guid },
      await aanduidingenRond(db, k.id, w.datum)
    );
    kandidaten.push({
      id: k.id,
      naam: `${k.voornaam} ${k.achternaam}`.trim(),
      beschikbaarheid: k.beschikbaarheid ?? null,
      toegewezen: k.aanduiding === 'toegewezen',
      botsingen: botsingen.map((b) => `${b.datum} ${b.uur} ${b.ploeg}`),
    });
  }
  return json({
    wedstrijd: { id, nodig: aantalNodig(w.off_aantal, { bondOfficials: w.bond_officials, forfait: w.forfait }) },
    kandidaten,
  });
}

/**
 * POST /api/admin/officials/aanduiden  { wedstrijd_id, persoon_id, forceer? }
 *
 * Beschikbaarheid is geen voorwaarde: een beheerder duidt ook aan na een
 * telefoontje. Wie 'nee' antwoordde, of al ergens anders staat, enkel met
 * forceer. Op een voorbije wedstrijd is het een rechtzetting achteraf (V35):
 * geen bericht, wel in het logboek.
 */
export async function aanduiden(ctx) {
  const { db, persoon: beheerder } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const id = Number(body.wedstrijd_id);
  const persoonId = body.persoon_id;
  const forceer = body.forceer === true;
  if (!Number.isInteger(id) || !persoonId) return fout(400, 'wedstrijd_id en persoon_id zijn nodig');

  const w = await wedstrijdVoorBeheer(db, id);
  if (!w || !w.bij_bond) return fout(404, 'deze wedstrijd bestaat niet of staat niet meer bij de bond');
  if (!w.scope) return fout(409, 'zet deze wedstrijd eerst in de aanduidingslijst');
  if (w.forfait) return fout(409, 'deze wedstrijd gaat niet door: er is forfait gegeven');

  const official = await db.prepare(`SELECT id, voornaam, achternaam, actief FROM personen WHERE id = ?`).bind(persoonId).first();
  if (!official) return fout(404, 'die persoon bestaat niet');
  if (!official.actief) return fout(409, 'deze persoon staat op inactief');
  const rol = await rollenVanOfficial(db, persoonId);
  if (!rol.official) return fout(409, `${official.voornaam} is geen Youth Official (rol YO of YO+)`);
  // Een YO ziet enkel U10/U12: iemand aanduiden op een wedstrijd die hij
  // daarna niet terugvindt, is een garantie op verwarring.
  if (!rol.vanafU14 && w.cat_groep !== 'U10U12') {
    return fout(409, `${official.voornaam} is YO en ziet enkel U10/U12-wedstrijden`);
  }

  const al = await db.prepare(`SELECT status FROM officials_aanduidingen WHERE wedstrijd_id = ? AND persoon_id = ?`).bind(id, persoonId).first();
  if (al?.status === 'toegewezen') return fout(409, 'deze official staat al op deze wedstrijd');

  const bezet = await db.prepare(`SELECT count(*) AS n FROM officials_aanduidingen WHERE wedstrijd_id = ? AND status = 'toegewezen'`).bind(id).first('n');
  const nodig = aantalNodig(w.off_aantal, { bondOfficials: w.bond_officials });
  if (bezet >= nodig) {
    return fout(409, nodig === 0 ? 'de bond voorziet hier al twee scheidsrechters' : `er ${nodig === 1 ? 'is' : 'zijn'} maar ${nodig} plaats${nodig === 1 ? '' : 'en'}, en die ${nodig === 1 ? 'is' : 'zijn'} bezet`);
  }

  if (!forceer) {
    const antwoord = await db.prepare(`SELECT status FROM officials_beschikbaarheid WHERE wedstrijd_id = ? AND persoon_id = ?`).bind(id, persoonId).first('status');
    if (antwoord === 'nee') return fout(409, `${official.voornaam} zette zich niet beschikbaar; bevestig om toch aan te duiden`);
  }
  const botsingen = conflicten({ id, datum: w.datum, uur: w.begin, accGuid: w.vbl_acc_guid }, await aanduidingenRond(db, persoonId, w.datum));
  if (botsingen.length && !forceer) {
    return fout(409, `${official.voornaam} staat al op ${botsingen.map((b) => `${b.datum} ${b.uur} ${b.ploeg}`).join(' en ')}; bevestig om toch aan te duiden`);
  }

  await db
    .prepare(
      `INSERT INTO officials_aanduidingen (wedstrijd_id, persoon_id, status, toegewezen_door, toegewezen_op, gewijzigd_op)
       VALUES (?, ?, 'toegewezen', ?, datetime('now'), datetime('now'))
       ON CONFLICT (wedstrijd_id, persoon_id) DO UPDATE
         SET status = 'toegewezen', toegewezen_door = excluded.toegewezen_door, gewijzigd_op = datetime('now')`
    )
    .bind(id, persoonId, beheerder.id)
    .run();

  const naam = `${official.voornaam} ${official.achternaam}`.trim();
  await logSchrijf(db, {
    soort: 'officials',
    wie: beheerder.id,
    wat: `aangeduid: ${omschrijving(w)}`,
    details: naam + (forceer && botsingen.length ? ' (bevestigd ondanks een botsing)' : ''),
  });

  const voorbij = w.datum < vandaag();
  // Op een voorbije wedstrijd geen bericht: een rechtzetting achteraf.
  const verstuurd = voorbij ? false : await verwittigAanduiding(ctx, official, w);
  return json({ aangeduid: true, voorbij, verwittigd: verstuurd, botsingen: botsingen.map((b) => `${b.datum} ${b.uur} ${b.ploeg}`) });
}

/**
 * Het bericht bij een aanduiding: handmatig en automatisch hetzelfde. Een
 * bericht dat mislukt, laat de aanduiding niet mislukken.
 *
 * @param official  {id, voornaam}
 * @param w         {ploeg, tegenstander, datum, begin, locatie_tekst}
 */
export async function verwittigAanduiding(ctx, official, w) {
  const uit = await verwittig(ctx, {
    persoon_id: official.id,
    soort: 'aanduiding',
    onderwerp: `Aangeduid: ${w.ploeg} — ${w.tegenstander ?? ''}`.trim(),
    kort: `${w.datum} om ${w.begin}${w.locatie_tekst ? ` — ${w.locatie_tekst}` : ''}`,
    inhoud:
      `Hallo ${official.voornaam},\n\nJe bent aangeduid voor:\n\n${w.ploeg} — ${w.tegenstander ?? ''}\n` +
      `${w.datum} om ${w.begin}\n${w.locatie_tekst || 'locatie volgt nog'}\n\n` +
      `Aanwezig op het terrein om ${opkomstUur(w.begin) ?? w.begin}.\n\n` +
      'Kan je niet, meld dat dan in de app bij deze wedstrijd — niet door gewoon niet te komen opdagen.',
  }).catch(() => ({ verstuurd: false }));
  return Boolean(uit?.verstuurd);
}

/** POST /api/admin/officials/vrijgeven  { wedstrijd_id, persoon_id } — de rij blijft, voor de facturatie. */
export async function vrijgeven(ctx) {
  const { db, persoon: beheerder } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const id = Number(body.wedstrijd_id);
  if (!Number.isInteger(id) || !body.persoon_id) return fout(400, 'wedstrijd_id en persoon_id zijn nodig');

  const al = await db.prepare(`SELECT status FROM officials_aanduidingen WHERE wedstrijd_id = ? AND persoon_id = ?`).bind(id, body.persoon_id).first('status');
  if (!al) return fout(404, 'deze official staat niet op deze wedstrijd');
  if (al === 'vrijgegeven') return json({ vrijgegeven: true, al_vrijgegeven: true });

  await db
    .prepare(`UPDATE officials_aanduidingen SET status = 'vrijgegeven', gewijzigd_op = datetime('now') WHERE wedstrijd_id = ? AND persoon_id = ?`)
    .bind(id, body.persoon_id)
    .run();
  const w = await wedstrijdVoorBeheer(db, id);
  const p = await db.prepare(`SELECT voornaam, achternaam FROM personen WHERE id = ?`).bind(body.persoon_id).first();
  await logSchrijf(db, { soort: 'officials', wie: beheerder.id, wat: `vrijgegeven: ${omschrijving(w)}`, details: `${p?.voornaam ?? ''} ${p?.achternaam ?? ''}`.trim() });

  // Een vrijgave op een voorbije wedstrijd is een rechtzetting achteraf: geen bericht.
  const voorbij = w.datum < vandaag();
  if (!voorbij && p) {
    await verwittig(ctx, {
      persoon_id: body.persoon_id,
      soort: 'vrijgave',
      onderwerp: `Aanduiding vervallen: ${w.ploeg} — ${w.tegenstander ?? ''}`.trim(),
      kort: `${w.datum} om ${w.begin} — je staat weer als beschikbaar`,
      inhoud: `Hallo ${p.voornaam},\n\nJe aanduiding voor ${omschrijving(w)} is ingetrokken.\n\nJe staat weer als beschikbaar voor deze wedstrijd.`,
    }).catch(() => null);
  }
  return json({ vrijgegeven: true, voorbij });
}

/**
 * POST /api/admin/officials/scope  { wedstrijd_id, scope }
 * Uit de lijst halen legt scope_uit vast: de woensdagregel haalt ze dan niet
 * de volgende dag weer binnen. Niet zolang er iemand op staat.
 */
export async function scopeZetten(ctx) {
  const { db, persoon: beheerder } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const id = Number(body.wedstrijd_id);
  if (!Number.isInteger(id) || typeof body.scope !== 'boolean') return fout(400, 'wedstrijd_id en scope (true/false) zijn nodig');
  const w = await wedstrijdVoorBeheer(db, id);
  if (!w) return fout(404, 'onbekende wedstrijd');

  if (!body.scope) {
    const bezet = await db.prepare(`SELECT count(*) AS n FROM officials_aanduidingen WHERE wedstrijd_id = ? AND status = 'toegewezen'`).bind(id).first('n');
    if (bezet) return fout(409, 'geef eerst de aangeduide officials vrij');
  }
  await db
    .prepare(`UPDATE officials_wedstrijd SET scope = ?, scope_reden = ?, scope_op = ?, scope_uit = ? WHERE wedstrijd_id = ?`)
    .bind(body.scope ? 1 : 0, body.scope ? 'admin' : null, body.scope ? new Date().toISOString() : null, body.scope ? 0 : 1, id)
    .run();
  await logSchrijf(db, { soort: 'officials', wie: beheerder.id, wat: `${body.scope ? 'in' : 'uit'} de aanduidingslijst: ${omschrijving(w)}` });
  return json({ wedstrijd_id: id, scope: body.scope });
}

/**
 * POST /api/admin/officials/refs-bevestigd  { wedstrijd_id, bevestigd }
 * De beheerder weet dat er twee scheidsrechters komen terwijl de bond er nog
 * geen toont. Wijst niemand aan en verandert 'nog nodig' niet; onderdrukt
 * enkel de melding. De sync wist de vlag zodra de bond er zelf twee toont.
 */
export async function refsBevestigen(ctx) {
  const { db, persoon: beheerder } = ctx;
  const body = (await leesJson(ctx.request)) ?? {};
  const id = Number(body.wedstrijd_id);
  if (!Number.isInteger(id)) return fout(400, 'wedstrijd_id ontbreekt');
  const w = await wedstrijdVoorBeheer(db, id);
  if (!w) return fout(404, 'onbekende wedstrijd');
  const bevestigd = body.bevestigd !== false;
  if (bevestigd && w.off_aantal >= 2) return fout(409, 'de bond toont hier al twee scheidsrechters');
  await db
    .prepare(`UPDATE officials_wedstrijd SET refs_bevestigd = ?, refs_bevestigd_door = ?, refs_bevestigd_op = ? WHERE wedstrijd_id = ?`)
    .bind(bevestigd ? 1 : 0, bevestigd ? beheerder.id : null, bevestigd ? new Date().toISOString() : null, id)
    .run();
  await logSchrijf(db, { soort: 'officials', wie: beheerder.id, wat: `scheidsrechters buiten de bond ${bevestigd ? 'bevestigd' : 'ingetrokken'}: ${omschrijving(w)}` });
  return json({ wedstrijd_id: id, bevestigd });
}

/** GET /api/admin/officials/problemen — wat nog openstaat. */
export async function problemenTonen(ctx) {
  const r = await ctx.db
    .prepare(
      `SELECT pr.id, pr.wedstrijd_id, pr.bericht, pr.gemeld_op, p.voornaam, p.achternaam,
              w.datum, w.begin, w.tegenstander, t.naam AS ploeg
         FROM officials_problemen pr
         JOIN personen p ON p.id = pr.persoon_id
         JOIN wedstrijden w ON w.id = pr.wedstrijd_id
         JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
        WHERE pr.afgehandeld = 0
        ORDER BY pr.id DESC LIMIT 50`
    )
    .all();
  return json({
    problemen: (r.results ?? []).map((x) => ({
      id: x.id,
      wedstrijd_id: x.wedstrijd_id,
      naam: `${x.voornaam} ${x.achternaam}`.trim(),
      bericht: x.bericht,
      gemeld_op: x.gemeld_op,
      wedstrijd: `${x.datum} ${x.begin} ${x.ploeg} — ${x.tegenstander ?? ''}`.trim(),
    })),
  });
}

/** POST /api/admin/officials/probleem-afhandelen  { id, afgehandeld? } */
export async function probleemAfhandelen(ctx) {
  const body = (await leesJson(ctx.request)) ?? {};
  const id = Number(body.id);
  if (!Number.isInteger(id)) return fout(400, 'id ontbreekt');
  const uit = await ctx.db.prepare(`UPDATE officials_problemen SET afgehandeld = ? WHERE id = ?`).bind(body.afgehandeld === false ? 0 : 1, id).run();
  if (!uit.meta?.changes) return fout(404, 'onbekende melding');
  await logSchrijf(ctx.db, { soort: 'officials', wie: ctx.persoon.id, wat: `probleem ${body.afgehandeld === false ? 'heropend' : 'afgehandeld'}`, details: `melding ${id}` });
  return json({ id, afgehandeld: body.afgehandeld !== false });
}
