// Tabbladen per stuk uitzetten (0.42.0, I1 fase 4e, zoals verborgen_tabs in
// YOAssist).
//
// Iedereen kiest voor zichzelf welke tabbladen hij niet wil zien. Het gaat
// enkel om weergave: wat iemand mag, volgt uit de rechten en verandert hier
// niet. Overzicht kan niet weg, zodat niemand een lege app overhoudt; de
// schermen onder Beheer zijn panelen, geen tabbladen.
//
// Dezelfde lijst staat in public/js/navigatie.js (`verbergbaar`,
// `standaardUit`); een test legt beide naast elkaar.

export const VERBERGBAAR = ['aanduidingen', 'cluboverzicht', 'regio', 'ploegen', 'personen'];

// Regio staat standaard uit, zoals in YOAssist: het is enkel nuttig voor wie
// de regio opvolgt, en wie dat doet, zet het zelf aan.
export const STANDAARD_VERBORGEN = ['regio'];

/** Wat er in `personen.verborgen_tabs` staat, als lijst. NULL = de standaard. */
export function leesVerborgen(waarde) {
  if (waarde === null || waarde === undefined) return [...STANDAARD_VERBORGEN];
  try {
    const lijst = JSON.parse(waarde);
    return Array.isArray(lijst) ? lijst.filter((id) => VERBERGBAAR.includes(id)) : [...STANDAARD_VERBORGEN];
  } catch {
    return [...STANDAARD_VERBORGEN];
  }
}

/** Een lijst uit een verzoek, nagekeken; null als er iets niet klopt. */
export function keurVerborgenGoed(lijst) {
  if (!Array.isArray(lijst) || !lijst.every((id) => VERBERGBAAR.includes(id))) return null;
  return [...new Set(lijst)].sort();
}

// De tabbladen van YOAssist, met hun naam in TeamAssist. Het Logboek is er
// (nog) geen tabblad.
const VAN_YOASSIST = { mijn: 'aanduidingen', club: 'cluboverzicht', aandacht: 'regio' };

/**
 * `users.verborgen_tabs` van YOAssist ('log,aandacht') voor de migratie.
 * Geeft null terug als het neerkomt op de standaard: dan blijft iemand de
 * standaard volgen, ook als die later verandert.
 */
export function vanYoassist(waarde) {
  const lijst = [...new Set(String(waarde ?? '').split(',').map((s) => VAN_YOASSIST[s.trim()]).filter(Boolean))].sort();
  const standaard = [...STANDAARD_VERBORGEN].sort();
  return lijst.length === standaard.length && lijst.every((id, i) => id === standaard[i]) ? null : JSON.stringify(lijst);
}
