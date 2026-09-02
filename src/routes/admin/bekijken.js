// Bekijken wat er binnengehaald is.
//
// Twee routes, allebei alleen-lezen. Ze bestaan in de eerste plaats om te
// kunnen nakijken of de synchronisatie deed wat ze moest — zonder scherm is
// dat enkel in de databankconsole te zien.
//
// Het rechtenmodel doet hier echt werk. Wie de ploeg begeleidt, mag de
// spelerslijst zien; adres en geboortedatum blijven voor ADMIN. Die tweede
// controle staat niet in de routetabel maar hier, want ze bepaalt niet óf je
// binnen mag maar hoeveel je te zien krijgt.

import { json, fout } from '../../lib/http.js';

const ZOEK_MAXIMUM = 50;

function ledenVeilig(rij, magPersoonsgegevens) {
  const uit = {
    id: rij.id,
    voornaam: rij.voornaam,
    achternaam: rij.achternaam,
    naam_vbl: rij.naam_vbl,
    naam_bron: rij.naam_bron,
    lid_nr: rij.lid_nr,
    bij_bond: rij.bij_bond,
  };
  if (magPersoonsgegevens) {
    uit.geboortedatum = rij.geboortedatum;
    uit.email = rij.email;
    uit.tel_gsm = rij.tel_gsm;
  }
  return uit;
}

export async function teamLeden(ctx) {
  const { db, rechten, request, seizoen } = ctx;
  const guid = new URL(request.url).searchParams.get('team');
  if (!guid) return fout(400, 'team ontbreekt');

  const ploeg = await db
    .prepare(`SELECT guid, naam, categorie, gevolgd, bij_bond FROM teams WHERE guid = ? AND seizoen = ?`)
    .bind(guid, seizoen.code)
    .first();
  if (!ploeg) return fout(404, 'die ploeg bestaat niet in dit seizoen');

  const magPersoonsgegevens = rechten.mag('persoonsgegevens.bekijken', guid);

  const spelers = await db
    .prepare(
      `SELECT p.id, p.voornaam, p.achternaam, p.naam_vbl, p.naam_bron, p.lid_nr,
              p.geboortedatum, p.email, p.tel_gsm, ts.bij_bond
         FROM team_spelers ts
         JOIN personen p ON p.id = ts.persoon_id
        WHERE ts.team_guid = ? AND ts.seizoen = ? AND p.actief = 1
        ORDER BY lower(p.achternaam), lower(p.voornaam)`
    )
    .bind(guid, seizoen.code)
    .all();

  const staf = await db
    .prepare(
      `SELECT p.id, p.voornaam, p.achternaam, p.naam_vbl, p.naam_bron, p.lid_nr,
              p.geboortedatum, p.email, p.tel_gsm, r.rol, r.bron
         FROM rollen r
         JOIN personen p ON p.id = r.persoon_id
        WHERE r.team_guid = ? AND r.seizoen = ? AND p.actief = 1
        ORDER BY r.rol, lower(p.achternaam)`
    )
    .bind(guid, seizoen.code)
    .all();

  return json({
    ploeg,
    toont_persoonsgegevens: magPersoonsgegevens,
    spelers: (spelers.results ?? []).map((r) => ledenVeilig(r, magPersoonsgegevens)),
    staf: (staf.results ?? []).map((r) => ({
      ...ledenVeilig(r, magPersoonsgegevens),
      rol: r.rol,
      bron: r.bron,
    })),
  });
}

export async function personenZoeken(ctx) {
  const { db, request, seizoen } = ctx;
  const zoek = (new URL(request.url).searchParams.get('zoek') ?? '').trim();

  // Zonder zoekterm de volledige ledenlijst teruggeven is een uitnodiging om ze
  // ergens anders te laten belanden. Wie alles wil zien, gaat per ploeg.
  if (zoek.length < 2) return fout(400, 'geef minstens twee tekens om op te zoeken');

  const patroon = `%${zoek.toLowerCase()}%`;
  const rijen = await db
    .prepare(
      `SELECT id, voornaam, achternaam, naam_vbl, naam_bron, lid_nr, geboortedatum,
              email, actief, rel_guid
         FROM personen
        WHERE lower(voornaam || ' ' || achternaam) LIKE ?1
           OR lower(ifnull(naam_vbl, '')) LIKE ?1
           OR lower(ifnull(email, '')) LIKE ?1
           OR ifnull(lid_nr, '') LIKE ?1
        ORDER BY actief DESC, lower(achternaam), lower(voornaam)
        LIMIT ${ZOEK_MAXIMUM + 1}`
    )
    .bind(patroon)
    .all();

  const gevonden = rijen.results ?? [];
  const meer = gevonden.length > ZOEK_MAXIMUM;

  // De ploegen erbij, zodat zichtbaar is waar iemand in zit. Filteren op een
  // voorwaarde en niet op een lijst id's: D1 staat maar honderd gebonden
  // parameters toe.
  const ploegen = await db
    .prepare(
      `SELECT ts.persoon_id, t.naam, t.categorie
         FROM team_spelers ts
         JOIN teams t ON t.guid = ts.team_guid AND t.seizoen = ts.seizoen
        WHERE ts.seizoen = ?`
    )
    .bind(seizoen.code)
    .all();

  const perPersoon = new Map();
  for (const rij of ploegen.results ?? []) {
    if (!perPersoon.has(rij.persoon_id)) perPersoon.set(rij.persoon_id, []);
    perPersoon.get(rij.persoon_id).push(rij.naam);
  }

  return json({
    aantal: Math.min(gevonden.length, ZOEK_MAXIMUM),
    meer,
    personen: gevonden.slice(0, ZOEK_MAXIMUM).map((p) => ({
      ...p,
      ploegen: perPersoon.get(p.id) ?? [],
    })),
  });
}
