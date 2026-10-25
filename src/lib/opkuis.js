// Opruiming (T15): logboek, taak_runs, berichten, en het definitief
// verwijderen van een inactieve persoon.
//
// Elke functie hier is een zuiver stukje SQL, geen droogloop — dit draait
// enkel automatisch via de uurcron (geplandetaken.js), nooit met een klik
// van een beheerder. Dat is bewust: een bewaartermijn is een beleidskeuze die
// al vastligt (zie de backlog), geen actie die telkens bevestigd moet worden.

const LOGBOEK_DAGEN = 365;
const TAAK_RUNS_DAGEN = 30;
const BERICHTEN_DAGEN = 120;
const INACTIEF_DAGEN = 180;

/**
 * Een afgehandelde logboekregel ouder dan een jaar. `afgehandeld = 0`
 * verdwijnt nooit automatisch, hoe oud ook — dat markeert iets dat nog
 * opvolging vraagt.
 */
export async function kuisLogboekOp(db) {
  const uit = await db
    .prepare(`DELETE FROM logboek WHERE afgehandeld = 1 AND tijdstip < datetime('now', ?)`)
    .bind(`-${LOGBOEK_DAGEN} days`)
    .run();
  return uit.meta?.changes ?? 0;
}

/** Puur operationeel — bedoeld om een patroon te herkennen, geen archief. */
export async function kuisTaakRunsOp(db) {
  const uit = await db
    .prepare(`DELETE FROM taak_runs WHERE geeindigd < datetime('now', ?)`)
    .bind(`-${TAAK_RUNS_DAGEN} days`)
    .run();
  return uit.meta?.changes ?? 0;
}

/** Zoals bij YOAssist: de bron voor 'Mijn berichten', 120 dagen. */
export async function kuisBerichtenOp(db) {
  const uit = await db
    .prepare(`DELETE FROM berichten WHERE verzonden < datetime('now', ?)`)
    .bind(`-${BERICHTEN_DAGEN} days`)
    .run();
  return uit.meta?.changes ?? 0;
}

/**
 * Verwijdert elke persoon die 180 dagen of langer inactief is.
 *
 * Wat volledig mee verwijderd wordt — `persoon_id` is daar deel van de
 * primary key of anderszins zonder betekenisvolle anonieme vorm:
 *   accounts, team_spelers, rollen, ouder_kind, wedstrijdselecties, berichten.
 *
 * Wat bewaard blijft, met de identiteit losgekoppeld — nuttig voor
 * clubstatistieken (aanwezigheidsgraad per team/seizoen):
 *   aanwezigheden, op alle vier de kolommen die een persoon_id kunnen
 *   bevatten (persoon_id zelf, en opgave_door/uitgesloten_door/
 *   vaststelling_door — geen van die drie heeft een eigen FK-afdwinging,
 *   maar zonder ze los te koppelen zou de identiteit daar alsnog blijven
 *   staan, ook op ándermans aanwezigheidsrij).
 *
 * `logboek.wie` wordt bewust niet losgekoppeld: een logboek is een
 * verantwoordingsspoor, en "wie deed dit" hoort te blijven staan ook nadat
 * iemand de club verlaten heeft — dat is precies het doel van zo'n spoor.
 */
export async function verwijderInactievePersonenOp(db) {
  const inactief = await db
    .prepare(`SELECT id FROM personen WHERE actief = 0 AND inactief_sinds < datetime('now', ?)`)
    .bind(`-${INACTIEF_DAGEN} days`)
    .all();

  let aantal = 0;
  for (const { id } of inactief.results ?? []) {
    await db.prepare(`DELETE FROM accounts WHERE persoon_id = ?`).bind(id).run();
    await db.prepare(`DELETE FROM team_spelers WHERE persoon_id = ?`).bind(id).run();
    await db.prepare(`DELETE FROM rollen WHERE persoon_id = ?`).bind(id).run();
    await db.prepare(`DELETE FROM ouder_kind WHERE ouder_id = ? OR kind_id = ?`).bind(id, id).run();
    await db.prepare(`DELETE FROM wedstrijdselecties WHERE persoon_id = ?`).bind(id).run();
    await db.prepare(`DELETE FROM berichten WHERE persoon_id = ?`).bind(id).run();
    // Sinds 0.28.0: wie welke mededeling wegklikte. Zonder dit blokkeert de
    // foreign key het verwijderen van de persoon zelf.
    await db.prepare(`DELETE FROM mededeling_gezien WHERE persoon_id = ?`).bind(id).run();

    await db.prepare(`UPDATE aanwezigheden SET persoon_id = NULL WHERE persoon_id = ?`).bind(id).run();
    await db.prepare(`UPDATE aanwezigheden SET opgave_door = NULL WHERE opgave_door = ?`).bind(id).run();
    await db.prepare(`UPDATE aanwezigheden SET uitgesloten_door = NULL WHERE uitgesloten_door = ?`).bind(id).run();
    await db.prepare(`UPDATE aanwezigheden SET vaststelling_door = NULL WHERE vaststelling_door = ?`).bind(id).run();
    // Wedstrijdtaken (T1, 0.26.0) stonden hier niet bij: een persoon met een
    // toegewezen taak liet het verwijderen mislukken op de foreign key, en
    // daarmee de hele ronde. Zoals bij aanwezigheden blijft de taak bestaan
    // en wordt enkel de persoon losgekoppeld — ook als toewijzer en bij een
    // open taak opnieuw een open plaats.
    await db.prepare(`UPDATE wedstrijdtaken SET persoon_id = NULL WHERE persoon_id = ?`).bind(id).run();
    await db.prepare(`UPDATE wedstrijdtaken SET toegewezen_door = NULL WHERE toegewezen_door = ?`).bind(id).run();

    await db.prepare(`DELETE FROM personen WHERE id = ?`).bind(id).run();
    aantal += 1;
  }
  return aantal;
}
