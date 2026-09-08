// Welke tafeltaken een wedstrijd nodig heeft.
//
// Zuivere functie, geen databanktoegang — bepaald door categorie en thuis/uit,
// niets anders. Categorieën tot en met U12 hebben genoeg aan één klok; vanaf
// U14 komt daar de 24 seconden bij. Een uitwedstrijd vraagt geen klok of 24
// seconden (die staan al klaar in de zaal van de tegenstander), wel iemand
// voor de tablet. Een ploegafgevaardigde is er altijd nodig, thuis of uit.

import { isBekendeCategorie } from './categorie.js';

const KLOK_ENKEL_CATEGORIEEN = ['G08', 'G10', 'G12', 'M12'];

/**
 * @param {object} wedstrijd
 * @param {string} wedstrijd.categorie   de VBL-categoriecode van het team (bv. 'G12', 'J16')
 * @param {boolean} wedstrijd.thuis
 * @returns {string[]}   'klok'/'24seconden'/'tablet'/'ploegafgevaardigde', kan leeg zijn
 */
export function takenVoorWedstrijd({ categorie, thuis }) {
  // Een onbekende categorie: liever geen taken verzinnen dan verkeerd gokken.
  // Zelfde voorzichtige kant als onderwijsgroepVoor() in categorie.js.
  if (!isBekendeCategorie(categorie)) return [];

  const taken = [];
  if (thuis) {
    taken.push('klok');
    if (!KLOK_ENKEL_CATEGORIEEN.includes(categorie)) taken.push('24seconden');
  } else {
    taken.push('tablet');
  }
  taken.push('ploegafgevaardigde');
  return taken;
}
