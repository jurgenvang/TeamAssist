// Periodes: vakanties en examens, per seizoen.

import { json, fout, leesJson } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';
import { haalVakanties, naarPeriodes, haalFeestdagen, naarFeestdagPeriodes } from '../../lib/vakanties.js';

// Nog te bevestigen tegen de echte API welke subdivisiecode Vlaanderen precies
// draagt (zie backlog, punt AA) — vandaar de diagnoseroute hieronder.
//
// België werkt niet met gewone ISO-subdivisies maar met `groups` — bevestigd
// via GET /Groups?countryIsoCode=BE: BE-NL (Vlaamse gemeenschap), BE-FR,
// BE-DE. En een groepscode gaat via een eigen parameter, `groupCode`, niet via
// `subdivisionCode` — bevestigd via de officiële OpenAPI-specificatie
// (openholidaysapi.org/swagger/v1/swagger.json). Beide fouten zaten aanvankelijk
// in de code: eerst de niet-bestaande waarde 'BE-VLG' via subdivisionCode
// (0.8.0), toen de juiste waarde 'BE-NL' nog steeds via de verkeerde
// parameter (0.11.1).
const GROEPSCODE_VLAANDEREN = 'BE-NL';

export async function periodesTonen(ctx) {
  const { db, seizoen } = ctx;
  const rijen = await db
    .prepare(`SELECT * FROM periodes WHERE seizoen = ? ORDER BY van`)
    .bind(seizoen.code)
    .all();
  return json({ periodes: rijen.results ?? [] });
}

export async function periodeAanmaken(ctx) {
  const { db, persoon, request, seizoen } = ctx;
  const body = await leesJson(request);
  const { naam, van, tot, soort, doelgroep } = body ?? {};

  if (!naam || !van || !tot) return fout(400, 'naam, van en tot zijn verplicht');
  if (tot < van) return fout(400, 'tot moet na van liggen');
  if (soort && !['vakantie', 'examens', 'feestdag'].includes(soort)) return fout(400, 'onbekend soort');
  if (doelgroep && !['iedereen', 'secundair', 'hoger'].includes(doelgroep)) {
    return fout(400, 'onbekende doelgroep');
  }

  const uit = await db
    .prepare(
      `INSERT INTO periodes (seizoen, naam, van, tot, soort, doelgroep, bron)
            VALUES (?, ?, ?, ?, ?, ?, 'club')`
    )
    .bind(seizoen.code, naam, van, tot, soort || 'vakantie', doelgroep || 'iedereen')
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: 'periode aangemaakt',
    details: `${naam}: ${van} tot ${tot}`,
  });
  return json({ id: uit.meta.last_row_id });
}

export async function periodeVerwijderen(ctx) {
  const { db, persoon, request } = ctx;
  const body = await leesJson(request);
  const id = body?.id;
  if (!id) return fout(400, 'id ontbreekt');

  // Enkel periodes met bron 'club' zijn hier weg te halen. Een opgehaalde
  // periode verdwijnt vanzelf bij de volgende synchronisatie als ze niet meer
  // in het antwoord van de bron zit — met de hand wissen zou de volgende
  // ophaling gewoon terugzetten en de indruk van een echte verwijdering geven.
  const rij = await db.prepare(`SELECT bron FROM periodes WHERE id = ?`).bind(id).first();
  if (!rij) return fout(404, 'die periode bestaat niet');
  if (rij.bron !== 'club') return fout(400, 'een opgehaalde periode verwijder je niet hier — corrigeer ze in de plaats');

  await db.prepare(`DELETE FROM periodes WHERE id = ?`).bind(id).run();
  await logSchrijf(db, { soort: 'beheer', wie: persoon.id, wat: 'periode verwijderd', details: String(id) });
  return json({ id });
}

/**
 * Gedeelde kern van de vakantie- en feestdagensynchronisatie: ophalen,
 * vergelijken met wat er al staat (enkel binnen hetzelfde `soort`, zodat een
 * feestdag nooit per ongeluk tegen een vakantie met dezelfde startdatum
 * vergeleken wordt), en bij uitvoeren wegschrijven. Een periode met bron
 * 'club' wordt nooit overschreven.
 */
async function synchroniseerPeriodes(ctx, { soort, ophalen, omzetten, foutlabel }) {
  const { db, persoon, request, seizoen } = ctx;
  const url = new URL(request.url);
  const uitvoeren = url.searchParams.get('uitvoeren') === '1';

  const jaar = Number(seizoen.code.slice(0, 4));
  const van = `${jaar}-08-01`;
  const tot = `${jaar + 1}-06-30`;

  let antwoord;
  try {
    antwoord = await ophalen(van, tot);
  } catch (e) {
    await logSchrijf(db, {
      soort: 'fout',
      wie: persoon.id,
      wat: `${foutlabel} ophalen mislukt`,
      details: e.message,
      afgehandeld: 0,
    });
    return fout(502, `OpenHolidays antwoordde niet bruikbaar: ${e.message}`);
  }

  const opgehaald = omzetten(antwoord, seizoen.code);
  const bestaand = await db
    .prepare(`SELECT * FROM periodes WHERE seizoen = ? AND bron = 'openholidays' AND soort = ?`)
    .bind(seizoen.code, soort)
    .all();
  const bestaandOpVan = new Map((bestaand.results ?? []).map((p) => [p.van, p]));

  const nieuw = opgehaald.filter((p) => !bestaandOpVan.has(p.van));
  const ongewijzigd = opgehaald.filter((p) => {
    const b = bestaandOpVan.get(p.van);
    return b && b.tot === p.tot && b.naam === p.naam;
  });

  if (!uitvoeren) {
    return json({ droogloop: true, gevonden: opgehaald.length, nieuw: nieuw.length, ongewijzigd: ongewijzigd.length });
  }

  for (const p of nieuw) {
    await db
      .prepare(
        `INSERT INTO periodes (seizoen, naam, van, tot, soort, doelgroep, bron)
              VALUES (?, ?, ?, ?, ?, ?, 'openholidays')`
      )
      .bind(p.seizoen, p.naam, p.van, p.tot, p.soort, p.doelgroep)
      .run();
  }

  await logSchrijf(db, {
    soort: 'sync',
    wie: persoon.id,
    wat: `${foutlabel} opgehaald`,
    details: `${nieuw.length} nieuw, ${ongewijzigd.length} ongewijzigd van ${opgehaald.length} gevonden`,
  });

  return json({ droogloop: false, gevonden: opgehaald.length, nieuw: nieuw.length, ongewijzigd: ongewijzigd.length });
}

/**
 * Haalt de schoolvakanties van het seizoen op en zet ze weg.
 *
 * Een periode met bron 'club' wordt nooit overschreven — dat is de plek waar
 * een club afwijkt (een facultatieve dag, een vakantie die voor de eigen leden
 * niet telt) en die keuze blijft staan.
 */
export async function vakantiesSync(ctx) {
  return synchroniseerPeriodes(ctx, {
    soort: 'vakantie',
    ophalen: (van, tot) => haalVakanties(van, tot, { groepscode: GROEPSCODE_VLAANDEREN }),
    omzetten: naarPeriodes,
    foutlabel: 'vakanties',
  });
}

/**
 * Haalt de Belgische feestdagen van het seizoen op en zet ze weg. Zelfde
 * bron-bescherming als bij vakanties: een feestdag die de club zelf al
 * aanpaste (bijvoorbeeld een andere naam), blijft ongemoeid.
 *
 * Nog niet rechtstreeks bevestigd via de sandbox — zie feestdagUrl() in
 * vakanties.js voor de details. Draai eerst een droogloop.
 */
export async function feestdagenSync(ctx) {
  return synchroniseerPeriodes(ctx, {
    soort: 'feestdag',
    ophalen: (van, tot) => haalFeestdagen(van, tot),
    omzetten: naarFeestdagPeriodes,
    foutlabel: 'feestdagen',
  });
}
