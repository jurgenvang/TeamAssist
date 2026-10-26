// Van buitenaf lezen (0.37.0, uit YOAssist `routes/extern.js`).
//
// Twee wegen, bewust apart ondanks dezelfde gegevens: een agenda-app kan geen
// header meesturen, dus zit de beveiliging van de agendafeed in de URL zelf
// (een lange, willekeurige sleutel per persoon). Een JSON-afnemer kan dat wel,
// dus daar een gewone Authorization-header met de secret EXTERN_API_SLEUTEL.
// Beide alleen-lezen: er is hier geen enkel schrijfpad.
//
// De bestaande agenda-abonnementen van YOAssist blijven werken: de migratie
// neemt `agenda_sleutel` ongewijzigd over, en yoassist.org blijft
// /api/kalender/ en /api/extern/ rechtstreeks bedienen (index.js).

import { json, fout } from '../lib/http.js';
import { instellingLezen } from '../routes/admin/instellingen.js';
import { voorWie } from './routes.js';

/** 'Ann Aerts' → 'A.A.' */
export function initialen(voornaam, achternaam) {
  const v = (voornaam ?? '').trim()[0] ?? '';
  const a = (achternaam ?? '').trim()[0] ?? '';
  return `${v}${v ? '.' : ''}${a}${a ? '.' : ''}`.toUpperCase() || '?';
}

/**
 * De komende wedstrijden in de lijst met wie erop staat. Gedeeld door de
 * JSON-route en de agendafeed, zodat beide altijd dezelfde stand tonen.
 */
async function komendeAanduidingen(db, { persoonId = null } = {}) {
  const r = await db
    .prepare(
      `SELECT w.id, w.wedstrijd_guid, w.datum, w.begin, w.tegenstander, w.locatie_tekst, t.naam AS ploeg,
              a.persoon_id, p.voornaam, p.achternaam
         FROM wedstrijden w
         JOIN officials_wedstrijd o ON o.wedstrijd_id = w.id
         JOIN teams t ON t.guid = w.team_guid AND t.seizoen = w.seizoen
         JOIN seizoenen s ON s.code = w.seizoen AND s.actief = 1
         LEFT JOIN officials_aanduidingen a ON a.wedstrijd_id = w.id AND a.status = 'toegewezen'
         LEFT JOIN personen p ON p.id = a.persoon_id
        WHERE w.bij_bond = 1 AND o.scope = 1 AND o.forfait IS NULL AND t.officials = 1 AND w.datum >= ?
        ORDER BY w.datum, w.begin, t.naam, p.voornaam`
    )
    .bind(new Date().toISOString().slice(0, 10))
    .all();
  const per = new Map();
  for (const x of r.results ?? []) {
    if (!per.has(x.id)) {
      per.set(x.id, {
        guid: x.wedstrijd_guid, datum: x.datum, uur: x.begin, thuis: x.ploeg, uit: x.tegenstander ?? '?',
        locatie: x.locatie_tekst, officials: [],
      });
    }
    if (x.persoon_id) per.get(x.id).officials.push({ id: x.persoon_id, voornaam: x.voornaam, achternaam: x.achternaam });
  }
  const lijst = [...per.values()];
  return persoonId ? lijst.filter((w) => w.officials.some((o) => o.id === persoonId)) : lijst;
}

/** Twee strings even lang gelijk, zonder vroeg te stoppen: geen timing-lek bij de sleutel. */
function gelijk(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i += 1) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return verschil === 0;
}

/** GET /api/extern/aanduidingen — Authorization: Bearer <EXTERN_API_SLEUTEL>. */
export async function externeAanduidingen({ db, env, request }) {
  const header = request.headers.get('Authorization') ?? '';
  const opgegeven = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!env.EXTERN_API_SLEUTEL || !gelijk(opgegeven, env.EXTERN_API_SLEUTEL)) return fout(401, 'ontbrekende of onjuiste sleutel');

  const volledig = (await instellingLezen(db, 'extern_namen', 'initialen')) === 'volledig';
  const club = await instellingLezen(db, 'clubnaam', '');
  const lijst = await komendeAanduidingen(db);
  return json({
    aantal: lijst.length,
    wedstrijden: lijst.map((w) => ({
      guid: w.guid,
      datum: w.datum,
      uur: w.uur,
      wedstrijd: `${w.thuis} - ${w.uit}`,
      locatie: w.locatie,
      club,
      officials: w.officials.map((o) => (volledig ? `${o.voornaam} ${o.achternaam}`.trim() : initialen(o.voornaam, o.achternaam))),
    })),
  });
}

const ics = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** 'jjjj-mm-dd' + 'uu:mm' als iCalendar-tijd in Brusselse lokale tijd (TZID). */
const lokaal = (datum, uur) => `${datum.replace(/-/g, '')}T${uur.replace(':', '')}00`;

function plusTweeUur(datum, uur) {
  const d = new Date(`${datum}T${uur}:00Z`);
  d.setUTCHours(d.getUTCHours() + 2);
  return lokaal(d.toISOString().slice(0, 10), d.toISOString().slice(11, 16));
}

/**
 * GET /api/kalender/<sleutel>.ics — de persoonlijke agenda.
 *
 * Enkel bevestigde aanduidingen: een agenda hoort te tonen wat vaststaat.
 * Elke ophaling bouwt de feed opnieuw op uit de databank, dus een vrijgave of
 * een verplaatste wedstrijd is er bij de volgende ophaling vanzelf in.
 *
 * Anders dan YOAssist met TZID=Europe/Brussels in plaats van de lokale tijd
 * als UTC: daar stond een wedstrijd een of twee uur verschoven in de agenda.
 */
export async function kalender({ db, request }) {
  const sleutel = new URL(request.url).pathname.replace(/^\/api\/kalender\//, '').replace(/\.ics$/, '');
  if (!/^[A-Za-z0-9_-]{16,}$/.test(sleutel)) return fout(404, 'deze agendalink is niet (meer) geldig');
  const p = await db.prepare(`SELECT id, voornaam FROM personen WHERE agenda_sleutel = ? AND actief = 1`).bind(sleutel).first();
  if (!p) return fout(404, 'deze agendalink is niet (meer) geldig');

  const nu = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const events = (await komendeAanduidingen(db, { persoonId: p.id })).map((w) =>
    [
      'BEGIN:VEVENT',
      // Dezelfde UID als in YOAssist: een overgezet abonnement ziet dezelfde
      // afspraak, geen dubbel.
      `UID:${w.guid}@yoassist.org`,
      `DTSTAMP:${nu}`,
      `DTSTART;TZID=Europe/Brussels:${lokaal(w.datum, w.uur)}`,
      `DTEND;TZID=Europe/Brussels:${plusTweeUur(w.datum, w.uur)}`,
      `SUMMARY:${ics(`${w.thuis} - ${w.uit}`)}`,
      w.locatie ? `LOCATION:${ics(w.locatie)}` : null,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ]
      .filter(Boolean)
      .join('\r\n')
  );
  const inhoud = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TeamAssist//officials//NL',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${ics(`Fluiten — ${p.voornaam}`)}`,
    'X-WR-TIMEZONE:Europe/Brussels',
    // Outlook leest TZID enkel met een VTIMEZONE erbij.
    'BEGIN:VTIMEZONE', 'TZID:Europe/Brussels',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
  return new Response(inhoud, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="fluiten.ics"',
      'cache-control': 'no-cache',
    },
  });
}

function nieuweSleutel() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * POST /api/officials/agenda  { namens?, vernieuw? } — de agendalink.
 *
 * Bestaat er al een sleutel, dan die (tenzij `vernieuw`: dan een nieuwe, en
 * de oude stopt te werken — voor wie de link per ongeluk doorstuurde). Een
 * ouder kan die van zijn kind opvragen, zoals hij ervoor invult.
 */
export async function agendaLink(ctx) {
  const { db } = ctx;
  const body = (await ctx.request.json().catch(() => null)) ?? {};
  const wie = await voorWie(ctx, body.namens);
  if (wie.fout) return wie.fout;
  if (!wie.rechten.mag('officials.opgeven')) return fout(403, 'geen Youth Official');

  const bestaand = await db.prepare(`SELECT agenda_sleutel FROM personen WHERE id = ?`).bind(wie.id).first('agenda_sleutel');
  let sleutel = bestaand;
  if (!bestaand || body.vernieuw === true) {
    sleutel = nieuweSleutel();
    await db.prepare(`UPDATE personen SET agenda_sleutel = ? WHERE id = ?`).bind(sleutel, wie.id).run();
  }
  return json({ pad: `/api/kalender/${sleutel}.ics`, vernieuwd: Boolean(bestaand && body.vernieuw === true) });
}
