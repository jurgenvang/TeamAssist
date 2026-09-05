// Personen zoeken.

import { api } from '../api.js';
import { el, veilig } from '../hulp.js';
import { toonPersoon } from './persoon.js';

export async function zoekPersonen() {
  const term = el('zoekterm').value.trim();
  const uitkomst = await api(`/api/admin/personen?zoek=${encodeURIComponent(term)}`);

  if (uitkomst.status !== 200) {
    el('zoeklijf').innerHTML = '';
    el('zoekmelding').textContent = uitkomst.body?.fout ?? `Fout ${uitkomst.status}`;
    return;
  }

  const b = uitkomst.body;
  el('zoeklijf').innerHTML = b.personen
    .map(
      (p) => `<tr>
        <td><button type="button" class="alslink" data-persoon="${veilig(p.id)}">${veilig(p.voornaam)} ${veilig(p.achternaam)}</button>${p.actief ? '' : ' (inactief)'}</td>
        <td>${veilig(p.geboortedatum ?? '')}</td>
        <td>${veilig(p.lid_nr ?? '')}</td>
        <td class="ploegen">${veilig(p.ploegen.join(', '))}</td>
      </tr>`
    )
    .join('');

  for (const knop of el('zoeklijf').querySelectorAll('button[data-persoon]')) {
    knop.addEventListener('click', () => toonPersoon(knop.dataset.persoon));
  }

  el('zoekmelding').textContent = b.meer
    ? `Meer dan ${b.aantal} treffers — verfijn de zoekterm.`
    : `${b.aantal} gevonden.`;
}
