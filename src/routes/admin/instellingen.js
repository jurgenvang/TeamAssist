// Clubbrede instellingen.
//
// Bewust een korte, vaste lijst en geen vrije sleutel/waarde-opslag van
// buitenaf: wat hier gezet kan worden, staat in de code. Anders kan een
// verzoek een sleutel schrijven die ergens anders als schakelaar dienstdoet.

import { json, fout, leesJson } from '../../lib/http.js';
import { logSchrijf } from '../../lib/logboek.js';
import { keurAccentkleurGoed, keurAchtergrondkleurGoed } from '../../lib/kleur.js';

export const INSTELBAAR = {
  clubnaam: { soort: 'tekst' },
  club_guid: { soort: 'tekst' },
  bericht_modus: { soort: 'keuze', keuzes: ['uit', 'omleiden', 'normaal'] },
  bericht_omleidadres: { soort: 'tekst' },
  mail_afzender: { soort: 'tekst' },
  // Laat een beheerder kiezen met welke rol hij wil werken. Staat uit bij een
  // verse installatie en hoort uit te staan zodra de club er echt mee werkt.
  testrol_toegelaten: { soort: 'vlag' },
  // Huisstijl. Elke kleur wordt bij het bewaren gecontroleerd op leesbaarheid
  // (zie src/lib/kleur.js) — een afgekeurde kleur wordt geweigerd, nooit
  // stilzwijgend aangepast. Het logo is een URL, geen upload: D1 is geen
  // plaats voor afbeeldingen (backlog, punt X).
  //
  // clubkleur_accent staat op knoppen en links tegen een witte achtergrond,
  // dus die moet contrasteren met wit. clubkleur_topbalk is een
  // achtergrondkleur — de felle merkkleur van een club faalt daar vaak de
  // eis van de accentkleur (te weinig contrast met wit), maar leest wél goed
  // met zwarte tekst erop. Vandaar een eigen, ruimere contrastregel.
  clubkleur_accent: { soort: 'kleur', kleurcontrole: 'accent' },
  clubkleur_topbalk: { soort: 'kleur', kleurcontrole: 'achtergrond' },
  clublogo_url: { soort: 'tekst' },
  // 'vbl' betekent dat het logo automatisch is afgeleid uit het club-GUID; een
  // eigen upload elders (of geen logo) zet dit op 'eigen'. Enkel om in het
  // scherm te tonen waar een waarde vandaan komt, geen gedragswijziging.
  clublogo_bron: { soort: 'keuze', keuzes: ['vbl', 'eigen'] },
};

export async function instellingLezen(db, sleutel, standaard = null) {
  const rij = await db.prepare(`SELECT waarde FROM instellingen WHERE sleutel = ?`).bind(sleutel).first();
  return rij?.waarde ?? standaard;
}

export async function instellingenTonen(ctx) {
  const { db } = ctx;
  const rijen = await db.prepare(`SELECT sleutel, waarde FROM instellingen`).all();
  const gevonden = Object.fromEntries((rijen.results ?? []).map((r) => [r.sleutel, r.waarde]));

  // Ook de instellingen die nog niet in de databank staan, met hun standaard.
  // Een installatie van vóór een nieuwe instelling mist die rij anders.
  const uit = {};
  for (const [sleutel, def] of Object.entries(INSTELBAAR)) {
    uit[sleutel] = { waarde: gevonden[sleutel] ?? (def.soort === 'vlag' ? '0' : ''), ...def };
  }
  return json({ instellingen: uit });
}

export async function instellingBewaren(ctx) {
  const { db, persoon, request } = ctx;
  const body = await leesJson(request);
  const sleutel = body?.sleutel;
  const def = INSTELBAAR[sleutel];
  if (!def) return fout(400, 'onbekende instelling');

  let waarde = body?.waarde;
  if (def.soort === 'vlag') waarde = body?.waarde ? '1' : '0';
  else waarde = String(waarde ?? '').trim();

  if (def.soort === 'keuze' && !def.keuzes.includes(waarde)) {
    return fout(400, `waarde moet een van deze zijn: ${def.keuzes.join(', ')}`);
  }

  // Een lege clubkleur betekent 'terug naar de standaard' en mag dus door de
  // controle heen; enkel een ingevulde waarde wordt op leesbaarheid getoetst.
  // Welke contrasteis geldt, hangt af van het veld: een accentkleur moet
  // contrasteren met wit, een achtergrondkleur met haar eigen leesbaarste
  // tekstkleur.
  if (def.soort === 'kleur' && waarde) {
    const keur = def.kleurcontrole === 'achtergrond' ? keurAchtergrondkleurGoed : keurAccentkleurGoed;
    const oordeel = keur(waarde);
    if (!oordeel.ok) return fout(400, `deze kleur wordt niet gebruikt: ${oordeel.reden}`);
  }

  await db
    .prepare(
      `INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?)
       ON CONFLICT (sleutel) DO UPDATE SET waarde = excluded.waarde, gewijzigd = datetime('now')`
    )
    .bind(sleutel, waarde)
    .run();

  await logSchrijf(db, {
    soort: 'beheer',
    wie: persoon.id,
    wat: 'instelling gewijzigd',
    details: `${sleutel} = ${waarde}`,
  });

  return json({ sleutel, waarde });
}
