// Instellingen, waaronder de schakelaar voor de testrol.

import { api } from '../api.js';
import { el, veilig } from '../hulp.js';

export async function laadInstellingen() {
  const uitkomst = await api('/api/admin/instellingen');
  if (uitkomst.status !== 200) return;

  const inst = uitkomst.body.instellingen;
  el('instellingenlijf').innerHTML = Object.entries(inst)
    .map(([sleutel, def]) => {
      const invoer =
        def.soort === 'vlag'
          ? `<input type="checkbox" data-sleutel="${sleutel}" ${def.waarde === '1' ? 'checked' : ''}>`
          : def.soort === 'keuze'
            ? `<select data-sleutel="${sleutel}">${def.keuzes
                .map((k) => `<option ${k === def.waarde ? 'selected' : ''}>${veilig(k)}</option>`)
                .join('')}</select>`
            : `<input type="text" data-sleutel="${sleutel}" value="${veilig(def.waarde)}">`;
      return `<tr><td>${sleutel}</td><td>${invoer}</td></tr>`;
    })
    .join('');

  for (const invoer of el('instellingenlijf').querySelectorAll('[data-sleutel]')) {
    invoer.addEventListener('change', async () => {
      const waarde = invoer.type === 'checkbox' ? invoer.checked : invoer.value;
      const uit = await api('/api/admin/instellingen', 'POST', {
        sleutel: invoer.dataset.sleutel,
        waarde,
      });
      el('instellingmelding').textContent =
        uit.status === 200 ? 'Bewaard.' : `Dat lukte niet: ${uit.body?.fout ?? uit.status}`;
      // De testrolschakelaar verandert wat er op het scherm hoort te staan.
      if (invoer.dataset.sleutel === 'testrol_toegelaten') location.reload();
    });
  }
}
