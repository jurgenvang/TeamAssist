// Periodes: vakanties en examens, per seizoen.

import { json, fout, leesJson } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';
import { haalVakanties, naarPeriodes } from '../../lib/vakanties.js';

// Nog te bevestigen tegen de echte API welke subdivisiecode Vlaanderen precies
// draagt (zie backlog, punt U3) — vandaar de diagnoseroute hieronder.
const SUBDIVISIE_VLAANDEREN = 'BE-VLG';

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
  if (soort && !['vakantie', 'examens'].includes(soort)) return fout(400, 'onbekend soort');
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
 * Haalt de schoolvakanties van het seizoen op en zet ze weg.
 *
 * Een periode met bron 'club' wordt nooit overschreven — dat is de plek waar
 * een club afwijkt (een facultatieve dag, een vakantie die voor de eigen leden
 * niet telt) en die keuze blijft staan.
 */
export async function vakantiesSync(ctx) {
  const { db, persoon, request, seizoen } = ctx;
  const url = new URL(request.url);
  const uitvoeren = url.searchParams.get('uitvoeren') === '1';

  const jaar = Number(seizoen.code.slice(0, 4));
  const van = `${jaar}-08-01`;
  const tot = `${jaar + 1}-06-30`;

  let antwoord;
  try {
    antwoord = await haalVakanties(van, tot, SUBDIVISIE_VLAANDEREN);
  } catch (e) {
    await logSchrijf(db, {
      soort: 'fout',
      wie: persoon.id,
      wat: 'vakanties ophalen mislukt',
      details: e.message,
      afgehandeld: 0,
    });
    return fout(502, `OpenHolidays antwoordde niet bruikbaar: ${e.message}`);
  }

  const opgehaald = naarPeriodes(antwoord, seizoen.code);
  const bestaand = await db
    .prepare(`SELECT * FROM periodes WHERE seizoen = ? AND bron = 'openholidays'`)
    .bind(seizoen.code)
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
    wat: 'vakanties opgehaald',
    details: `${nieuw.length} nieuw, ${ongewijzigd.length} ongewijzigd van ${opgehaald.length} gevonden`,
  });

  return json({ droogloop: false, gevonden: opgehaald.length, nieuw: nieuw.length, ongewijzigd: ongewijzigd.length });
}
