// Ploegen van de bond naast die van de club leggen.
//
// Zuivere functie: ze krijgt twee lijsten en geeft een plan terug. Dat maakt
// elke uitzondering te testen zonder databank, en het maakt de droogloop
// gratis — tonen wat er zou gebeuren is hetzelfde plan, alleen niet uitgevoerd.

import { ontleedPloegGuid, onderwijsgroepVoor, isBekendeCategorie, verkorteTeamnaam } from './categorie.js';

// Onder deze verhouding wordt er niets weggezet. Verdwijnt meer dan een derde
// van de ploegen tegelijk, dan wijst dat eerder op een storing bij de bond dan
// op een club die haar werking halveert.
export const VERDWIJNGRENS = 1 / 3;

/**
 * @param {Array<{guid: string, naam: string|null}>} gevonden  wat de bond geeft
 * @param {Array<object>} bestaand  de rijen die al in `teams` staan voor dit seizoen
 * @param {string} clubGuid
 * @param {string} clubnaam  voor het afleiden van de verkorte naam (naam_kort)
 */
export function maakPloegplan(gevonden, bestaand, clubGuid, clubnaam = '') {
  const bestaandPerGuid = new Map(bestaand.map((r) => [r.guid, r]));
  const gevondenGuids = new Set(gevonden.map((p) => p.guid));

  const nieuw = [];
  const gewijzigd = [];
  const ongewijzigd = [];

  for (const ploeg of gevonden) {
    const ontleed = ontleedPloegGuid(ploeg.guid, clubGuid);
    const categorie = ontleed?.categorie ?? null;
    const naam = ploeg.naam || ploeg.guid;
    const rij = {
      guid: ploeg.guid,
      naam,
      naam_kort: verkorteTeamnaam(naam, categorie, clubnaam),
      categorie,
      onderwijsgroep: onderwijsgroepVoor(categorie),
      // Een ploeg met een onbekende categorie start op niet-volgen. Ze
      // stilzwijgend meenemen zou betekenen dat er trainingen en aanwezigheden
      // aan hangen voor een werking die niemand bedoeld heeft.
      categorie_bekend: isBekendeCategorie(categorie),
    };

    const oud = bestaandPerGuid.get(ploeg.guid);
    if (!oud) {
      nieuw.push(rij);
      continue;
    }

    const verschillen = [];
    if ((oud.naam ?? '') !== rij.naam) verschillen.push('naam');
    if ((oud.naam_kort ?? null) !== rij.naam_kort) verschillen.push('naam_kort');
    if ((oud.categorie ?? null) !== rij.categorie) verschillen.push('categorie');
    if (oud.bij_bond === 0) verschillen.push('terug bij de bond');

    if (verschillen.length) gewijzigd.push({ ...rij, was: oud, verschillen });
    else ongewijzigd.push(rij);
  }

  const verdwenen = bestaand.filter((r) => !gevondenGuids.has(r.guid) && r.bij_bond !== 0);

  // De veiligheidsrem. Ze slaat ook aan wanneer de bond een leeg antwoord geeft,
  // wat in de praktijk vaker voorkomt dan een club die ploegen schrapt.
  const teVeelWeg =
    bestaand.length > 0 &&
    (gevonden.length === 0 || verdwenen.length > bestaand.length * VERDWIJNGRENS);

  return {
    nieuw,
    gewijzigd,
    ongewijzigd,
    verdwenen: teVeelWeg ? [] : verdwenen,
    genegeerd_verdwenen: teVeelWeg ? verdwenen : [],
    status: teVeelWeg ? 'deels' : 'ok',
    melding: teVeelWeg
      ? `${verdwenen.length} van ${bestaand.length} ploegen ontbraken; ` +
        'er is niets weggezet omdat dat eerder op een storing wijst'
      : null,
  };
}
