// De woensdaglijst van Basketbal Vlaanderen (0.34.0, uit YOAssist V39 en V42).
//
// Elke woensdag, normaal rond 13:35, stuurt info@basketbal.vlaanderen een
// nieuwsbrief met een Excel-bestand: de wedstrijden van het komende weekend
// waar de bond geen of maar één official kon aanduiden. Die lijst heeft
// voorrang op de API. Wat er niet in staat, heeft volgens de bond twee
// officials — ook als de API nog niemand toont, want aanduidingen zijn daar
// niet altijd meteen zichtbaar.
//
// Verloop:
//  - De mail komt binnen (`ontvangMail`, via de email()-handler van de
//    Worker): afzender en onderwerp nakijken, het Excel-bestand ophalen en
//    uitlezen, de eigen thuiswedstrijden koppelen, bewaren. Is het woensdag
//    14 uur al voorbij, dan meteen verwerken.
//  - Woensdag 14 uur (`woensdagOm14`): verwerken, of de beheerders
//    verwittigen dat de lijst er nog niet is.
//  - Woensdag 20 uur (`woensdagTerugval`): nog altijd geen lijst, dan de
//    woensdagregel met de API. Komt de lijst daarna toch, dan zet ze recht.
//
// Alles hangt aan dingen die de bond zonder waarschuwing kan wijzigen. Elke
// onverwachte vorm faalt daarom luid, met een melding aan de beheerders, en
// nooit stil.
//
// Verschil met YOAssist: een wedstrijd heet hier bij haar id in `wedstrijden`
// (de koppeling in `eigen` bewaart dus id's), de thuisploeg is `teams.naam`
// (de volledige naam van de bond, zoals in de lijst), en de ontvangers komen
// uit de rollen (ontvangers.js).

import { leesMail, adresUit } from './mime.js';
import { leesXlsx } from './xlsx.js';
import { logSchrijf } from '../lib/logboek.js';
import { actiefSeizoen } from '../lib/seizoen.js';
import { aantalNodig } from './regels.js';
import { komendWeekend, pasWoensdagregelToe, zoekOverbodigeScope, EIGEN_VANAF_U14 } from './woensdag.js';
import { beheerders, yoPlus, verwittigAllen } from './ontvangers.js';
import {
  tekstWoensdagregel, tekstWoensdaglijstBeheer, tekstLijstNietBinnen, tekstTerugval, tekstLijstFout,
  tekstAvondcontrole,
} from './teksten.js';

export const AFZENDER = 'info@basketbal.vlaanderen';
const GMAIL_BEVESTIGING = 'forwarding-noreply@google.com';
const ONDERWERP = /zonder officials/i;
// Bevestigingen die een mens moet aanklikken: doorsturen vanuit Gmail, of de
// inschrijving op de nieuwsbrief bij Mailchimp. Het adres van de app is geen
// mailbox; zonder doorsturen raakt niemand aan die link.
const BEVESTIGING = /bevestig|confirm|verif/i;
const LINK = /https:\/\/mcusercontent\.com\/[^\s"'<>)]+\/files\/[^\s"'<>)]+\.xlsx/i;
const MAX_BESTAND = 5 * 1024 * 1024;
// Een lege lijst (V44): zijn alle wedstrijden van het weekend gedekt, dan
// stuurt de bond de mail zonder Excel-bestand, met deze tekst. Zo op 28
// oktober 2026: '0 wedstrijden met één of zonder officials' en 'Alle
// wedstrijden zijn dit weekend van officials voorzien.' Herkend aan de tekst,
// niet aan het ontbreken van de link alleen: een mail zonder link en zonder
// deze tekst betekent dat de bond de vorm veranderde, en dat blijft een fout.
const LEEG = [
  /alle\s+wedstrijden\s+zijn\s+dit\s+weekend\s+van\s+officials\s+voorzien/i,
  /\b0\s+wedstrijden\s+met\s+(?:één|een|&eacute;&eacute;n)\s+of\s+zonder\s+officials/i,
];

/** De kolommen die er moeten zijn. De volgorde mag wijzigen, de namen niet. */
const KOLOMMEN = {
  datum: 'datum',
  tijd: 'tijd',
  thuis: 'thuis ploeg',
  uit: 'uit ploeg',
  reeks: 'reeks',
  official1: 'official 1',
  official2: 'official 2',
};

// ---------------------------------------------------------------------------
// Normaliseren — dezelfde vorm voor de lijst en voor de databank.
// ---------------------------------------------------------------------------

/** 'AB  Inbev Leuven Bears G14 B ' en 'AB InBev Leuven Bears G14 B' zijn gelijk. */
export function naamSleutel(s) {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const iso = (j, m, d) => `${j}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** '3/10/2026' (of een Excel-datumgetal) naar '2026-10-03'; null als het niet lukt. */
export function lijstDatum(waarde) {
  const s = String(waarde ?? '').trim();
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const [, d, mnd, j] = m.map(Number);
    if (mnd >= 1 && mnd <= 12 && d >= 1 && d <= 31) return iso(j, mnd, d);
    return null;
  }
  // Een cel met datumopmaak bewaart een getal: dagen sinds 30/12/1899.
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

/** '9:00' (of een Excel-tijdsfractie) naar '09:00'; null als het niet lukt. */
export function lijstUur(waarde) {
  const s = String(waarde ?? '').trim();
  // Eerst de fractie: '0.375' zou anders als 0 uur 37 gelezen worden.
  if (/^0?\.\d{3,}$/.test(s)) {
    const minuten = Math.round(Number(s) * 24 * 60);
    return `${String(Math.floor(minuten / 60)).padStart(2, '0')}:${String(minuten % 60).padStart(2, '0')}`;
  }
  const m = s.match(/^(\d{1,2})[:.h](\d{2})(?::\d{2})?$/);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return null;
}

// ---------------------------------------------------------------------------
// De mail en het bestand.
// ---------------------------------------------------------------------------

/** Wat voor mail is dit? 'lijst' (met de link), 'bevestiging', 'andere-nieuwsbrief' of 'onbekend'. */
export function herkenMail(mail) {
  const adres = adresUit(mail.van);
  if (adres === GMAIL_BEVESTIGING) return { soort: 'bevestiging' };
  if (!ONDERWERP.test(mail.onderwerp) && BEVESTIGING.test(mail.onderwerp)) return { soort: 'bevestiging' };
  if (adres !== AFZENDER) return { soort: 'onbekend', adres };
  if (!ONDERWERP.test(mail.onderwerp)) return { soort: 'andere-nieuwsbrief' };

  // Eerst de tekstversie: in de HTML maakt Mailchimp er een trackinglink van.
  const delen = [...mail.tekstdelen].sort(
    (a, b) => (a.type === 'text/plain' ? 0 : 1) - (b.type === 'text/plain' ? 0 : 1)
  );
  for (const d of delen) {
    const link = d.tekst.replace(/&amp;/g, '&').match(LINK)?.[0];
    if (link) return { soort: 'lijst', link };
  }
  // Geen link: een lege lijst, als de tekst dat zegt. De HTML-versie zonder
  // tags en harde spaties, zodat een regelbreuk of <br> de zin niet breekt.
  const tekst = mail.tekstdelen
    .map((d) => d.tekst.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' '))
    .join(' ');
  return { soort: 'lijst', link: null, leeg: LEEG.some((r) => r.test(tekst)) };
}

/**
 * Rijen uit het werkblad naar wedstrijden. Gooit een fout met een leesbare
 * reden als het bestand niet de verwachte vorm heeft.
 *
 * Officials staan er nooit met naam in: een cel die anders gekleurd is dan de
 * datumcel van dezelfde rij, betekent dat daar iemand is aangeduid. Met de
 * eigen rij vergelijken in plaats van één vaste kleur te verwachten: kiest de
 * bond ooit een ander grijs, dan blijft dit werken, en kleurt ze hele rijen
 * in, dan telt dat niet ten onrechte als een official.
 */
export function leesLijst(rijen) {
  const kopRij = rijen.findIndex((r) => r.some((c) => naamSleutel(c?.waarde) === KOLOMMEN.thuis));
  if (kopRij < 0) throw new Error("Geen kolom 'Thuis ploeg' gevonden: het bestand heeft een andere vorm.");

  const kop = rijen[kopRij].map((c) => naamSleutel(c?.waarde));
  const kolom = {};
  for (const [sleutel, naam] of Object.entries(KOLOMMEN)) kolom[sleutel] = kop.indexOf(naam);
  const ontbreekt = Object.entries(kolom)
    .filter(([, i]) => i < 0)
    .map(([s]) => `'${KOLOMMEN[s]}'`);
  if (ontbreekt.length) {
    throw new Error(`Kolom(men) ${ontbreekt.join(', ')} ontbreken: het bestand heeft een andere vorm.`);
  }

  const wedstrijden = [];
  const onleesbaar = [];
  for (const rij of rijen.slice(kopRij + 1)) {
    const cel = (s) => rij[kolom[s]] ?? { waarde: '', kleur: null };
    if (!cel('thuis').waarde && !cel('datum').waarde) continue; // lege rij

    const datum = lijstDatum(cel('datum').waarde);
    const uur = lijstUur(cel('tijd').waarde);
    if (!datum || !uur || !cel('thuis').waarde) {
      onleesbaar.push(rij.map((c) => c?.waarde ?? '').join(' | '));
      continue;
    }

    const rijKleur = cel('datum').kleur;
    const aangeduid = (c) => Boolean(c.waarde) || (c.kleur !== null && c.kleur !== rijKleur);
    wedstrijden.push({
      datum,
      uur,
      thuis: cel('thuis').waarde,
      uit: cel('uit').waarde,
      reeks: cel('reeks').waarde,
      officials: (aangeduid(cel('official1')) ? 1 : 0) + (aangeduid(cel('official2')) ? 1 : 0),
    });
  }

  if (wedstrijden.length === 0) throw new Error('Het bestand bevat geen enkele leesbare wedstrijd.');
  // Een paar rare rijen kan; als het er veel zijn, is er iets fundamenteel anders.
  if (onleesbaar.length > Math.max(3, wedstrijden.length * 0.1)) {
    throw new Error(`${onleesbaar.length} rijen hebben geen leesbare datum of tijd: het bestand heeft een andere vorm.`);
  }
  return { wedstrijden, onleesbaar };
}

/**
 * De lijst koppelen aan de eigen thuiswedstrijden.
 *
 * 'Eigen' is: de thuisploeg komt voor bij de thuiswedstrijden van de club. De
 * Excel bevat heel Vlaanderen, ook wedstrijden waar wij uitploeg zijn — daar
 * zorgt de thuisclub voor officials, dus die doen niet mee.
 *
 * @param {object[]} lijst   uit leesLijst
 * @param {object[]} eigen   {id, datum, uur, thuis_naam, poule_naam}
 */
export function koppel(lijst, eigen) {
  const ploegen = new Set(eigen.map((m) => naamSleutel(m.thuis_naam)));
  const opSleutel = new Map(eigen.map((m) => [`${naamSleutel(m.thuis_naam)}|${m.datum}|${m.uur}`, m]));

  const gekoppeld = [];
  const nietGekoppeld = [];
  const reeksAfwijking = [];
  for (const w of lijst) {
    const ploeg = naamSleutel(w.thuis);
    if (!ploegen.has(ploeg)) continue;
    const m = opSleutel.get(`${ploeg}|${w.datum}|${w.uur}`);
    if (!m) {
      nietGekoppeld.push(w);
      continue;
    }
    gekoppeld.push({ id: m.id, officials: w.officials });
    if (w.reeks && m.poule_naam && naamSleutel(w.reeks) !== naamSleutel(m.poule_naam)) {
      reeksAfwijking.push({ datum: w.datum, uur: w.uur, thuis: w.thuis, lijst: w.reeks, app: m.poule_naam });
    }
  }
  return { gekoppeld, nietGekoppeld, reeksAfwijking };
}

/**
 * De lijst koppelen aan de wedstrijden van de gevolgde clubs (Regio).
 *
 * Dezelfde regel: in de lijst = 0 of 1 official; niet in de lijst = 2 volgens
 * de bond. Bewaard per GUID, en enkel voor de rijen die er bij ontvangst
 * waren: een club die pas later gevolgd wordt, is niet tegen de lijst gelegd
 * en mag dus geen '2' krijgen.
 */
export function koppelVolg(lijst, volgRijen, van, tot) {
  const { gekoppeld, nietGekoppeld } = koppel(
    lijst,
    volgRijen.map((v) => ({ ...v, id: v.guid }))
  );
  const inLijst = new Map(gekoppeld.map((g) => [g.id, g.officials]));
  const officials = volgRijen
    .filter((m) => m.datum >= van && m.datum <= tot)
    .map((m) => ({ guid: m.guid, officials: inLijst.has(m.guid) ? inLijst.get(m.guid) : 2 }));
  return { officials, nietGekoppeld };
}

// ---------------------------------------------------------------------------
// Tijd: wanneer mag een lijst meteen verwerkt worden?
// ---------------------------------------------------------------------------

function brussel(nu) {
  const d = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    })
      .formatToParts(nu)
      .map((p) => [p.type, p.value])
  );
  return { datum: `${d.year}-${d.month}-${d.day}`, uur: Number(d.hour) % 24 };
}

/** De woensdag vóór een weekend dat op 'van' begint (vr, za of zo). */
export function woensdagVoor(van) {
  const d = new Date(`${van}T00:00:00Z`);
  const terug = (d.getUTCDay() + 4) % 7;
  return new Date(d.getTime() - terug * 86400000).toISOString().slice(0, 10);
}

/** Is het moment van de woensdagregel (woensdag 14 uur, Brussel) al voorbij? */
export function voorbijMoment(van, nu) {
  const woensdag = woensdagVoor(van);
  const b = brussel(nu);
  return b.datum > woensdag || (b.datum === woensdag && b.uur >= 14);
}

// ---------------------------------------------------------------------------
// Ontvangen en verwerken.
// ---------------------------------------------------------------------------

async function meldBeheerders(ctx, bericht) {
  await verwittigAllen(ctx, await beheerders(ctx.db), bericht);
}

async function logLijst(db, wat, details) {
  await logSchrijf(db, { soort: 'officials', wat: `woensdaglijst: ${wat}`, details });
}

async function seizoenVan(ctx) {
  return ctx.seizoen?.code ?? (await actiefSeizoen(ctx.db))?.code ?? null;
}

/** De eigen thuiswedstrijden vanaf U14: daaruit volgt welke ploegen 'van ons' zijn. */
async function eigenWedstrijden(db, seizoen) {
  if (!seizoen) return [];
  const r = await db
    .prepare(
      `SELECT w.id, w.datum, w.begin AS uur, t.naam AS thuis_naam, o.poule_naam
         ${EIGEN_VANAF_U14} AND w.bron = 'vbl'`
    )
    .bind(seizoen)
    .all();
  return r.results ?? [];
}

async function volgWedstrijden(db) {
  const r = await db.prepare(`SELECT guid, datum, uur, thuis_naam FROM officials_volg_wedstrijden`).all();
  return r.results ?? [];
}

/**
 * Een binnenkomende mail. Gooit nooit: een geweigerde mail kaatst terug naar
 * de afzender, en dat is de bond of Gmail.
 *
 * @param {{db, env}} ctx
 * @param {string} raw   de volledige mail
 * @param {{naar?: string, nu?: Date}} [opties]
 */
export async function ontvangMail(ctx, raw, { naar = '', nu = new Date() } = {}) {
  const { db } = ctx;
  let mail;
  try {
    mail = leesMail(raw);
  } catch (err) {
    await logLijst(db, 'mail genegeerd', `onleesbare mail: ${err.message}`);
    return { soort: 'onleesbaar' };
  }
  const herkend = herkenMail(mail);

  if (herkend.soort === 'bevestiging') {
    // Gmail (doorsturen) of Mailchimp (inschrijving) vraagt een bevestiging.
    // Het adres is geen mailbox: zonder deze stap raakt niemand aan de link.
    const inhoud =
      mail.tekstdelen.find((d) => d.type === 'text/plain')?.tekst ??
      (mail.tekstdelen[0]?.tekst ?? '').replace(/<[^>]+>/g, ' ');
    const adres = naar || 'het adres van de app';
    await meldBeheerders(ctx, {
      kort: `Bevestiging gevraagd: ${mail.onderwerp}`.slice(0, 200),
      onderwerp: `Bevestiging gevraagd voor ${adres}: ${mail.onderwerp}`,
      tekst:
        `Hallo,\n\n${mail.van} vraagt een bevestiging voor ${adres}. Hieronder de ` +
        `mail zoals ze binnenkwam; klik op de link of vul de code in.\n\n` +
        `${inhoud.replace(/\n{3,}/g, '\n\n').trim()}`,
    });
    await logLijst(db, 'bevestiging doorgestuurd', `${adresUit(mail.van)}: ${mail.onderwerp}`);
    return { soort: herkend.soort };
  }

  if (herkend.soort !== 'lijst') {
    await logLijst(
      db,
      'mail genegeerd',
      `${herkend.soort === 'onbekend' ? `afzender ${herkend.adres}` : 'andere nieuwsbrief'}: ${mail.onderwerp}`
    );
    return { soort: herkend.soort };
  }

  const fout = async (reden) => {
    await db
      .prepare(`INSERT INTO officials_vbl_lijsten (onderwerp, bestand, status, fout) VALUES (?, ?, 'fout', ?)`)
      .bind(mail.onderwerp, herkend.link, reden)
      .run();
    await meldBeheerders(ctx, tekstLijstFout({ reden, onderwerp: mail.onderwerp }));
    await logLijst(db, 'niet verwerkt', reden);
    return { soort: 'fout', reden };
  };

  let lijst;
  if (!herkend.link && herkend.leeg) {
    // Geen enkele wedstrijd zonder officials: een lege lijst, die verder
    // loopt zoals elke andere — niets erbij, en elke eigen thuiswedstrijd van
    // het weekend krijgt 'de bond voorziet twee'.
    lijst = { wedstrijden: [], onleesbaar: [] };
  } else if (!herkend.link) {
    return fout('Geen link naar een Excel-bestand gevonden in de mail.');
  } else {
    try {
      const res = await fetch(herkend.link);
      if (!res.ok) return fout(`Het Excel-bestand kon niet opgehaald worden (HTTP ${res.status}).`);
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_BESTAND) return fout('Het Excel-bestand is onverwacht groot.');
      lijst = leesLijst((await leesXlsx(buffer)).rijen);
    } catch (err) {
      return fout(err.message);
    }
  }

  // Het weekend is altijd minstens zaterdag en zondag, ook als de lijst maar
  // over één dag gaat: een wedstrijd op de andere dag staat er dan niet in
  // omdat de bond er twee voorziet, niet omdat ze buiten de lijst valt.
  // Een lege lijst heeft geen datums: dan het weekend dat op de mail volgt.
  let van;
  let tot;
  if (lijst.wedstrijden.length) {
    const datums = lijst.wedstrijden.map((w) => w.datum).sort();
    const woensdag = new Date(`${woensdagVoor(datums[0])}T00:00:00Z`);
    const za = new Date(woensdag.getTime() + 3 * 86400000).toISOString().slice(0, 10);
    const zo = new Date(woensdag.getTime() + 4 * 86400000).toISOString().slice(0, 10);
    van = datums[0] < za ? datums[0] : za;
    tot = datums[datums.length - 1] > zo ? datums[datums.length - 1] : zo;
  } else {
    [van, tot] = komendWeekend(nu);
  }
  const vandaag = nu.toISOString().slice(0, 10);
  if (tot < vandaag) return fout(`De lijst gaat over ${van} tot ${tot}, en dat is voorbij.`);

  // Rechtstreeks én doorgestuurd kan allebei: wat het eerst binnenkomt, telt.
  const bestaand = await db
    .prepare(`SELECT id FROM officials_vbl_lijsten WHERE weekend_van = ? AND status IN ('ontvangen', 'verwerkt')`)
    .bind(van)
    .first();
  if (bestaand) {
    await db
      .prepare(
        `INSERT INTO officials_vbl_lijsten (onderwerp, bestand, weekend_van, weekend_tot, aantal_rijen, status)
         VALUES (?, ?, ?, ?, ?, 'dubbel')`
      )
      .bind(mail.onderwerp, herkend.link, van, tot, lijst.wedstrijden.length)
      .run();
    await logLijst(db, 'dubbel ontvangen', `${van} tot ${tot}: genegeerd`);
    return { soort: 'dubbel' };
  }

  const seizoen = await seizoenVan(ctx);
  const { gekoppeld, nietGekoppeld, reeksAfwijking } = koppel(lijst.wedstrijden, await eigenWedstrijden(db, seizoen));
  const volg = koppelVolg(lijst.wedstrijden, await volgWedstrijden(db), van, tot);
  const ingevoegd = await db
    .prepare(
      `INSERT INTO officials_vbl_lijsten (onderwerp, bestand, weekend_van, weekend_tot, aantal_rijen,
                                          eigen, meldingen, volg, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ontvangen') RETURNING id`
    )
    .bind(
      mail.onderwerp,
      herkend.link,
      van,
      tot,
      lijst.wedstrijden.length,
      JSON.stringify(gekoppeld),
      JSON.stringify({ nietGekoppeld, reeksAfwijking, onleesbaar: lijst.onleesbaar }),
      JSON.stringify(volg)
    )
    .first();

  await logLijst(db, 'ontvangen', `${van} tot ${tot}: ${lijst.wedstrijden.length} wedstrijden, ${gekoppeld.length} eigen`);

  if (!voorbijMoment(van, nu)) return { soort: 'ontvangen', id: ingevoegd.id };
  return { soort: 'verwerkt', id: ingevoegd.id, resultaat: await verwerkLijst(ctx, ingevoegd.id, nu) };
}

/**
 * Een bewaarde lijst toepassen op de aanduidingslijst.
 *
 * - In de lijst: in de aanduidingslijst (tenzij een beheerder ze er bewust
 *   uithaalde), met het aantal officials volgens de bond.
 * - Niet in de lijst: de bond voorziet twee. Stond ze er automatisch in, dan
 *   eruit — behalve als er al iemand van de club op staat: dan laten staan en
 *   melden. Nooit stil iets weghalen waar iemand op staat.
 */
export async function verwerkLijst(ctx, lijstId, nu = new Date()) {
  const { db } = ctx;
  const lijst = await db.prepare(`SELECT * FROM officials_vbl_lijsten WHERE id = ?`).bind(lijstId).first();
  const bond = new Map(JSON.parse(lijst.eigen ?? '[]').map((g) => [g.id, g.officials]));
  const meldingen = JSON.parse(lijst.meldingen ?? '{}');
  // Een lijst zonder Regio-koppeling laat Regio op de API, in plaats van
  // alles op '2' te zetten.
  const volg = JSON.parse(lijst.volg ?? 'null');
  const seizoen = await seizoenVan(ctx);

  const k = seizoen
    ? await db
        .prepare(
          `SELECT w.id, w.datum, w.begin AS uur, t.naam AS thuis, w.tegenstander AS uit, w.locatie_tekst AS locatie,
                  o.off_aantal, o.scope, o.scope_uit, o.scope_reden, o.cat_code, c.label AS cat_label,
                  (SELECT COUNT(*) FROM officials_aanduidingen a
                    WHERE a.wedstrijd_id = w.id AND a.status = 'toegewezen') AS bezet
             ${EIGEN_VANAF_U14}
              AND w.bron = 'vbl' AND o.forfait IS NULL
              AND w.datum BETWEEN ? AND ?
            ORDER BY w.datum, w.begin, t.naam`
        )
        .bind(seizoen, lijst.weekend_van, lijst.weekend_tot)
        .all()
    : { results: [] };

  const r = {
    van: lijst.weekend_van,
    tot: lijst.weekend_tot,
    aantalRijen: lijst.aantal_rijen,
    aantalEigen: bond.size,
    toegevoegd: [],
    uitGehaald: [],
    blijftStaan: [],
    afwijkingA: [],
    afwijkingB: [],
    nietGekoppeld: meldingen.nietGekoppeld ?? [],
    reeksAfwijking: meldingen.reeksAfwijking ?? [],
    regioInLijst: (volg?.officials ?? []).filter((v) => v.officials < 2).length,
    regioNietGekoppeld: volg?.nietGekoppeld ?? [],
  };

  const opdrachten = [];
  const nuIso = nu.toISOString();
  for (const m of k.results ?? []) {
    const w = {
      id: m.id, datum: m.datum, uur: m.uur, thuis: m.thuis, uit: m.uit, locatie: m.locatie,
      catCode: m.cat_code, catLabel: m.cat_label,
    };
    const officialsBond = bond.has(m.id) ? bond.get(m.id) : 2;
    opdrachten.push(
      db.prepare(`UPDATE officials_wedstrijd SET bond_officials = ? WHERE wedstrijd_id = ?`).bind(officialsBond, m.id)
    );

    if (bond.has(m.id)) {
      if (m.off_aantal > officialsBond) r.afwijkingB.push({ ...w, api: m.off_aantal, bond: officialsBond });
      if (!m.scope && !m.scope_uit) {
        opdrachten.push(
          // Dezelfde reden als de woensdagregel: inhoudelijk ís dit de
          // woensdagregel, en een nieuwe waarde zou de CHECK op scope_reden
          // wijzigen — een heropbouw van officials_wedstrijd.
          db
            .prepare(`UPDATE officials_wedstrijd SET scope = 1, scope_reden = 'woensdag', scope_op = ? WHERE wedstrijd_id = ?`)
            .bind(nuIso, m.id)
        );
        r.toegevoegd.push({ ...w, nogNodig: aantalNodig(m.off_aantal, { bondOfficials: officialsBond }) });
      }
      continue;
    }

    if (m.off_aantal < 2) r.afwijkingA.push(w);
    // Enkel wat er automatisch in kwam; wat een beheerder er zelf in zette,
    // blijft zijn beslissing.
    if (m.scope && m.scope_reden === 'woensdag') {
      if (m.bezet > 0) {
        r.blijftStaan.push(w);
      } else {
        opdrachten.push(
          db
            .prepare(`UPDATE officials_wedstrijd SET scope = 0, scope_reden = NULL, scope_op = ? WHERE wedstrijd_id = ?`)
            .bind(nuIso, m.id)
        );
        r.uitGehaald.push(w);
      }
    }
  }

  for (const v of volg?.officials ?? []) {
    opdrachten.push(
      db.prepare(`UPDATE officials_volg_wedstrijden SET bond_officials = ? WHERE guid = ?`).bind(v.officials, v.guid)
    );
  }
  opdrachten.push(
    db.prepare(`UPDATE officials_vbl_lijsten SET status = 'verwerkt', verwerkt_op = ? WHERE id = ?`).bind(nuIso, lijstId)
  );
  await db.batch(opdrachten);

  await logLijst(
    db,
    'verwerkt',
    `${r.van} tot ${r.tot}: ${r.toegevoegd.length} toegevoegd, ${r.uitGehaald.length} eruit, ` +
      `${r.afwijkingA.length + r.afwijkingB.length} afwijking(en)`
  );

  if (r.toegevoegd.length) {
    await verwittigAllen(ctx, await yoPlus(db), tekstWoensdagregel({ wedstrijden: r.toegevoegd, van: r.van, tot: r.tot }));
  }
  await meldBeheerders(ctx, tekstWoensdaglijstBeheer(r));
  return r;
}

/** De lijst voor het weekend dat op 'nu' volgt, als die er is. */
async function lijstVoor(db, nu) {
  const [zaterdag, zondag] = komendWeekend(nu);
  return db
    .prepare(
      `SELECT * FROM officials_vbl_lijsten
        WHERE status IN ('ontvangen', 'verwerkt') AND weekend_van <= ? AND weekend_tot >= ?
        ORDER BY id DESC LIMIT 1`
    )
    .bind(zondag, zaterdag)
    .first();
}

/** Woensdag 14 uur: verwerken, of melden dat de lijst er nog niet is. */
export async function woensdagOm14(ctx, nu = new Date()) {
  const lijst = await lijstVoor(ctx.db, nu);
  if (lijst?.status === 'ontvangen') return { soort: 'verwerkt', resultaat: await verwerkLijst(ctx, lijst.id, nu) };
  if (lijst?.status === 'verwerkt') return { soort: 'al-verwerkt' };

  const [van, tot] = komendWeekend(nu);
  await meldBeheerders(ctx, tekstLijstNietBinnen({ van, tot }));
  await logLijst(ctx.db, 'nog niet binnen', `${van} tot ${tot}, om 14 uur`);
  return { soort: 'niet-binnen' };
}

/** Woensdag 20 uur: nog altijd geen lijst, dan de woensdagregel met de API. */
export async function woensdagTerugval(ctx, nu = new Date()) {
  if (await lijstVoor(ctx.db, nu)) return { soort: 'niet-nodig' };
  const seizoen = await seizoenVan(ctx);
  if (!seizoen) return { soort: 'geen-seizoen' };

  const r = await pasWoensdagregelToe(ctx.db, seizoen, nu);
  if (r.gescoopt > 0) await verwittigAllen(ctx, await yoPlus(ctx.db), tekstWoensdagregel(r));
  await meldBeheerders(ctx, tekstTerugval(r));
  await logLijst(ctx.db, 'terugval op de API', `${r.van} tot ${r.tot}: ${r.gescoopt} in de lijst gezet`);
  return { soort: 'terugval', resultaat: r };
}

/** Elke avond 20 uur: wat via de woensdagregel in de lijst kwam, heeft intussen twee refs van de bond. */
export async function avondcontrole(ctx, nu = new Date()) {
  const seizoen = await seizoenVan(ctx);
  if (!seizoen) return { overbodig: [] };
  const overbodig = await zoekOverbodigeScope(ctx.db, seizoen, nu.toISOString().slice(0, 10));
  if (overbodig.length) await meldBeheerders(ctx, tekstAvondcontrole({ wedstrijden: overbodig }));
  return { overbodig };
}
