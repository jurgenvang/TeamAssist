// Ouder en kind (I1, fase 3a).
//
// Een kind is een gewone persoon: zijn rollen, aanwezigheden, beschikbaarheden
// en vergoeding staan op zijn eigen rij. `ouder_kind` geeft een ouder enkel het
// recht om namens hem te handelen — met de rechten van het kind, nooit met
// meer. Wie namens wie handelt, komt uit het verzoek; dat het mag, komt altijd
// uit deze tabel, nooit uit wat de frontend beweert.
//
// Berichten aan een kind gaan ook naar zijn ouders, tenzij dat uitstaat
// (`personen.ouders_meelezen`). Beslist door Jurgen, 26 oktober 2026:
//  - een kind zonder eigen e-mailadres: altijd naar de ouders, anders komt
//    het nergens aan;
//  - minderjarig: standaard aan; uitzetten kan pas als elke ouder toestemming
//    gaf (ouder_toestemming);
//  - meerderjarig: standaard uit; het kind beslist zelf.
// Een onbekende geboortedatum telt als minderjarig: liever een bericht te veel
// bij een ouder dan een minderjarige die stil van de lijst verdwijnt.

export const MEERDERJARIG = 18;

/** Is iemand met deze geboortedatum ('jjjj-mm-dd') nog geen 18? Onbekend = ja. */
export function isMinderjarig(geboortedatum, vandaag = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(geboortedatum ?? ''));
  if (!m) return true;
  const [, j, mnd, d] = m.map(Number);
  const nu = { j: vandaag.getUTCFullYear(), m: vandaag.getUTCMonth() + 1, d: vandaag.getUTCDate() };
  let leeftijd = nu.j - j;
  if (nu.m < mnd || (nu.m === mnd && nu.d < d)) leeftijd -= 1;
  return leeftijd < MEERDERJARIG;
}

/**
 * Krijgen de ouders de berichten van dit kind mee?
 *
 * @param {{email, geboortedatum, ouders_meelezen}} kind
 * @returns {{aan, verplicht, minderjarig, standaard, gekozen}}
 *   verplicht: geen eigen adres, dus altijd aan — er valt niets te kiezen;
 *   gekozen:   1/0 als er ooit gekozen werd, anders null (dan geldt standaard).
 */
export function meelezen(kind, vandaag = new Date()) {
  const minderjarig = isMinderjarig(kind?.geboortedatum, vandaag);
  const standaard = minderjarig;
  const gekozen = kind?.ouders_meelezen === 0 || kind?.ouders_meelezen === 1 ? kind.ouders_meelezen : null;
  const verplicht = !kind?.email;
  return {
    aan: verplicht || (gekozen === null ? standaard : gekozen === 1),
    verplicht,
    minderjarig,
    standaard,
    gekozen,
  };
}

/**
 * Dezelfde regel als meelezen(), als SQL-voorwaarde op een rij `personen`
 * (alias `p`). Voor Mijn berichten van een ouder, waar het per kind in de
 * query zelf moet. Een test legt beide naast elkaar.
 */
export function meelezenSql(p = 'p') {
  return `(${p}.email IS NULL OR ${p}.email = ''
    OR coalesce(${p}.ouders_meelezen,
         CASE WHEN ${p}.geboortedatum IS NULL
                OR ${p}.geboortedatum NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                OR ${p}.geboortedatum > date('now', '-${MEERDERJARIG} years')
              THEN 1 ELSE 0 END) = 1)`;
}

/** De actieve ouders van een kind. */
export async function oudersVan(db, kindId) {
  const r = await db
    .prepare(
      `SELECT p.id, p.voornaam, p.achternaam, p.email
         FROM ouder_kind ok JOIN personen p ON p.id = ok.ouder_id
        WHERE ok.kind_id = ? AND p.actief = 1
        ORDER BY p.voornaam, p.achternaam`
    )
    .bind(kindId)
    .all();
  return r.results ?? [];
}

/** De actieve kinderen van een ouder, met wat nodig is om meelezen te bepalen. */
export async function kinderenVan(db, ouderId) {
  const r = await db
    .prepare(
      `SELECT p.id, p.voornaam, p.achternaam, p.email, p.geboortedatum, p.ouders_meelezen
         FROM ouder_kind ok JOIN personen p ON p.id = ok.kind_id
        WHERE ok.ouder_id = ? AND p.actief = 1
        ORDER BY p.voornaam, p.achternaam`
    )
    .bind(ouderId)
    .all();
  return r.results ?? [];
}

/** Mag `aanroeperId` handelen voor `voorId`? Voor zichzelf altijd; anders enkel als ouder. */
export async function magNamens(db, aanroeperId, voorId) {
  if (!voorId || voorId === aanroeperId) return true;
  const rij = await db
    .prepare(`SELECT 1 AS ja FROM ouder_kind WHERE ouder_id = ? AND kind_id = ?`)
    .bind(aanroeperId, voorId)
    .first();
  return Boolean(rij);
}
