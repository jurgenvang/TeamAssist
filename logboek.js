// Vorm van een logregel.
//
// Loggen mag de actie zelf nooit laten mislukken. Vandaar de try/catch: een
// volle databank of een gewijzigd schema hoort een aanduiding niet tegen te
// houden.

export async function logSchrijf(db, { soort, wie = null, wat, details = null, afgehandeld = 1 }) {
  try {
    await db
      .prepare(
        `INSERT INTO logboek (soort, wie, wat, details, afgehandeld)
              VALUES (?, ?, ?, ?, ?)`
      )
      .bind(soort, wie, wat, details, afgehandeld)
      .run();
    return true;
  } catch {
    return false;
  }
}
