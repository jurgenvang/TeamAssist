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
  { id: 'mij', naam: 'Overzicht', recht: null },
  { id: 'ploegen', naam: 'Ploegen', recht: 'team.bekijken' },
  { id: 'personen', naam: 'Personen', recht: 'personen.beheren' },
  // Drie menu-items in plaats van twee: zalen, periodes en de sjablonen
  // stonden verspreid over Configuratie en Dagelijks beheer terwijl ze
  // inhoudelijk hetzelfde geheel vormen — vakanties, examens en feestdagen
  // sturen rechtstreeks wat een zaal-gebonden trainingsreeks genereert. Nu
  // samen onder Zaalbeheer; Dagelijks beheer blijft over voor wat je vaak
  // even wil checken (de bond bekijken), Configuratie voor wat zelden wijzigt
  // (huisstijl, instellingen, de testrol).
  { id: 'dagelijksbeheer', naam: 'Dagelijks beheer', recht: 'systeem.beheren' },
  { id: 'zaalbeheer', naam: 'Zaalbeheer', recht: 'systeem.beheren' },
  { id: 'configuratie', naam: 'Configuratie', recht: 'systeem.beheren' },
];

export function zichtbareTabbladen(rechten) {
  return TABBLADEN.filter((t) => !t.recht || Object.hasOwn(rechten ?? {}, t.recht));
}

export function bouwNavigatie(rechten, bijWissel) {
  const tabs = zichtbareTabbladen(rechten);
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
