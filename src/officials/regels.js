// Regels rond aanduidingen (module Officials, uit YOAssist `aanduiding.js`).
//
// Apart van de routes, omdat het automatisch aanvullen (3d) precies dezelfde
// regels moet gebruiken. Twee implementaties van dezelfde regel lopen
// gegarandeerd uit elkaar.

/** Minuten tussen twee aanvangsuren in dezelfde zaal. */
export const MARGE_ZELFDE_ZAAL = 120;

/** Extra minuten bovenop de gewone marge bij een verplaatsing. */
export const MARGE_EXTRA_ANDERE_ZAAL = 30;

/** Hoeveel minuten voor de aanvang een official op het terrein wordt verwacht. */
export const OPKOMST_MINUTEN = 20;

/** Een basketbalwedstrijd heeft in principe twee scheidsrechters. */
export const REFS_PER_WEDSTRIJD = 2;

/**
 * Hoeveel officials de bond voorziet: het hoogste van wat de API toont en wat
 * de woensdaglijst zegt (V39). Een wedstrijd die niet in de lijst staat,
 * heeft volgens de bond twee officials, ook als de API nog niemand toont.
 */
export function vblOfficials(offAantal, bondOfficials) {
  return Math.max(Number(offAantal) || 0, Number(bondOfficials) || 0);
}

/**
 * Hoeveel eigen officials er nog gezocht worden. Basketbal Vlaanderen duidt er
 * soms al één aan; bij U10/U12 nooit. Een forfait heeft er geen nodig (V40).
 */
export function aantalNodig(offAantal, { bondOfficials = null, forfait = null } = {}) {
  if (forfait) return 0;
  return Math.max(0, REFS_PER_WEDSTRIJD - vblOfficials(offAantal, bondOfficials));
}

/** 'jjjj-mm-dd' + 'uu:mm' -> minuten sinds het begin van de tijdrekening. */
export function alsMinuten(datum, uur) {
  const [j, m, d] = String(datum).split('-').map(Number);
  const [u, min] = String(uur).split(':').map(Number);
  if (!j || !m || !d || Number.isNaN(u) || Number.isNaN(min)) return null;
  return Math.floor(Date.UTC(j, m - 1, d, u, min) / 60000);
}

/**
 * Botsen twee wedstrijden voor één persoon? Van aanvang tot aanvang: twee uur
 * in dezelfde zaal, tweeënhalf uur als hij zich moet verplaatsen. De zaal
 * wordt op GUID vergeleken, niet op naam — die wordt niet overal identiek
 * geschreven.
 */
export function botst(a, b) {
  const ta = alsMinuten(a.datum, a.uur);
  const tb = alsMinuten(b.datum, b.uur);
  if (ta === null || tb === null) return false;
  const zelfdeZaal = Boolean(a.accGuid) && a.accGuid === b.accGuid;
  return Math.abs(ta - tb) < MARGE_ZELFDE_ZAAL + (zelfdeZaal ? 0 : MARGE_EXTRA_ANDERE_ZAAL);
}

/**
 * De wedstrijden waarmee een kandidaat botst — niet enkel ja of nee: de
 * beheerder wil weten wélke.
 */
export function conflicten(kandidaat, bestaande) {
  return bestaande.filter((b) => b.id !== kandidaat.id && botst(kandidaat, b));
}

/** 'uu:mm' min de opkomsttijd. Voor de herinneringen, niet voor de botsingen. */
export function opkomstUur(uur) {
  const [u, m] = String(uur).split(':').map(Number);
  if (Number.isNaN(u) || Number.isNaN(m)) return null;
  const totaal = (u * 60 + m - OPKOMST_MINUTEN + 1440) % 1440;
  return `${String(Math.floor(totaal / 60)).padStart(2, '0')}:${String(totaal % 60).padStart(2, '0')}`;
}

/**
 * Wie forfait gaf, uit de uitslag: 'thuis', 'uit', 'beide' of null (V40).
 * De bond zet een forfait als administratieve score met een code:
 * ' 20-  0  BFOR' (bezoekers, B) of '  0- 20  AFOR' (thuisploeg, A).
 */
export function normaliseerForfait(uitslagRuw) {
  const code = String(uitslagRuw ?? '').toUpperCase().match(/\b(AB|BA|A|B)FOR\b/)?.[1];
  if (!code) return null;
  if (code.length === 2) return 'beide';
  return code === 'A' ? 'thuis' : 'uit';
}

/** De scheidsrechters van de bond: `wedOff` is een lijst namen, soms één tekst. */
export function scheidsrechters(wedOff) {
  if (Array.isArray(wedOff)) return wedOff.map((n) => String(n).trim()).filter(Boolean);
  if (typeof wedOff === 'string' && wedOff.trim()) return [wedOff.trim()];
  return [];
}

/** '2026-27' -> '2627', de code in een VBL-wedstrijd-GUID (positie 5-8). */
export function vblSeizoen(code) {
  const m = /^20(\d{2})-(\d{2})$/.exec(String(code ?? ''));
  return m ? `${m[1]}${m[2]}` : null;
}
