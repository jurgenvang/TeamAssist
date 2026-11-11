// De gedeelde kaart (T21): elke lijst met wedstrijden of trainingen toont ze
// zoals YOAssist dat doet. Beslist met Jurgen, 10 november 2026: het is een
// regel voor elke lijst, ook voor schermen die er later bijkomen.
//
// Links het datumblok (dag, nummer, uur), rechts de ploegen met thuis of uit,
// de categorie, de zaal met een kaartlink, het wedstrijdblad, de uitslag en
// een forfait als label. De rand links vertelt de toestand; een label bovenaan
// het type, als een lijst er meer dan één door elkaar toont (Mijn agenda).
//
// Eén functie die HTML teruggeeft, geen DOM: zo blijft ze zonder browser te
// testen (test/kaart.test.mjs). Alles wat uit de databank komt, gaat door
// veilig(); wat de aanroeper als `inhoud` of `acties` meegeeft, is al HTML en
// heeft hij zelf ontsmet.

import { veilig } from './hulp.js';
import { dagVan, maandLabel, forfaitTekst } from './officials-hulp.js';

export const SOORTEN = {
  training: 'Training',
  wedstrijd: 'Wedstrijd',
  fluiten: 'Fluiten',
  taak: 'Taak',
};

export const kaartlink = (plaats) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plaats)}`;

export const wedstrijdblad = (guid) => `https://vblweb.wisseq.eu/Home/MatchDetail?wedguid=${encodeURIComponent(guid)}`;

/**
 * Eén kaart.
 *
 * @param {object} k
 * @param {string} k.datum        'jjjj-mm-dd'
 * @param {string} [k.uur]        'uu:mm'
 * @param {string} [k.soort]      training | wedstrijd | fluiten | taak — enkel voor het label
 * @param {boolean} [k.label]     het label van het type tonen (in een gemengde lijst)
 * @param {string} [k.ploeg]      de eigen ploeg, of de thuisploeg
 * @param {string} [k.tegenstander]
 * @param {boolean|null} [k.thuis] true/false toont 'thuis'/'uit'; null of afwezig toont niets
 * @param {string} [k.cat]        categorie, als klein label
 * @param {string} [k.locatie]    zaal; met een kaartlink
 * @param {string} [k.blad]       URL van het wedstrijdblad
 * @param {string} [k.uitslag]
 * @param {string} [k.forfait]    'thuis' | 'uit' | 'beide'
 * @param {string} [k.voor]       'voor Max', in een lijst voor het hele gezin
 * @param {string} [k.toestand]   zet de kleur van de rand (data-toestand)
 * @param {string} [k.inhoud]     HTML onder de kop (scheidsrechters, botsing, …)
 * @param {string} [k.acties]     HTML met de knoppen
 * @param {object} [k.data]       extra data-attributen op het artikel
 */
export function kaart(k) {
  const d = dagVan(k.datum);
  const data = Object.entries({ soort: k.soort, toestand: k.toestand, ...(k.data ?? {}) })
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([s, v]) => ` data-${s}="${veilig(String(v))}"`)
    .join('');
  const labels = [
    k.label && k.soort ? `<span class="soort-label" data-soort="${veilig(k.soort)}">${veilig(SOORTEN[k.soort] ?? k.soort)}</span>` : '',
    k.voor ? `<span class="voor-label">voor ${veilig(k.voor)}</span>` : '',
  ].join('');
  const plaats = typeof k.thuis === 'boolean' ? `<span class="thuisuit">${k.thuis ? 'thuis' : 'uit'}</span>` : '';
  const tegen = k.tegenstander ? ` <span class="tegen">– ${veilig(k.tegenstander)}</span>` : '';
  const meta = [
    k.cat ? `<span class="cat">${veilig(k.cat)}</span>` : '',
    plaats,
    k.locatie ? `<a href="${kaartlink(k.locatie)}" target="_blank" rel="noopener noreferrer">${veilig(k.locatie)} ↗</a>` : '',
    k.blad ? `<a class="blad" href="${veilig(k.blad)}" target="_blank" rel="noopener noreferrer">wedstrijdblad ↗</a>` : '',
  ].filter(Boolean).join(' ');
  return `<article class="wed"${data}>
    <div class="wed-datum"><span class="dag">${d.dag}</span><span class="nr">${d.nr}</span>${k.uur ? `<span class="uur">${veilig(k.uur)}</span>` : ''}</div>
    <div class="wed-lijf">
      ${labels ? `<div class="wed-labels">${labels}</div>` : ''}
      <div class="wed-ploegen"><span class="ploeg">${veilig(k.ploeg ?? '')}</span>${tegen}${k.uitslag ? ` <span class="uitslag">${veilig(k.uitslag)}</span>` : ''}${k.forfait ? `<span class="forfait-label">${veilig(forfaitTekst(k.forfait))}</span>` : ''}</div>
      ${meta ? `<div class="wed-meta">${meta}</div>` : ''}
      ${k.inhoud ?? ''}
      ${k.acties ?? ''}
    </div>
  </article>`;
}

/** De kop van een sectie, zoals in YOAssist: hoofdletters, een lijn, het aantal rechts. */
export function sectieKop(titel, aantal = null, uitleg = '', klasse = '') {
  return `<div class="sectie-kop${klasse ? ` ${klasse}` : ''}"><h3>${veilig(titel)}</h3>${aantal === null ? '' : `<span class="aantal">${aantal}</span>`}</div>
    ${uitleg ? `<p class="sectie-uitleg">${veilig(uitleg)}</p>` : ''}`;
}

/**
 * Kaarten gegroepeerd onder een kop per dag ('za 14 november') of per maand
 * ('november 2026'). `teken` maakt van één item een kaart; `extraKop` kan
 * onder de dagkop nog iets zetten (de bron van Regio).
 */
export function gegroepeerd(items, teken, { per = 'dag', extraKop = null } = {}) {
  const delen = [];
  let vorige = null;
  for (const it of items) {
    const sleutel = per === 'maand' ? it.datum.slice(0, 7) : it.datum;
    if (sleutel !== vorige) {
      delen.push(`<div class="dag-kop">${veilig(per === 'maand' ? maandLabel(sleutel) : dagTitel(it.datum))}${extraKop ? extraKop(it, items) : ''}</div>`);
      vorige = sleutel;
    }
    delen.push(teken(it));
  }
  return delen.join('');
}

/** '2026-11-14' → 'za 14 november' */
export function dagTitel(iso) {
  const d = dagVan(iso);
  return `${d.dag} ${d.nr} ${maandLabel(iso.slice(0, 7)).split(' ')[0]}`;
}
