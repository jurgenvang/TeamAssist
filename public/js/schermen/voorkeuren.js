// Mijn voorkeuren: dark mode en het communicatiekanaal.
//
// De donkere modus wordt op twee plaatsen bewaard: in localStorage voor de
// allereerste weergave (vóór /api/mij ooit geantwoord heeft, om een zichtbare
// flits van het verkeerde kleurenschema te vermijden), en in de databank als
// echte bron van waarheid — zodat de voorkeur meereist naar een ander
// toestel. Bij een verschil wint de databank; localStorage is enkel een
// snelle eerste gok.

import { openPaneel } from '../paneel.js';
import { api } from '../api.js';
import { el, toon, veilig } from '../hulp.js';
import { toonMeldingenstatus } from './meldingen.js';
import { toonMeelezen } from './meelezen.js';

const OPSLAG_MODUS = 'teamassist.donkere_modus';

/** Zet het kleurenschema toe, vóór of los van het aanmelden. */
export function pasDonkereModusToe(modus) {
  const gekozen = modus ?? localStorage.getItem(OPSLAG_MODUS) ?? 'systeem';
  document.documentElement.dataset.modus = gekozen;
}

function bewaarLokaleModus(modus) {
  try {
    localStorage.setItem(OPSLAG_MODUS, modus);
  } catch {
    // Geen opslag beschikbaar (privénavigatie e.d.) — de databank blijft de
    // bron van waarheid, dit is enkel een sneller eerste beeld.
  }
}

export function toonVoorkeuren(persoon) {
  el('voorkeurmodus').value = persoon.donkere_modus ?? 'systeem';
  el('voorkeurkanaal').value = persoon.kanaal_voorkeur ?? 'mail';
  el('voorkeurenmelding').hidden = true;
  openPaneel('voorkeuren');
  toonMeldingenstatus();
  toonMeelezen();
}

export async function bewaarVoorkeuren() {
  const donkere_modus = el('voorkeurmodus').value;
  const kanaal_voorkeur = el('voorkeurkanaal').value;

  pasDonkereModusToe(donkere_modus);
  bewaarLokaleModus(donkere_modus);

  const uit = await api('/api/mij/voorkeuren', 'POST', { donkere_modus, kanaal_voorkeur });
  toon('voorkeurenmelding', uit.status === 200 ? 'Bewaard.' : `Dat lukte niet: ${uit.body?.fout ?? uit.status}`, uit.status !== 200);
}

/**
 * De tabbladen aan en uit (0.42.0). `tabs` zijn enkel die waar iemand recht
 * op heeft; een vinkje dat aangaat, toont het tabblad meteen weer.
 */
export function toonTabbladkeuze(tabs, verborgen, naBewaren) {
  el('tabbladenblok').hidden = tabs.length === 0;
  el('tabbladenmelding').hidden = true;
  el('tabbladenkeuze').innerHTML = tabs
    .map((t) => `<label class="vinkje"><input type="checkbox" data-tab="${t.id}" ${verborgen.includes(t.id) ? '' : 'checked'}> ${veilig(t.naam)}</label>`)
    .join('');
  for (const vak of el('tabbladenkeuze').querySelectorAll('[data-tab]')) {
    vak.addEventListener('change', async () => {
      const uitgevinkt = [...el('tabbladenkeuze').querySelectorAll('[data-tab]')].filter((v) => !v.checked).map((v) => v.dataset.tab);
      // Een tabblad waar iemand geen recht op heeft, staat hier niet, maar
      // kan wel verborgen zijn (bv. Regio voor wie later YOADM wordt): dat
      // blijft zoals het was.
      const nietGetoond = verborgen.filter((id) => !tabs.some((t) => t.id === id));
      const nieuw = [...nietGetoond, ...uitgevinkt];
      const uit = await api('/api/mij/voorkeuren', 'POST', { verborgen_tabs: nieuw });
      if (uit.status !== 200) {
        toon('tabbladenmelding', `Dat lukte niet: ${uit.body?.fout ?? uit.status}`, true);
        return;
      }
      verborgen = uit.body.verborgen_tabs;
      naBewaren(verborgen);
    });
  }
}
