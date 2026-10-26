// Zuivere hulpjes voor de schermen van de module Officials (0.38.0): geen
// DOM, geen netwerk — zo zijn ze zonder browser te testen
// (test/officials-schermen.test.mjs).

const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

/** '2026-11-14' → { dag: 'za', nr: 14 } */
export function dagVan(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return { dag: DAGEN[d.getUTCDay()], nr: d.getUTCDate() };
}

/** '2026-11' → 'november 2026' */
export function maandLabel(maand) {
  const [j, m] = String(maand).split('-').map(Number);
  return m >= 1 && m <= 12 ? `${MAANDEN[m - 1]} ${j}` : String(maand);
}

/**
 * Waar een wedstrijd in de lijst van een official hoort. Een forfait zonder
 * aanduiding vraagt geen antwoord meer: die gaat bij wat beantwoord is, en
 * telt niet mee in 'nog te beantwoorden'.
 */
export function sectieVoor(w) {
  if (w.toegewezen) return 'aangeduid';
  if (w.forfait) return 'beantwoord';
  return w.beschikbaarheid === null || w.beschikbaarheid === undefined ? 'open' : 'beantwoord';
}

/** 'forfait bezoekers', zoals de bond het noteert. */
export function forfaitTekst(f) {
  if (f === 'thuis') return 'forfait thuisploeg';
  if (f === 'uit') return 'forfait bezoekers';
  return 'dubbel forfait';
}

/**
 * De grens van 'deze en volgende maand': de eerste maand die er niet meer bij
 * hoort. Verder vooruit antwoorden heeft weinig zin, en een lijst van vijf
 * maanden maakt net de sectie die actie vraagt onoverzichtelijk.
 */
export function grensMaand(vandaag = new Date()) {
  return new Date(Date.UTC(vandaag.getUTCFullYear(), vandaag.getUTCMonth() + 2, 1)).toISOString().slice(0, 7);
}

/**
 * Een Belgisch gsm-nummer als internationale cijfers, voor wa.me: '0470 12 34 56'
 * → '32470123456'. Een nummer dat al met + of 00 begint, blijft van dat land.
 */
export function internationaal(nummer) {
  let s = String(nummer ?? '').replace(/[^\d+]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  else if (s.startsWith('0')) s = `32${s.slice(1)}`;
  return s.replace(/\D/g, '');
}

/** Een bedrag in cent als '€ 15,00'. */
export function alsBedrag(cent) {
  const neg = cent < 0;
  const a = Math.abs(cent);
  const t = `€ ${Math.floor(a / 100)},${String(a % 100).padStart(2, '0')}`;
  return neg ? `− ${t}` : t;
}
