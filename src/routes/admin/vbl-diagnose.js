// Een echte VBL-respons bekijken, vanuit de Worker.
//
// De ontwikkelomgeving en een kantoornetwerk achter een proxy raken niet bij
// vblcb.wisseq.eu; Cloudflare wel. Deze route is daarom de enige betrouwbare
// manier om te zien wat de bond werkelijk teruggeeft.
//
// Standaard komt er een samenvatting terug zonder namen: tellingen, de
// sleutelpaden, en een paar voorbeeldwaarden van velden waarvan het formaat nog
// niet vastligt. Dat volstaat om de openstaande vragen te beantwoorden zonder
// een ledenlijst van minderjarigen door een scherm te halen.
//
// Met ?ruw=1 komt het volledige antwoord mee. Dat is soms nodig, maar het staat
// niet voor niets achter een extra handeling, en het wordt gelogd.

import { json, fout } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';
import {
  haalVbl,
  orgDetailUrl,
  teamDetailUrl,
  vatPloegSamen,
  sleutelpaden,
  zoekPloegGuids,
} from '../../lib/vbl.js';

async function clubGuid(db) {
  const rij = await db.prepare(`SELECT waarde FROM instellingen WHERE sleutel = 'club_guid'`).first();
  return rij?.waarde || 'BVBL1125';
}

export async function vblDiagnose(ctx) {
  const { db, persoon, request } = ctx;
  const url = new URL(request.url);
  const team = url.searchParams.get('team');
  const ruw = url.searchParams.get('ruw') === '1';
  const club = await clubGuid(db);

  const doel = team ? teamDetailUrl(team) : orgDetailUrl(club);

  let data;
  try {
    data = await haalVbl(doel);
  } catch (e) {
    await logSchrijf(db, {
      soort: 'fout',
      wie: persoon.id,
      wat: 'vbl-diagnose mislukt',
      details: `${doel} — ${e.message}`,
    });
    return fout(502, `de bond antwoordde niet bruikbaar: ${e.message}`, { url: doel });
  }

  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: ruw ? 'vbl-diagnose ruw opgevraagd' : 'vbl-diagnose opgevraagd',
    details: team || club,
  });

  if (ruw) return json({ url: doel, ruw: data });

  if (!team) {
    return json({
      url: doel,
      club,
      ploegen: zoekPloegGuids(data, club),
      sleutelpaden: sleutelpaden(data),
    });
  }

  return json({ url: doel, team, ...vatPloegSamen(data) });
}
