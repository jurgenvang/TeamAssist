// Mijn vergoeding (0.38.0, uit YOAssist): per maand wat je verdiende, met de
// wedstrijden erbij. De lopende maand staat er ook, met de vermelding dat er
// nog niets vastligt. Een ouder ziet die van zijn kind.

import { api } from '../api.js';
import { el, veilig } from '../hulp.js';
import { maandLabel, dagVan } from '../officials-hulp.js';
import { huidigNamens, namensKeuzeHtml } from './aanduidingen.js';

function regelTekst(r) {
  const wat = `${r.aantal > 0 && r.soort === 'correctie' ? '+' : ''}${r.aantal} × ${r.cat_label ?? r.cat_code}`;
  return r.soort === 'correctie' ? `correctie ${maandLabel(r.betreft_maand)}: ${wat}` : wat;
}

function wedstrijdTekst(w) {
  const d = w.datum ? dagVan(w.datum) : null;
  const wanneer = d ? `${d.dag} ${d.nr}/${w.datum.slice(5, 7)}` : '';
  const correctie = w.soort === 'correctie' ? ` — correctie ${w.aantal > 0 ? '+' : ''}${w.aantal}` : '';
  return `${wanneer} ${w.wedstrijd} (${w.catLabel ?? w.catCode})${correctie}${w.forfait ? ' — forfait' : ''}`;
}

export async function toonMijnVergoeding(namens = huidigNamens()) {
  el('vergoedingscherm').hidden = false;
  el('vergoedingnamens').innerHTML = namensKeuzeHtml('vergoedingvoor');
  const keuze = el('vergoedingvoor');
  if (keuze) keuze.addEventListener('change', () => toonMijnVergoeding(keuze.value || null));

  const uit = await api(`/api/officials/vergoeding${namens ? `?namens=${encodeURIComponent(namens)}` : ''}`);
  const doel = el('vergoedinglijst');
  if (uit.status !== 200) {
    doel.innerHTML = `<p class="melding fout">${veilig(uit.body?.fout ?? `Fout ${uit.status}`)}</p>`;
    return;
  }
  const b = uit.body;
  if (!b.maanden.length) {
    doel.innerHTML = '<p class="melding">Nog niets gefloten dit seizoen.</p>';
    return;
  }
  doel.innerHTML =
    `<p>Dit seizoen afgesloten: <b>${veilig(b.seizoen_totaal)}</b></p>` +
    b.maanden
      .map(
        (m) => `<div class="maandblok">
          <h3>${veilig(maandLabel(m.maand))} <span class="klein">${m.afgesloten ? 'afgesloten' : 'nog niet afgesloten — kan nog wijzigen'}</span></h3>
          <ul>${m.regels.map((r) => `<li>${veilig(regelTekst(r))} — ${veilig(r.bedrag)}</li>`).join('')}</ul>
          <p><b>Totaal: ${veilig(m.totaal)}</b></p>
          ${m.wedstrijden.length ? `<details><summary>Wedstrijden (${m.wedstrijden.length})</summary><ul class="klein">${m.wedstrijden
            .map((w) => `<li>${veilig(wedstrijdTekst(w))}</li>`)
            .join('')}</ul></details>` : ''}
        </div>`
      )
      .join('');
}
