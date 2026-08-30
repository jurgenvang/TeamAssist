// Het actieve seizoen.
//
// Alles gaat over één seizoen: elke koppeling, elke activiteit, elke
// aanwezigheid. Een query zonder seizoensfilter is een bug, dus is er één
// plaats die zegt welk seizoen bedoeld wordt.

export async function actiefSeizoen(db) {
  const rij = await db
    .prepare(`SELECT code, naam FROM seizoenen WHERE actief = 1 LIMIT 1`)
    .first();
  return rij ?? null;
}

// Een verzoek mag een ander seizoen vragen, maar enkel een bestaand. Een
// onbekende code stil laten doorgaan zou lege lijsten opleveren die eruitzien
// als 'er is niets', terwijl er een tikfout in de URL staat.
export async function seizoenUitVerzoek(db, url) {
  const gevraagd = url.searchParams.get('seizoen');
  if (!gevraagd) return actiefSeizoen(db);
  const rij = await db
    .prepare(`SELECT code, naam FROM seizoenen WHERE code = ?`)
    .bind(gevraagd)
    .first();
  return rij ?? null;
}
