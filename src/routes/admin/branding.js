// Clubkleur en logo: een voorstel ophalen bij de bond.
//
// Dit schrijft nooit rechtstreeks naar de instellingen. Het levert enkel een
// voorstel, met de ruwe waarde erbij, zodat een beheerder ziet wat de bond
// werkelijk teruggeeft vóór hij het overneemt — precies zoals bij het
// synchroniseren van ploegen en leden. Het patroon van de logo-URL is niet uit
// de officiële documentatie bevestigd; de shirtkleur is geen gegarandeerde
// hexwaarde. Beide worden dus getoond, niet opgelegd.

import { json, fout } from '../../lib/http.js';
import { haalVbl, orgDetailUrl, teamDetailUrl, clubLogoUrl, zoekShirtkleur, zoekPloegGuids } from '../../lib/vbl.js';
import { geldigeHex, keurAccentkleurGoed } from '../../lib/kleur.js';
import { logSchrijf } from '../../lib/logboek.js';

async function clubGuid(db) {
  const rij = await db.prepare(`SELECT waarde FROM instellingen WHERE sleutel = 'club_guid'`).first();
  return rij?.waarde || 'BVBL1125';
}

export async function brandingVoorstel(ctx) {
  const { db, persoon } = ctx;
  const club = await clubGuid(db);

  const voorstel = {
    club_guid: club,
    logo_url: clubLogoUrl(club, true),
    logo_url_groot: clubLogoUrl(club, false),
    logo_url_geverifieerd: false, // zie de aantekening bovenaan dit bestand
  };

  // De shirtkleur staat niet bevestigd op OrgDetailByGuid; we proberen het en
  // vallen anders terug op de eerste gevolgde ploeg via TeamDetailByGuid, waar
  // het veld wél bevestigd is voorgekomen.
  try {
    const org = await haalVbl(orgDetailUrl(club));
    let kleuren = zoekShirtkleur(org);

    if (!kleuren.shirt_kleur) {
      const ploegGuids = zoekPloegGuids(org, club);
      if (ploegGuids.length) {
        const teamData = await haalVbl(teamDetailUrl(ploegGuids[0]));
        kleuren = zoekShirtkleur(teamData);
        voorstel.shirtkleur_bron_ploeg = ploegGuids[0];
      }
    }

    voorstel.shirt_kleur_ruw = kleuren.shirt_kleur;
    voorstel.shirt_reserve_ruw = kleuren.shirt_reserve;
    voorstel.shirt_kleur_bruikbaar = geldigeHex(kleuren.shirt_kleur)
      ? keurAccentkleurGoed(kleuren.shirt_kleur)
      : { ok: false, reden: 'geen hexwaarde ontvangen van de bond' };
  } catch (e) {
    voorstel.fout = `shirtkleur ophalen mislukt: ${e.message}`;
  }

  await logSchrijf(db, { soort: 'beheer', wie: persoon.id, wat: 'brandingvoorstel opgevraagd', details: club });
  return json(voorstel);
}

/**
 * Publieke route: de huisstijl die het aanmeldscherm al kan tonen, vóór
 * iemand ingelogd is. Enkel wat op het scherm zelf komt, nooit gevoelige
 * gegevens — dezelfde grens als bij /api/config.
 */
export async function brandingTonen(ctx) {
  const { db } = ctx;
  const rijen = await db
    .prepare(
      `SELECT sleutel, waarde FROM instellingen
        WHERE sleutel IN ('clubnaam', 'clubkleur_accent', 'clublogo_url')`
    )
    .all();
  const gevonden = Object.fromEntries((rijen.results ?? []).map((r) => [r.sleutel, r.waarde]));
  return json({
    clubnaam: gevonden.clubnaam || '',
    kleur_accent: geldigeHex(gevonden.clubkleur_accent) ? gevonden.clubkleur_accent : null,
    logo_url: gevonden.clublogo_url || null,
  });
}
