// De voorkeuren van een official, bij Mijn voorkeuren (0.38.0): de
// herinneringen, het gsm-nummer delen met wie samen fluit, en de agendalink.
// Een ouder stelt ze in voor zijn kind.

import { api } from '../api.js';
import { el, toon, veilig } from '../hulp.js';
import { huidigNamens, namensKeuzeHtml } from './aanduidingen.js';

let namens = null;

export async function toonOfficialsVoorkeuren(zichtbaar) {
  el('officialsvoorkeuren').hidden = !zichtbaar;
  if (!zichtbaar) return;
  namens = huidigNamens();
  el('officialsvoorkeurennamens').innerHTML = namensKeuzeHtml('officialsvoorkeurenvoor');
  const keuze = el('officialsvoorkeurenvoor');
  if (keuze) {
    keuze.addEventListener('change', () => {
      namens = keuze.value || null;
      laad();
    });
  }
  await laad();
}

async function laad() {
  el('agendalink').hidden = true;
  const uit = await api(`/api/officials/voorkeuren${namens ? `?namens=${encodeURIComponent(namens)}` : ''}`);
  if (uit.status !== 200) {
    toon('officialsvoorkeurenmelding', uit.body?.fout ?? `Fout ${uit.status}`, true);
    return;
  }
  el('herinneravond').checked = uit.body.herinner_avond;
  el('herinnerochtend').checked = uit.body.herinner_ochtend;
  el('gsmdelen').checked = uit.body.gsm_delen;
}

async function bewaar() {
  const uit = await api('/api/officials/voorkeuren', 'POST', {
    namens,
    herinner_avond: el('herinneravond').checked,
    herinner_ochtend: el('herinnerochtend').checked,
    gsm_delen: el('gsmdelen').checked,
  });
  toon('officialsvoorkeurenmelding', uit.status === 200 ? 'Bewaard.' : uit.body?.fout ?? `Fout ${uit.status}`, uit.status !== 200);
}

async function agenda(vernieuw) {
  if (vernieuw && !confirm('Een nieuwe link maken? De oude stopt dan te werken, ook in je agenda-app.')) return;
  const uit = await api('/api/officials/agenda', 'POST', { namens, vernieuw });
  if (uit.status !== 200) {
    toon('officialsvoorkeurenmelding', uit.body?.fout ?? `Fout ${uit.status}`, true);
    return;
  }
  const url = `${location.origin}${uit.body.pad}`;
  el('agendalink').hidden = false;
  el('agendalinktekst').innerHTML = `<code>${veilig(url)}</code>`;
  try {
    await navigator.clipboard.writeText(url);
    toon('officialsvoorkeurenmelding', 'De link staat op je klembord. Voeg hem toe als agenda-abonnement.');
  } catch {
    // Geen klembord (oudere browser, geen toestemming): de link staat erbij.
  }
}

export function koppelOfficialsVoorkeuren() {
  el('officialsvoorkeurenbewaren').addEventListener('click', bewaar);
  el('agendalinkknop').addEventListener('click', () => agenda(false));
  el('agendalinknieuw').addEventListener('click', () => agenda(true));
}
