// Mijn eerstvolgende trainingen en wedstrijden, met de opgaveknoppen.

import { api } from '../api.js';
import { el, veilig } from '../hulp.js';

const DAGNAMEN = ['', 'ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

function weekdagVan(datumTekst) {
  const dag = new Date(`${datumTekst}T00:00:00Z`).getUTCDay();
  return DAGNAMEN[dag === 0 ? 7 : dag];
}

function statusTekst(rij) {
  if (rij.uitgesloten) return `uitgesloten${rij.uitgesloten_reden ? ` — ${veilig(rij.uitgesloten_reden)}` : ''}`;
  if (rij.opgave_status === 'aanwezig') return 'aanwezig';
  if (rij.opgave_status === 'afwezig') return 'afwezig';
  return 'nog niet ingevuld';
}

export async function laadMijnOpgaven() {
  const uitkomst = await api('/api/aanwezigheid/mijn');
  const blok = el('opgaveblok');
  if (uitkomst.status !== 200) {
    blok.hidden = true;
    return;
  }

  const activiteiten = uitkomst.body.activiteiten ?? [];
  blok.hidden = false;
  el('geenopgaven').hidden = activiteiten.length > 0;

  el('opgavelijf').innerHTML = activiteiten
    .map((a, i) => {
      const kanNogInvullen = !a.uitgesloten;
      const voor = a.voor_voornaam ? `${veilig(a.voor_voornaam)} ${veilig(a.voor_achternaam ?? '')}`.trim() : '';
      return `<tr data-rij="${i}">
        <td>${weekdagVan(a.datum)} ${veilig(a.datum)} ${veilig(a.begin)}</td>
        <td>${voor}</td>
        <td>${statusTekst(a)}</td>
        <td>${
          kanNogInvullen
            ? `<button type="button" class="alslink" data-aanwezig="${i}">aanwezig</button>
               <button type="button" class="alslink" data-afwezig="${i}">afwezig</button>`
            : ''
        }</td>
      </tr>
      <tr id="opgaveform-${i}" hidden><td colspan="4"></td></tr>`;
    })
    .join('');

  for (const knop of el('opgavelijf').querySelectorAll('[data-aanwezig]')) {
    const i = knop.dataset.aanwezig;
    knop.addEventListener('click', () => zetSnel(activiteiten[i]));
  }
  for (const knop of el('opgavelijf').querySelectorAll('[data-afwezig]')) {
    const i = knop.dataset.afwezig;
    knop.addEventListener('click', () => toonAfwezigFormulier(i, activiteiten[i]));
  }
}

async function zetSnel(activiteit) {
  await api('/api/aanwezigheid/opgave', 'POST', {
    soort: activiteit.soort,
    activiteit_id: activiteit.id,
    persoon_id: activiteit.voor_persoon_id,
    status: 'aanwezig',
  });
  await laadMijnOpgaven();
}

function toonAfwezigFormulier(index, activiteit) {
  const rij = document.getElementById(`opgaveform-${index}`);
  if (!rij) return;
  rij.hidden = false;
  rij.querySelector('td').innerHTML = `
    <select id="reden-${index}">
      <option value="ziek">ziek</option>
      <option value="gekwetst">gekwetst</option>
      <option value="ander">ander</option>
    </select>
    <input type="text" id="toelichting-${index}" placeholder="toelichting (bij 'ander')">
    <button type="button" id="bevestig-${index}">Bevestigen</button>
  `;
  document.getElementById(`bevestig-${index}`).addEventListener('click', async () => {
    const reden = document.getElementById(`reden-${index}`).value;
    const toelichting = document.getElementById(`toelichting-${index}`).value;
    await api('/api/aanwezigheid/opgave', 'POST', {
      soort: activiteit.soort,
      activiteit_id: activiteit.id,
      persoon_id: activiteit.voor_persoon_id,
      status: 'afwezig',
      reden,
      toelichting,
    });
    await laadMijnOpgaven();
  });
}
