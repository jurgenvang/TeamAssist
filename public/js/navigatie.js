// Navigatie.
//
// Welke tabbladen er staan, volgt uit de rechten die de backend teruggeeft —
// niet uit een rollijst in de frontend. Zo blijft er één plaats waar bepaald
// wordt wat iemand mag, en toont het scherm nooit iets waar de backend toch
// nee op zegt.
//
// Verbergen is een gemak, geen beveiliging: elke route controleert zelf.

import { el } from './hulp.js';

export const TABBLADEN = [
  // Module Officials (0.38.0). Vooraan: voor een official is dit het werk van
  // elke dag, zoals in YOAssist. Ook voor een ouder van een official, die zelf
  // geen recht heeft maar namens zijn kind invult (`ouder: true`).
  { id: 'aanduidingen', naam: 'Aanduidingen', recht: 'officials.opgeven', ouder: true },
  { id: 'mij', naam: 'Overzicht', recht: null },
  { id: 'ploegen', naam: 'Ploegen', recht: 'team.bekijken' },
  { id: 'personen', naam: 'Personen', recht: 'personen.beheren' },
  // De beheerschermen staan enkel onder Beheer in het naammenu, niet in de
  // tabbalk — zoals in YOAssist (I1). De tabbalk is voor het dagelijkse werk
  // van iedereen; wat zelden of enkel door een beheerder geopend wordt, zou er
  // anders de helft van innemen. Ze blijven wel in deze lijst, zodat het
  // tonen en verbergen van de panelen op één plaats gebeurt.
  //
  // Zalen, periodes en de sjablonen staan samen onder Zaalbeheer — vakanties,
  // examens en feestdagen sturen rechtstreeks wat een zaal-gebonden
  // trainingsreeks genereert. Dagelijks beheer is voor wat je vaak even wil
  // checken (de bond bekijken), Configuratie voor wat zelden wijzigt.
  { id: 'dagelijksbeheer', naam: 'Dagelijks beheer', recht: 'systeem.beheren', inMenu: true },
  { id: 'configuratie', naam: 'Configuratie', recht: 'systeem.beheren', inMenu: true },
  { id: 'zaalbeheer', naam: 'Zaalbeheer', recht: 'systeem.beheren', inMenu: true },
];

/**
 * @param {object} rechten   uit /api/mij
 * @param {{ouderVanOfficial?: boolean}} [extra]  een ouder van een official
 *   ziet de tabbladen met `ouder: true`, ook zonder het recht zelf
 */
export function zichtbareTabbladen(rechten, { ouderVanOfficial = false } = {}) {
  return TABBLADEN.filter(
    (t) => !t.recht || Object.hasOwn(rechten ?? {}, t.recht) || (t.ouder && ouderVanOfficial)
  );
}

/** Wat in de tabbalk komt; de rest opent via het naammenu. */
export function tabbalkTabbladen(rechten, extra) {
  return zichtbareTabbladen(rechten, extra).filter((t) => !t.inMenu);
}

/** Wat onder Beheer in het naammenu komt, in de volgorde van TABBLADEN. */
export function menuTabbladen(rechten, extra) {
  return zichtbareTabbladen(rechten, extra).filter((t) => t.inMenu);
}

export function bouwNavigatie(rechten, bijWissel, extra) {
  const tabs = tabbalkTabbladen(rechten, extra);
  const nav = el('navigatie');

  nav.innerHTML = tabs
    .map((t) => `<button type="button" data-tab="${t.id}">${t.naam}</button>`)
    .join('');

  const kies = (id) => {
    for (const tab of TABBLADEN) {
      const paneel = el(`tab-${tab.id}`);
      if (paneel) paneel.hidden = tab.id !== id;
    }
    for (const knop of nav.querySelectorAll('button[data-tab]')) {
      knop.setAttribute('aria-current', String(knop.dataset.tab === id));
    }
    if (bijWissel) bijWissel(id);
  };

  for (const knop of nav.querySelectorAll('button[data-tab]')) {
    knop.addEventListener('click', () => kies(knop.dataset.tab));
  }

  nav.hidden = tabs.length < 2;
  if (tabs.length) kies(tabs[0].id);
  return kies;
}
