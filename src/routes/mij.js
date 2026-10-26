// Wie ben ik, en wat mag ik.
//
// Het enige scherm van versie 0.1, en meteen de plek waar een beheerder kan
// nagaan of de rechtenlaag doet wat ze hoort te doen.

import { json } from '../lib/http.js';
import { VERSIE } from '../versie.js';
import { magTestrolGebruiken } from '../lib/rechten.js';
import { instellingLezen } from './admin/instellingen.js';

/**
 * De ploegen ophalen waar deze persoon iets mee te maken heeft.
 *
 * Filteren op voorwaarden, nooit op een lijst GUID's: D1 staat maar honderd
 * gebonden parameters per query toe, en een coordinator met vijftien ploegen
 * loopt daar anders tegenaan.
 */
async function ploegenVan(db, persoonId, seizoen, alles) {
  if (alles) {
    const rijen = await db
      .prepare(
        `SELECT guid, naam, categorie FROM teams
          WHERE seizoen = ? ORDER BY categorie, naam`
      )
      .bind(seizoen)
      .all();
    return rijen.results ?? [];
  }

  const rijen = await db
    .prepare(
      `SELECT t.guid, t.naam, t.categorie
         FROM teams t
        WHERE t.seizoen = ?1
          AND (
            EXISTS (SELECT 1 FROM rollen r
                     WHERE r.persoon_id = ?2
                       AND r.team_guid = t.guid
                       AND r.seizoen = t.seizoen)
            OR EXISTS (SELECT 1 FROM team_spelers ts
                        WHERE ts.persoon_id = ?2
                          AND ts.team_guid = t.guid
                          AND ts.seizoen = t.seizoen)
            OR EXISTS (SELECT 1 FROM ouder_kind ok
                         JOIN team_spelers ts2 ON ts2.persoon_id = ok.kind_id
                        WHERE ok.ouder_id = ?2
                          AND ts2.team_guid = t.guid
                          AND ts2.seizoen = t.seizoen)
          )
        ORDER BY t.categorie, t.naam`
    )
    .bind(seizoen, persoonId)
    .all();
  return rijen.results ?? [];
}

/**
 * De kinderen van deze ouder die Youth Official zijn (0.38.0). Daarmee toont
 * het scherm Aanduidingen en Mijn vergoeding ook aan een ouder die zelf geen
 * official is — hij vult in namens zijn kind (namens.js).
 */
async function officialsKinderen(db, ouderId) {
  const r = await db
    .prepare(
      `SELECT DISTINCT p.id, p.voornaam, p.achternaam
         FROM ouder_kind ok
         JOIN personen p ON p.id = ok.kind_id AND p.actief = 1
         JOIN rollen r ON r.persoon_id = p.id AND r.rol IN ('YO', 'YOPLUS')
        WHERE ok.ouder_id = ?
        ORDER BY p.voornaam, p.achternaam`
    )
    .bind(ouderId)
    .all();
  return (r.results ?? []).map((k) => ({ id: k.id, naam: `${k.voornaam} ${k.achternaam}`.trim() }));
}

export async function mij(ctx) {
  const { db, persoon, rechten, seizoen } = ctx;
  const zietAlles = rechten.ploegenMet('team.bekijken') === '*';
  const ploegen = await ploegenVan(db, persoon.id, seizoen.code, zietAlles);

  // Of 'Kijken als …' in het naammenu mag staan. Zonder deze vlag toonde het
  // scherm de keuze ook wanneer testrol_toegelaten uit stond: de backend
  // negeerde de kop dan stil, en de testbalk beweerde iets dat niet klopte.
  // Bij een lopende testrol zijn de rechten al versmald en is dit false — de
  // testbalk is dan de weg terug, niet het menu.
  const testrolMogelijk = magTestrolGebruiken(
    rechten,
    await instellingLezen(db, 'testrol_toegelaten', '0'),
    'COACH'
  );

  return json({
    versie: VERSIE,
    seizoen: { code: seizoen.code, naam: seizoen.naam },
    persoon: {
      id: persoon.id,
      voornaam: persoon.voornaam,
      achternaam: persoon.achternaam,
      email: persoon.email,
      donkere_modus: persoon.donkere_modus,
      kanaal_voorkeur: persoon.kanaal_voorkeur,
    },
    rollen: rechten.rollen,
    ziet_alle_ploegen: zietAlles,
    ploegen,
    rechten: rechten.overzicht(),
    testrol_mogelijk: testrolMogelijk,
    officials_kinderen: await officialsKinderen(db, persoon.id),
  });
}
