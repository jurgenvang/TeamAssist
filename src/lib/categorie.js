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

// De naam die de bond geeft, is de volledige clubnaam plus categorie plus
// volgnummer, bijvoorbeeld 'AB InBev Leuven Bears G12 A'. Intern spreekt de
// club over 'U12 A' — de clubnaam valt weg, en de categoriecode wisselt van
// letter: G en J worden U (G12 → U12, J16 → U16), M blijft M (M14 blijft
// M14), en een code zonder cijfers (HSE, DSE) blijft ongewijzigd.
//
// Waarom dit onderscheid bestaat, is niet gedocumenteerd door de bond — het
// is gewoon de conventie die de club al jaren gebruikt in de eigen
// communicatie, roosters en spreektaal.
const VERKORTE_LETTER = { G: 'U', J: 'U' };

/**
 * Zet een categoriecode om naar de interne, verkorte vorm.
 * Een onbekende of onverwachte vorm komt ongewijzigd terug — liever een
 * code die er nog hetzelfde uitziet dan een die stilzwijgend fout omgezet is.
 */
export function verkortCategorie(categorie) {
  if (typeof categorie !== 'string') return categorie;
  const match = categorie.match(/^([A-Za-z]+)(\d*)$/);
  if (!match) return categorie;
  const [, letters, cijfers] = match;
  const nieuw = VERKORTE_LETTER[letters] ?? letters;
  return nieuw + cijfers;
}

/**
 * Bouwt de interne, verkorte teamnaam ('U12 A') uit wat de bond geeft
 * ('AB InBev Leuven Bears G12 A'), de categoriecode, en de clubnaam.
 *
 * Werkt door de clubnaam en de oorspronkelijke categoriecode uit de volledige
 * naam te knippen — wat overblijft is het volgnummer/de letter — en die dan
 * te combineren met de verkorte categoriecode. Lukt dat knippen niet (de
 * volledige naam volgt de verwachte opbouw niet), dan komt de volledige naam
 * terug in plaats van iets te verzinnen.
 */
export function verkorteTeamnaam(volledigeNaam, categorie, clubnaam) {
  if (typeof volledigeNaam !== 'string') return volledigeNaam;
  let rest = volledigeNaam.trim();

  if (clubnaam && rest.toLowerCase().startsWith(clubnaam.trim().toLowerCase())) {
    rest = rest.slice(clubnaam.trim().length).trim();
  }
  if (categorie && rest.toLowerCase().startsWith(categorie.toLowerCase())) {
    rest = rest.slice(categorie.length).trim();
  } else {
    // De clubnaam kon eraf, maar de categorie stond er niet waar verwacht —
    // dan is de rest van de string onbetrouwbaar om als volgnummer te nemen.
    return volledigeNaam;
  }

  const verkort = verkortCategorie(categorie);
  return rest ? `${verkort} ${rest}` : verkort;
}
