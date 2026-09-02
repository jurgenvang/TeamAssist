// Categorieën van ploegen.
//
// De categoriecode is leidend, niet de ploegnaam: die laatste wisselt van jaar
// tot jaar en van invoerder tot invoerder, de code niet.
//
// Een ploeg-GUID is opgebouwd als club-GUID + drieletterige categoriecode +
// twee spaties + volgnummer, bijvoorbeeld `BVBL1125J16  2`.

// Welke onderwijsgroep hoort bij een categorie. Bepaalt straks welke
// examenperiodes op een ploeg van toepassing zijn: die van het secundair
// onderwijs vallen anders dan die van het hoger.
const ONDERWIJSGROEP = {
  G08: 'geen',
  G10: 'geen',
  G12: 'geen',
  M12: 'geen',
  G14: 'secundair',
  M14: 'secundair',
  J16: 'secundair',
  M16: 'secundair',
  J18: 'secundair',
  M19: 'secundair',
  J21: 'hoger',
  HSE: 'hoger',
  DSE: 'hoger',
};

export const BEKENDE_CATEGORIEEN = Object.keys(ONDERWIJSGROEP);

/**
 * Haalt de categorie en het volgnummer uit een ploeg-GUID.
 * Geeft null terug wanneer de GUID niet de verwachte vorm heeft; dan wordt er
 * niets verondersteld en komt de ploeg als onbekend binnen.
 */
export function ontleedPloegGuid(guid, clubGuid) {
  if (typeof guid !== 'string' || !guid.startsWith(clubGuid)) return null;
  const rest = guid.slice(clubGuid.length);
  const match = rest.match(/^([A-Z0-9]{3})\s\s(\d+)$/);
  if (!match) return null;
  return { categorie: match[1], volgnummer: Number(match[2]) };
}

/**
 * De onderwijsgroep van een categorie.
 *
 * Een onbekende categorie krijgt 'geen'. Dat is bewust de voorzichtige kant:
 * liever geen examenperiode toepassen op een ploeg waarvan we het niet weten,
 * dan trainingen schrappen die wel doorgingen.
 */
export function onderwijsgroepVoor(categorie) {
  return ONDERWIJSGROEP[categorie] ?? 'geen';
}

export function isBekendeCategorie(categorie) {
  return Object.hasOwn(ONDERWIJSGROEP, categorie ?? '');
}
