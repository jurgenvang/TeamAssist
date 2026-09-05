// Mijn voorkeuren: dark mode en het communicatiekanaal.
//
// De donkere modus wordt op twee plaatsen bewaard: in localStorage voor de
// allereerste weergave (vóór /api/mij ooit geantwoord heeft, om een zichtbare
// flits van het verkeerde kleurenschema te vermijden), en in de databank als
// echte bron van waarheid — zodat de voorkeur meereist naar een ander
// toestel. Bij een verschil wint de databank; localStorage is enkel een
// snelle eerste gok.

import { api } from '../api.js';
import { el, toon } from '../hulp.js';

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
  el('voorkeurkanaalnotitie').hidden = false; // push bestaat nog niet, zie WIJZIGINGEN
  el('voorkeurenmelding').hidden = true;
  el('voorkeuren').hidden = false;
}

export async function bewaarVoorkeuren() {
  const donkere_modus = el('voorkeurmodus').value;
  const kanaal_voorkeur = el('voorkeurkanaal').value;

  pasDonkereModusToe(donkere_modus);
  bewaarLokaleModus(donkere_modus);

  const uit = await api('/api/mij/voorkeuren', 'POST', { donkere_modus, kanaal_voorkeur });
  toon('voorkeurenmelding', uit.status === 200 ? 'Bewaard.' : `Dat lukte niet: ${uit.body?.fout ?? uit.status}`, uit.status !== 200);
}
