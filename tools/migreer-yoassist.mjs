// Een YOAssist-backup omzetten naar SQL voor TeamAssist (I1, fase 2b).
//
//   node tools/migreer-yoassist.mjs <yoassist-backup.json> <teamassist-backup.json> [--sql uit.sql] [--keuzes keuzes.json]
//
// Het keuzebestand (sinds 0.32.0) zegt per YOAssist-adres dat van een ouder
// is, wie die ouder is:
//   { "ruud@voorbeeld.be": { "ouder": { "voornaam": "Ruud", "achternaam": "Cuyvers" } } }
//
// Zonder --sql enkel het rapport: wie bij wie terechtkomt, wat er meegaat en
// wat niet. Altijd eerst dat lezen. Met --sql komt er ook het script voor de
// D1-console.
//
// Drie keuzes die alles hieronder sturen:
//  - De TeamAssist-backup dient om personen, ploegen en wedstrijden te
//    herkennen. Het script zelf verwijst naar wedstrijden via
//    (wedstrijd_guid, team_guid), niet via een id: tussen de backup en het
//    uitvoeren kan de sync rijen toevoegen.
//  - Alles is opnieuw uit te voeren zonder dubbels (INSERT OR IGNORE, of een
//    NOT EXISTS op een natuurlijke sleutel). De D1-console voert een script
//    niet als één transactie uit; stopt het halverwege, dan moet een tweede
//    keer veilig zijn.
//  - Een YOAssist-gebruiker wordt een bestaande persoon op e-mailadres, anders
//    op voor- en achternaam als er precies één kandidaat is (beslist in I1).
//    Een naamtreffer die al een ánder e-mailadres heeft, is twijfel en wordt
//    een nieuwe persoon — twee mensen samenvoegen op naam alleen is erger dan
//    er achteraf twee samen te voegen.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** Een SQL-letterlijke waarde. Enkel tekst, getallen en NULL komen voor. */
export function q(waarde) {
  if (waarde === null || waarde === undefined) return 'NULL';
  if (typeof waarde === 'number') return Number.isFinite(waarde) ? String(waarde) : 'NULL';
  if (typeof waarde === 'boolean') return waarde ? '1' : '0';
  return `'${String(waarde).replace(/'/g, "''")}'`;
}

export function normaliseerNaam(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/** '2627' → '2026-27': de seizoenscode van YOAssist naar die van TeamAssist. */
export function seizoenNaarTeamAssist(code) {
  const m = /^(\d{2})(\d{2})$/.exec(String(code ?? ''));
  return m ? `20${m[1]}-${m[2]}` : null;
}

/** Hetzelfde e-mailadres geeft altijd dezelfde id: een tweede run maakt geen tweede persoon. */
export function nieuweId(email) {
  return `p-yo-${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16)}`;
}

/**
 * Beide kanalen aan = 'beide', enkel push = 'push', anders 'mail' — nooit
 * 'niets': wie in YOAssist alles uitzette, kreeg toch de belangrijke mails.
 */
export function kanaalVoorkeur(u) {
  if (u.kanaal_mail && u.kanaal_push) return 'beide';
  if (u.kanaal_push) return 'push';
  return 'mail';
}

/**
 * Een adres dat niet bij de naam past, is mogelijk dat van een ouder (in
 * YOAssist vult een ouder vaak in voor zijn kind). Past: de voornaam staat
 * erin, of de achternaam met de eerste letter van de voornaam vooraan
 * (tlauwers voor Tim Lauwers, niet ruudcuyvers voor Max Cuyvers). Enkel een
 * signaal in het rapport: zodra het ouderadres via het personensjabloon bij
 * de ouder komt, botst het met de UNIQUE op personen.email.
 */
export function mogelijkOuderadres(email, voornaam, achternaam) {
  const letters = (s) => normaliseerNaam(s).replace(/[^a-z]/g, '');
  const lokaal = letters(String(email).split('@')[0]);
  const vn = letters(voornaam);
  const an = letters(achternaam);
  if (vn.length < 2) return false;
  if (lokaal.includes(vn)) return false;
  if (an && lokaal.includes(an) && lokaal.startsWith(vn[0])) return false;
  return true;
}

const zelfdeNaam = (p, voornaam, achternaam) =>
  normaliseerNaam(p.voornaam) === normaliseerNaam(voornaam) &&
  normaliseerNaam(p.achternaam) === normaliseerNaam(achternaam);

/**
 * Een YOAssist-adres dat van een ouder is (0.32.0, keuzebestand). Het adres
 * gaat naar de ouder, het kind blijft zonder adres, en de koppeling wordt
 * gelegd: zo meldt de ouder zich aan en handelt hij namens het kind, en
 * krijgt hij de berichten van het kind mee (namens.js).
 *
 * De ouder: wie in TeamAssist dat adres al heeft; anders precies één
 * naamgenoot zonder adres; anders een nieuwe persoon zonder rol.
 * Het kind: precies één naamgenoot (op naam, nooit op het adres — dat
 * hoort net bij de ouder); anders een nieuwe persoon.
 */
function koppelViaOuder(u, ouder, personen, opEmail) {
  const email = String(u.email).toLowerCase();
  let ouderRij = opEmail.get(email);
  let ouderHoe = 'email';
  if (!ouderRij) {
    const kandidaten = personen.filter((p) => !p.email && zelfdeNaam(p, ouder.voornaam, ouder.achternaam));
    ouderRij = kandidaten.length === 1 ? kandidaten[0] : null;
    ouderHoe = ouderRij ? 'naam' : 'nieuw';
  }
  const kinderen = personen.filter((p) => zelfdeNaam(p, u.voornaam, u.achternaam) && p.id !== ouderRij?.id);
  const kind = kinderen.length === 1 ? kinderen[0] : null;
  return {
    u,
    persoon_id: kind?.id ?? nieuweId(`kind:${email}`),
    hoe: kind ? 'naam' : 'nieuw',
    persoon: kind,
    zonderAdres: true,
    ouder: {
      id: ouderRij?.id ?? nieuweId(email),
      hoe: ouderHoe,
      voornaam: ouderRij?.voornaam ?? ouder.voornaam,
      achternaam: ouderRij?.achternaam ?? ouder.achternaam,
      email,
    },
  };
}

/**
 * @param {object} [keuzes]  per YOAssist-adres: { ouder: { voornaam, achternaam } }
 */
export function koppelPersonen(users, personen, keuzes = {}) {
  const opEmail = new Map(
    personen.filter((p) => p.email).map((p) => [String(p.email).toLowerCase(), p])
  );
  const keuzeVan = new Map(Object.entries(keuzes).map(([k, v]) => [k.toLowerCase(), v]));
  return users.map((u) => {
    const email = String(u.email).toLowerCase();
    const keuze = keuzeVan.get(email);
    if (keuze?.ouder) return koppelViaOuder(u, keuze.ouder, personen, opEmail);
    const treffer = opEmail.get(email);
    if (treffer) return { u, persoon_id: treffer.id, hoe: 'email', persoon: treffer };

    const kandidaten = personen.filter(
      (p) =>
        normaliseerNaam(p.voornaam) === normaliseerNaam(u.voornaam) &&
        normaliseerNaam(p.achternaam) === normaliseerNaam(u.achternaam)
    );
    if (kandidaten.length === 1 && !kandidaten[0].email) {
      return { u, persoon_id: kandidaten[0].id, hoe: 'naam', persoon: kandidaten[0] };
    }
    const reden =
      kandidaten.length > 1
        ? `${kandidaten.length} personen met die naam`
        : kandidaten.length === 1
          ? `naamgenoot met een ander e-mailadres (${kandidaten[0].email})`
          : null;
    return { u, persoon_id: nieuweId(email), hoe: 'nieuw', twijfel: reden };
  });
}

/**
 * @param {object} yo   de YOAssist-backup zoals /api/admin/backup ze geeft
 * @param {object} ta   de TeamAssist-backup zoals /api/admin/backup ze geeft
 * @returns {{sql: string, rapport: string, telling: object}}
 */
export function maakMigratie(yo, ta, keuzes = {}) {
  const g = yo.gegevens ?? {};
  const t = ta.tabellen ?? {};
  const rij = (naam) => g[naam] ?? [];
  const sql = [];
  const meldingen = [];
  const telling = {};
  const tel = (tabel, mee, niet = 0) => {
    telling[tabel] ??= { bron: 0, mee: 0, niet: 0 };
    telling[tabel].bron += mee + niet;
    telling[tabel].mee += mee;
    telling[tabel].niet += niet;
  };

  const seizoen = (t.seizoenen ?? []).find((s) => s.actief)?.code;
  if (!seizoen) throw new Error('de TeamAssist-backup heeft geen actief seizoen');

  // --- personen ------------------------------------------------------------
  const koppeling = koppelPersonen(rij('users'), t.personen ?? [], keuzes);
  for (const adres of Object.keys(keuzes)) {
    if (!rij('users').some((u) => String(u.email).toLowerCase() === adres.toLowerCase())) {
      meldingen.push(`Het keuzebestand noemt ${adres}, maar die gebruiker staat niet in de YOAssist-backup.`);
    }
  }
  const persoonVan = new Map(koppeling.map((k) => [String(k.u.email).toLowerCase(), k.persoon_id]));
  const pid = (email) => (email ? persoonVan.get(String(email).toLowerCase()) ?? null : null);

  sql.push('-- personen');
  for (const k of koppeling) {
    const { u } = k;
    const kanaal = kanaalVoorkeur(u);
    // Een kind met het adres van een ouder: het adres gaat naar de ouder.
    const eigenAdres = k.zonderAdres ? null : String(u.email).toLowerCase();
    if (k.ouder) {
      const o = k.ouder;
      sql.push(
        o.hoe === 'nieuw'
          ? `INSERT OR IGNORE INTO personen (id, voornaam, achternaam, email, naam_bron)` +
              ` VALUES (${q(o.id)}, ${q(o.voornaam ?? '')}, ${q(o.achternaam ?? '')}, ${q(o.email)}, 'club');`
          : `UPDATE personen SET email = coalesce(email, ${q(o.email)}), gewijzigd = datetime('now') WHERE id = ${q(o.id)};`
      );
    }
    if (k.hoe === 'nieuw') {
      sql.push(
        `INSERT OR IGNORE INTO personen (id, voornaam, achternaam, email, tel_gsm, actief, kanaal_voorkeur, agenda_sleutel, naam_bron)` +
          ` VALUES (${q(k.persoon_id)}, ${q(u.voornaam ?? '')}, ${q(u.achternaam ?? '')}, ${q(eigenAdres)},` +
          ` ${q(u.gsm || null)}, ${u.actief ? 1 : 0}, ${q(kanaal)}, ${q(u.agenda_sleutel || null)}, 'club');`
      );
    } else {
      // Enkel aanvullen wat leeg is: wat in TeamAssist al staat, wint. De
      // agendasleutel en het kanaal komen wel uit YOAssist — daar hangen
      // bestaande agenda-abonnementen en een bewuste keuze aan.
      sql.push(
        `UPDATE personen SET email = coalesce(email, ${q(eigenAdres)}),` +
          ` tel_gsm = coalesce(tel_gsm, ${q(u.gsm || null)}),` +
          ` agenda_sleutel = coalesce(agenda_sleutel, ${q(u.agenda_sleutel || null)}),` +
          ` kanaal_voorkeur = ${q(kanaal)}, gewijzigd = datetime('now')` +
          ` WHERE id = ${q(k.persoon_id)};`
      );
    }
    if (k.ouder) {
      sql.push(
        `INSERT OR IGNORE INTO ouder_kind (ouder_id, kind_id) VALUES (${q(k.ouder.id)}, ${q(k.persoon_id)});`
      );
    } else if (mogelijkOuderadres(u.email, u.voornaam, u.achternaam)) {
      meldingen.push(
        `${u.voornaam} ${u.achternaam}: het adres ${u.email} is mogelijk dat van een ouder. ` +
          'Komt het via het personensjabloon ook bij de ouder, dan botst het (personen.email is uniek). ' +
          'Is het van een ouder, zet het dan in een keuzebestand (--keuzes).'
      );
    }
    if (k.twijfel) meldingen.push(`${u.voornaam} ${u.achternaam}: nieuwe persoon, want ${k.twijfel}.`);
  }
  tel('users', koppeling.length);

  sql.push('', '-- rollen: YO / YOPLUS uit het profiel, YOADM voor een beheerder');
  for (const { u, persoon_id } of koppeling) {
    const rollen = [u.profiel === 'YO+' ? 'YOPLUS' : 'YO'];
    if (u.is_admin) rollen.push('YOADM');
    for (const rol of rollen) {
      sql.push(`INSERT OR IGNORE INTO rollen (persoon_id, rol, bron) VALUES (${q(persoon_id)}, ${q(rol)}, 'club');`);
    }
    sql.push(
      `INSERT OR REPLACE INTO officials_voorkeuren (persoon_id, herinner_avond, herinner_ochtend, gsm_delen)` +
        ` VALUES (${q(persoon_id)}, ${u.herinner_avond ? 1 : 0}, ${u.herinner_ochtend ? 1 : 0}, ${u.gsm_delen ? 1 : 0});`
    );
  }

  // --- ploegen -------------------------------------------------------------
  const taTeams = new Set((t.teams ?? []).filter((x) => x.seizoen === seizoen).map((x) => x.guid));
  sql.push('', `-- ploegen (seizoen ${seizoen}): de vlag 'officials' volgt 'volgen' uit YOAssist`);
  let ploegenErbij = 0;
  for (const p of rij('teams')) {
    if (!taTeams.has(p.guid)) {
      // Een ploeg die TeamAssist niet beheert, kan toch officials krijgen
      // (beslist in I1): erbij, maar niet gevolgd.
      sql.push(
        `INSERT OR IGNORE INTO teams (guid, seizoen, naam, categorie, gevolgd, officials)` +
          ` VALUES (${q(p.guid)}, ${q(seizoen)}, ${q(p.naam)}, ${q(p.cat_code)}, 0, ${p.volgen ? 1 : 0});`
      );
      ploegenErbij += 1;
    }
    sql.push(`UPDATE teams SET officials = ${p.volgen ? 1 : 0} WHERE guid = ${q(p.guid)} AND seizoen = ${q(seizoen)};`);
  }
  tel('teams', rij('teams').length);
  if (ploegenErbij) meldingen.push(`${ploegenErbij} ploeg(en) kwamen nog niet voor in TeamAssist; ze komen erbij, niet gevolgd.`);

  // --- wedstrijden -----------------------------------------------------------
  const taWedstrijden = new Set((t.wedstrijden ?? []).map((w) => `${w.wedstrijd_guid}|${w.team_guid}`));
  const bekendePloegen = new Set([...taTeams, ...rij('teams').map((p) => p.guid)]);
  const wedstrijdVan = new Map(); // match_guid -> sql-uitdrukking voor de id
  let wedstrijdenErbij = 0;
  sql.push('', '-- wedstrijden: enkel thuiswedstrijden, op de ploeg van de thuisploeg');
  for (const m of rij('matches')) {
    const s = seizoenNaarTeamAssist(m.seizoen);
    if (s !== seizoen) {
      tel('matches', 0, 1);
      meldingen.push(`Wedstrijd ${m.guid}: seizoen ${m.seizoen}, niet het actieve seizoen ${seizoen}; niet mee.`);
      continue;
    }
    if (!bekendePloegen.has(m.thuis_guid)) {
      tel('matches', 0, 1);
      meldingen.push(`Wedstrijd ${m.guid}: thuisploeg ${m.thuis_guid} onbekend; niet mee.`);
      continue;
    }
    if (!taWedstrijden.has(`${m.guid}|${m.thuis_guid}`)) {
      sql.push(
        `INSERT OR IGNORE INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis, tegenstander,` +
          ` locatie_tekst, vbl_acc_guid, uitslag, bij_bond, laatst_gezien, bron)` +
          ` VALUES (${q(m.guid)}, ${q(m.thuis_guid)}, ${q(seizoen)}, ${q(m.datum)}, ${q(m.uur)}, 1, ${q(m.uit_naam)},` +
          ` ${q(m.locatie)}, ${q(m.acc_guid)}, ${q(m.uitslag)}, ${m.status === 'verdwenen' ? 0 : 1}, ${q(m.laatst_gezien)}, ${q(m.bron === 'handmatig' ? 'handmatig' : 'vbl')});`
      );
      wedstrijdenErbij += 1;
    }
    const id = `(SELECT id FROM wedstrijden WHERE wedstrijd_guid = ${q(m.guid)} AND team_guid = ${q(m.thuis_guid)})`;
    wedstrijdVan.set(m.guid, id);
    sql.push(
      `INSERT OR REPLACE INTO officials_wedstrijd (wedstrijd_id, cat_code, poule_naam, off_namen, off_aantal, off_gewist,` +
        ` scope, scope_reden, scope_op, scope_uit, refs_bevestigd, refs_bevestigd_door, refs_bevestigd_op, forfait,` +
        ` bond_officials, hash, aangemaakt) VALUES (${id}, ${q(m.cat_code)}, ${q(m.poule_naam)}, ${q(m.off_namen)},` +
        ` ${q(m.off_aantal ?? 0)}, ${m.off_gewist ? 1 : 0}, ${m.scope ? 1 : 0}, ${q(m.scope_reden)}, ${q(m.scope_op)},` +
        ` ${m.scope_uit ? 1 : 0}, ${m.refs_bevestigd ? 1 : 0}, ${q(pid(m.refs_bevestigd_door) ?? m.refs_bevestigd_door)},` +
        ` ${q(m.refs_bevestigd_op)}, ${q(m.forfait)}, ${q(m.bond_officials)}, ${q(m.hash)}, ${q(m.aangemaakt)});`
    );
    tel('matches', 1);
  }
  if (wedstrijdenErbij) {
    meldingen.push(
      `${wedstrijdenErbij} wedstrijd(en) stonden nog niet in TeamAssist (meestal van een ploeg die TeamAssist niet volgt); ze komen erbij.`
    );
  }

  // Wat aan een gebruiker en een wedstrijd hangt: enkel als beide meekomen.
  const beide = (tabel, r, maak) => {
    const p = pid(r.user_email);
    const w = wedstrijdVan.get(r.match_guid);
    if (!p || !w) {
      tel(tabel, 0, 1);
      meldingen.push(`${tabel}: rij van ${r.user_email} bij ${r.match_guid} niet mee (${!p ? 'gebruiker' : 'wedstrijd'} onbekend).`);
      return;
    }
    sql.push(maak(p, w));
    tel(tabel, 1);
  };

  sql.push('', '-- beschikbaarheden, aanduidingen, problemen');
  for (const a of rij('availability')) {
    beide('availability', a, (p, w) =>
      `INSERT OR IGNORE INTO officials_beschikbaarheid (persoon_id, wedstrijd_id, status, gewijzigd)` +
        ` VALUES (${q(p)}, ${w}, ${q(a.status)}, ${q(a.updated_at)});`
    );
  }
  for (const a of rij('assignments')) {
    beide('assignments', a, (p, w) =>
      `INSERT OR IGNORE INTO officials_aanduidingen (wedstrijd_id, persoon_id, status, toegewezen_door, toegewezen_op, gewijzigd_op)` +
        ` VALUES (${w}, ${q(p)}, ${q(a.status)}, ${q(pid(a.toegewezen_door) ?? a.toegewezen_door)}, ${q(a.toegewezen_op)}, ${q(a.gewijzigd_op)});`
    );
  }
  for (const pr of rij('problemen')) {
    beide('problemen', pr, (p, w) =>
      `INSERT INTO officials_problemen (wedstrijd_id, persoon_id, bericht, gemeld_op, afgehandeld)` +
        ` SELECT ${w}, ${q(p)}, ${q(pr.bericht)}, ${q(pr.gemeld_op)}, ${pr.afgehandeld ? 1 : 0}` +
        ` WHERE NOT EXISTS (SELECT 1 FROM officials_problemen WHERE wedstrijd_id = ${w} AND persoon_id = ${q(p)} AND gemeld_op = ${q(pr.gemeld_op)});`
    );
  }

  // --- facturatie -------------------------------------------------------------
  // persoon_id is hier bewust geen foreign key: een uitbetaald bedrag blijft
  // staan nadat iemand vertrokken is. Een onbekende gebruiker krijgt dus zijn
  // e-mailadres als spoor, in plaats van weggelaten te worden.
  const vergoedingsId = (email) => pid(email) ?? `yoassist:${String(email).toLowerCase()}`;
  sql.push('', '-- facturatie');
  for (const m of rij('afgesloten_maanden')) {
    sql.push(
      `INSERT OR IGNORE INTO officials_maanden (maand, seizoen, afgesloten_op, afgesloten_door, totaal_cent, aantal_officials, verstuurd_op, verstuurd_naar)` +
        ` VALUES (${q(m.maand)}, ${q(seizoenNaarTeamAssist(m.seizoen) ?? m.seizoen)}, ${q(m.afgesloten_op)}, ${q(vergoedingsId(m.afgesloten_door))},` +
        ` ${q(m.totaal_cent)}, ${q(m.aantal_officials)}, ${q(m.verstuurd_op)}, ${q(m.verstuurd_naar)});`
    );
  }
  tel('afgesloten_maanden', rij('afgesloten_maanden').length);
  for (const r of rij('vergoeding_regels')) {
    const p = vergoedingsId(r.user_email);
    sql.push(
      `INSERT INTO officials_vergoeding_regels (maand, persoon_id, naam, soort, betreft_maand, cat_code, cat_label, aantal, tarief_cent, bedrag_cent)` +
        ` SELECT ${q(r.maand)}, ${q(p)}, ${q(r.naam)}, ${q(r.soort)}, ${q(r.betreft_maand)}, ${q(r.cat_code)}, ${q(r.cat_label)},` +
        ` ${q(r.aantal)}, ${q(r.tarief_cent)}, ${q(r.bedrag_cent)}` +
        ` WHERE NOT EXISTS (SELECT 1 FROM officials_vergoeding_regels WHERE maand = ${q(r.maand)} AND persoon_id = ${q(p)}` +
        ` AND soort = ${q(r.soort)} AND ifnull(betreft_maand, '') = ${q(r.betreft_maand ?? '')} AND cat_code = ${q(r.cat_code)});`
    );
  }
  tel('vergoeding_regels', rij('vergoeding_regels').length);
  for (const r of rij('vergoeding_verwerkt')) {
    sql.push(
      `INSERT OR IGNORE INTO officials_vergoeding_verwerkt (wedstrijd_guid, persoon_id, maand, cat_code, tarief_cent, aantal)` +
        ` VALUES (${q(r.match_guid)}, ${q(vergoedingsId(r.user_email))}, ${q(r.maand)}, ${q(r.cat_code)}, ${q(r.tarief_cent)}, ${q(r.aantal ?? 1)});`
    );
  }
  tel('vergoeding_verwerkt', rij('vergoeding_verwerkt').length);

  // --- Regio en de woensdaglijst ------------------------------------------------
  sql.push('', '-- Regio en de woensdaglijst');
  for (const c of rij('volg_clubs')) {
    sql.push(
      `INSERT OR IGNORE INTO officials_volg_clubs (guid, naam, toegevoegd_door, toegevoegd)` +
        ` VALUES (${q(c.guid)}, ${q(c.naam)}, ${q(pid(c.toegevoegd_door) ?? c.toegevoegd_door)}, ${q(c.toegevoegd)});`
    );
  }
  tel('volg_clubs', rij('volg_clubs').length);
  for (const w of rij('volg_wedstrijden')) {
    sql.push(
      `INSERT OR IGNORE INTO officials_volg_wedstrijden (guid, club_guid, club_naam, thuis_naam, uit_naam, datum, uur, cat_code, vbl_aantal, vbl_naam, laatst_gezien, bond_officials)` +
        ` VALUES (${q(w.guid)}, ${q(w.club_guid)}, ${q(w.club_naam)}, ${q(w.thuis_naam)}, ${q(w.uit_naam)}, ${q(w.datum)}, ${q(w.uur)},` +
        ` ${q(w.cat_code)}, ${q(w.vbl_aantal ?? 0)}, ${q(w.vbl_naam)}, ${q(w.laatst_gezien)}, ${q(w.bond_officials)});`
    );
  }
  tel('volg_wedstrijden', rij('volg_wedstrijden').length);
  for (const l of rij('vbl_lijsten')) {
    sql.push(
      `INSERT INTO officials_vbl_lijsten (ontvangen, onderwerp, bestand, weekend_van, weekend_tot, aantal_rijen, eigen, meldingen, status, fout, verwerkt_op, volg)` +
        ` SELECT ${q(l.ontvangen)}, ${q(l.onderwerp)}, ${q(l.bestand)}, ${q(l.weekend_van)}, ${q(l.weekend_tot)}, ${q(l.aantal_rijen)},` +
        ` ${q(l.eigen)}, ${q(l.meldingen)}, ${q(l.status)}, ${q(l.fout)}, ${q(l.verwerkt_op)}, ${q(l.volg)}` +
        ` WHERE NOT EXISTS (SELECT 1 FROM officials_vbl_lijsten WHERE ontvangen = ${q(l.ontvangen)});`
    );
  }
  tel('vbl_lijsten', rij('vbl_lijsten').length);

  // --- Mijn berichten -------------------------------------------------------------
  sql.push('', '-- Mijn berichten: zoals verstuurd, met de samenvatting als korte regel');
  for (const b of rij('berichten')) {
    const p = pid(b.user_email);
    if (!p) {
      tel('berichten', 0, 1);
      continue;
    }
    // 'mail,push' wordt 'mail': kanaal zegt wat er zeker aankwam (zoals in
    // verwittigen.js), en de mail vertrok altijd mee.
    const kanaal = String(b.kanalen ?? '').includes('mail') || !b.kanalen ? 'mail' : 'push';
    sql.push(
      `INSERT INTO berichten (persoon_id, kanaal, onderwerp, inhoud, verzonden, soort, kort, gelezen_op)` +
        ` SELECT ${q(p)}, ${q(kanaal)}, ${q(b.titel ?? '')}, ${q(b.volledig ?? b.tekst)}, ${q(b.verstuurd)}, ${q(b.soort)}, ${q(b.tekst)}, ${q(b.gelezen_op)}` +
        ` WHERE NOT EXISTS (SELECT 1 FROM berichten WHERE persoon_id = ${q(p)} AND verzonden = ${q(b.verstuurd)} AND onderwerp = ${q(b.titel ?? '')});`
    );
    tel('berichten', 1);
  }

  // --- logboek: enkel wat nog openstaat ---------------------------------------------
  sql.push('', '-- logboek: enkel wat nog openstaat; de rest blijft in de YOAssist-backup');
  for (const l of rij('logboek')) {
    if (l.afgehandeld) {
      tel('logboek', 0, 1);
      telling.logboek.reden = 'afgehandeld; blijft in de YOAssist-backup als archief';
      continue;
    }
    const wat = `officials ${l.categorie}/${l.soort}${l.veld ? ` — ${l.veld}` : ''}`;
    const details = [l.match_guid, l.oud != null || l.nieuw != null ? `${l.oud ?? ''} → ${l.nieuw ?? ''}` : null]
      .filter(Boolean)
      .join(': ');
    const wie = pid(l.wie);
    sql.push(
      `INSERT INTO logboek (tijdstip, soort, wie, wat, details, afgehandeld)` +
        ` SELECT ${q(l.vastgesteld)}, 'officials', ${q(wie)}, ${q(wat)}, ${q(details || null)}, 0` +
        ` WHERE NOT EXISTS (SELECT 1 FROM logboek WHERE soort = 'officials' AND tijdstip = ${q(l.vastgesteld)} AND wat = ${q(wat)} AND ifnull(details, '') = ${q(details)});`
    );
    tel('logboek', 1);
  }

  // --- instellingen ------------------------------------------------------------------
  sql.push('', '-- instellingen');
  const instelling = (k) => rij('settings').find((s) => s.sleutel === k)?.waarde;
  for (const k of ['facturatie_ontvangers', 'forfait_aanduiding', 'extern_namen']) {
    const w = instelling(k);
    if (w == null) continue;
    sql.push(`INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES (${q(k)}, ${q(w)});`);
  }

  // --- wat bewust niet meekomt ---------------------------------------------------------
  const niet = {
    clubs: 'één club; staat al in de instellingen',
    sync_runs: 'TeamAssist heeft taak_runs',
    push_abonnementen: 'hangen aan het oude domein; officials zetten meldingen opnieuw aan',
    categorieen: 'staan al in officials_categorieen (de tarieven van YOAssist)',
    settings: 'enkel facturatie_ontvangers, forfait_aanduiding en extern_namen gaan mee',
    mededelingen: 'een mededeling van YOAssist hoort niet in TeamAssist',
    mededeling_gezien: 'idem',
    ouder_kind: 'leeg in YOAssist',
    ploeg_pv: 'worden rollen PLOEGV; in YOAssist leeg',
    ploeg_coaches: 'worden rollen COACH; in YOAssist leeg',
  };
  for (const [tabel, reden] of Object.entries(niet)) {
    const n = rij(tabel).length;
    telling[tabel] = { bron: n, mee: 0, niet: n, reden };
  }
  for (const pr of yo.yoassist?.problemen ?? []) {
    meldingen.push(`De YOAssist-backup meldde zelf: ${pr.tabel} — ${pr.reden}.`);
  }
  const verborgen = rij('users').filter((u) => u.verborgen_tabs && u.verborgen_tabs.replace(/,/g, ''));
  if (verborgen.length) {
    meldingen.push(`${verborgen.length} gebruiker(s) hadden tabbladen verborgen; dat komt pas mee met de schermen (fase 4).`);
  }

  const kop =
    `-- YOAssist ${yo.yoassist?.versie ?? '?'} (backup ${yo.yoassist?.gemaaktOp ?? '?'}) naar TeamAssist` +
    ` (backup ${ta.gemaakt ?? '?'}), seizoen ${seizoen}.\n` +
    '-- Gemaakt door tools/migreer-yoassist.mjs. Lees eerst het rapport.\n' +
    '-- Opnieuw uitvoeren maakt geen dubbels.\n';
  return {
    sql: kop + '\n' + sql.join('\n') + '\n',
    kop,
    opdrachten: sql,
    rapport: maakRapport({ yo, ta, seizoen, koppeling, telling, meldingen }),
    telling,
    koppeling,
  };
}

function maakRapport({ yo, ta, seizoen, koppeling, telling, meldingen }) {
  const r = [];
  r.push(`# Migratie YOAssist → TeamAssist — rapport`, '');
  r.push(`- YOAssist ${yo.yoassist?.versie ?? '?'}, backup van ${yo.yoassist?.gemaaktOp ?? '?'}`);
  r.push(`- TeamAssist-backup van ${ta.gemaakt ?? '?'}, actief seizoen ${seizoen}`, '');
  r.push('Dit is een droogloop: er is nog niets gewijzigd.', '');
  r.push('## Personen', '', '| YOAssist | Rollen | Wordt | Hoe |', '|---|---|---|---|');
  for (const k of koppeling) {
    const rollen = [k.u.profiel === 'YO+' ? 'YOPLUS' : 'YO', ...(k.u.is_admin ? ['YOADM'] : [])].join(', ');
    const hoe = {
      email: 'bestaande persoon, op e-mailadres',
      naam: k.zonderAdres ? 'bestaande persoon, op naam' : 'bestaande persoon, op naam (krijgt het e-mailadres)',
      nieuw: 'nieuwe persoon',
    }[k.hoe];
    const wie = k.persoon ? `${k.persoon.voornaam} ${k.persoon.achternaam}` : `${k.u.voornaam} ${k.u.achternaam}`;
    const viaOuder = k.ouder
      ? ` — zonder eigen adres; het adres gaat naar ouder ${k.ouder.voornaam} ${k.ouder.achternaam}` +
        ` (${{ email: 'bestaande persoon, op e-mailadres', naam: 'bestaande persoon, op naam', nieuw: 'nieuwe persoon' }[k.ouder.hoe]})`
      : '';
    r.push(`| ${k.u.voornaam} ${k.u.achternaam} (${k.u.email}) | ${rollen} | ${wie} — \`${k.persoon_id}\` | ${hoe}${k.twijfel ? ` — ${k.twijfel}` : ''}${viaOuder} |`);
  }
  r.push('', '## Per tabel', '', '| YOAssist | Rijen | Mee | Niet mee | Waarom niet |', '|---|---|---|---|---|');
  for (const [tabel, c] of Object.entries(telling)) {
    r.push(`| ${tabel} | ${c.bron} | ${c.mee} | ${c.niet} | ${c.reden ?? (c.niet ? 'zie aandachtspunten' : '')} |`);
  }
  r.push('', '## Aandachtspunten', '');
  if (!meldingen.length) r.push('Geen.');
  for (const m of meldingen) r.push(`- ${m}`);
  return r.join('\n') + '\n';
}

/**
 * Het script in delen van hoogstens `max` tekens, op een grens tussen twee
 * opdrachten — nooit per regel: een bericht kan regeleinden bevatten, en een
 * regel daarin kan op ';' eindigen. De D1-console slikt geen script van
 * 600 kB; de delen na elkaar uitvoeren geeft hetzelfde, want elk deel bouwt
 * enkel op de vorige.
 */
export function deelOp({ kop, opdrachten }, max = 90_000) {
  const delen = [];
  let huidig = [];
  let lengte = 0;
  for (const o of opdrachten) {
    if (lengte + o.length + 1 > max && huidig.length) {
      delen.push(huidig);
      huidig = [];
      lengte = 0;
    }
    huidig.push(o);
    lengte += o.length + 1;
  }
  if (huidig.length) delen.push(huidig);
  return delen.map((d, i) => `${kop}-- deel ${i + 1} van ${delen.length}\n\n${d.join('\n')}\n`);
}

// Als script: rapport naar stdout, SQL naar een bestand met --sql (en in
// delen ernaast: uit-1.sql, uit-2.sql, ... voor de D1-console).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const optie = (naam) => {
    const i = args.indexOf(naam);
    return i >= 0 ? args[i + 1] : null;
  };
  const sqlPad = optie('--sql');
  const keuzesPad = optie('--keuzes');
  const [yoPad, taPad] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  if (!yoPad || !taPad) {
    console.error('gebruik: node tools/migreer-yoassist.mjs <yoassist-backup.json> <teamassist-backup.json> [--sql uit.sql] [--keuzes keuzes.json]');
    process.exit(1);
  }
  const uit = maakMigratie(
    JSON.parse(readFileSync(yoPad, 'utf8')),
    JSON.parse(readFileSync(taPad, 'utf8')),
    keuzesPad ? JSON.parse(readFileSync(keuzesPad, 'utf8')) : {}
  );
  process.stdout.write(uit.rapport);
  if (sqlPad) {
    writeFileSync(sqlPad, uit.sql);
    const delen = deelOp(uit);
    delen.forEach((d, i) => writeFileSync(sqlPad.replace(/\.sql$/, '') + `-${i + 1}.sql`, d));
    console.error(`SQL geschreven naar ${sqlPad}, en in ${delen.length} delen ernaast`);
  }
}
