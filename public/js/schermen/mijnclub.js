// Mijn club (T7): de wedstrijden van de gevolgde ploegen, van het vorige tot
// het komende weekend, als de gedeelde kaart (kaart.js) per dag.
//
// Welke ploegen je ziet en welke je 'op de hoogte houdt', kies je op twee
// plaatsen met dezelfde vinkjes (beslist met Jurgen, 20 november 2026): de
// knop *Ploegen kiezen* bovenaan het tabblad, en *Mijn club* bij Mijn
// voorkeuren. Beide gebruiken `toonKiezer`, zodat ze niet uit elkaar groeien.

import { api } from '../api.js';
import { el, veilig } from '../hulp.js';
import { kaart, gegroepeerd, dagTitel } from '../kaart.js';

/** De toestand voor de rand: een gespeelde wedstrijd groen, een forfait of afgelaste grijs. */
export function toestandMijnClub(w) {
  if (w.forfait || (w.status && w.status !== 'gepland')) return 'weg';
  if (w.uitslag) return 'ja';
  return null;
}

function tekenWedstrijden(gegevens) {
  const doel = el('mijnclublijst');
  const getoond = gegevens.ploegen.filter((p) => p.tonen).length;
  const kop = `<p class="klein">${veilig(dagTitel(gegevens.van))} tot ${veilig(dagTitel(gegevens.tot))} — ${getoond} van ${gegevens.ploegen.length} ploegen${gegevens.gekozen ? '' : ' (je eigen ploegen)'}.</p>`;
  if (!gegevens.ploegen.length) {
    doel.innerHTML = '<p class="melding">De club volgt nog geen enkele ploeg in TeamAssist.</p>';
    return;
  }
  if (!getoond) {
    doel.innerHTML = `${kop}<p class="melding">Je toont geen enkele ploeg. Kies ploegen met de knop hierboven.</p>`;
    return;
  }
  if (!gegevens.wedstrijden.length) {
    doel.innerHTML = `${kop}<p class="melding">Geen wedstrijden van je ploegen in deze periode.</p>`;
    return;
  }
  doel.innerHTML = kop + gegroepeerd(gegevens.wedstrijden, (w) => kaart({
    soort: 'wedstrijd',
    datum: w.datum,
    uur: w.uur,
    ploeg: w.ploeg,
    tegenstander: w.tegenstander,
    thuis: w.thuis,
    locatie: w.locatie,
    blad: w.wedstrijdblad,
    uitslag: w.uitslag,
    forfait: w.forfait,
    toestand: toestandMijnClub(w),
  }));
}

export async function laadMijnClub() {
  const uit = await api('/api/mijnclub');
  if (uit.status !== 200) {
    el('mijnclublijst').innerHTML = `<p class="melding fout">${veilig(uit.body?.fout ?? `Fout ${uit.status}`)}</p>`;
    return;
  }
  tekenWedstrijden(uit.body);
}

/**
 * De vinkjes: per gevolgde ploeg *tonen* en *op de hoogte houden*. Bewaren
 * stuurt altijd de volledige lijst: daarna is het een gemaakte keuze, geen
 * standaard meer.
 */
export async function toonKiezer(doelId, naBewaren = () => {}) {
  const doel = el(doelId);
  const uit = await api('/api/mijnclub/ploegen');
  if (uit.status !== 200) {
    doel.innerHTML = `<p class="melding fout">${veilig(uit.body?.fout ?? `Fout ${uit.status}`)}</p>`;
    return;
  }
  const { ploegen, gekozen } = uit.body;
  if (!ploegen.length) {
    doel.innerHTML = '<p class="klein">De club volgt nog geen enkele ploeg.</p>';
    return;
  }
  doel.innerHTML = `
    <p class="klein">${gekozen ? 'Je eigen keuze.' : 'Nog niets gekozen: je ziet je eigen ploegen, of alle als je aan geen enkele hangt.'}
      'Op de hoogte' stuurt je na elke ophaling één bericht als er iets veranderde: datum, uur, zaal of een uitslag.</p>
    <table class="kiezer">
      <thead><tr><th>Ploeg</th><th>Tonen</th><th>Op de hoogte</th></tr></thead>
      <tbody>${ploegen.map((p) => `<tr data-ploeg="${veilig(p.guid)}">
        <td>${veilig(p.naam_kort || p.naam)}${p.eigen ? ' <span class="klein">(jouw ploeg)</span>' : ''}</td>
        <td><input type="checkbox" data-tonen ${p.tonen ? 'checked' : ''} aria-label="${veilig(p.naam_kort || p.naam)} tonen"></td>
        <td><input type="checkbox" data-hoogte ${p.op_de_hoogte ? 'checked' : ''} aria-label="${veilig(p.naam_kort || p.naam)} op de hoogte houden"></td>
      </tr>`).join('')}</tbody>
    </table>
    <form><button type="button" data-bewaar>Bewaren</button></form>
    <div class="melding" data-melding hidden></div>`;
  doel.querySelector('[data-bewaar]').addEventListener('click', async () => {
    const keuze = [...doel.querySelectorAll('tr[data-ploeg]')].map((rij) => ({
      team_guid: rij.dataset.ploeg,
      tonen: rij.querySelector('[data-tonen]').checked,
      op_de_hoogte: rij.querySelector('[data-hoogte]').checked,
    }));
    const r = await api('/api/mijnclub/keuze', 'POST', { ploegen: keuze });
    const melding = doel.querySelector('[data-melding]');
    melding.hidden = false;
    melding.classList.toggle('fout', r.status !== 200);
    melding.textContent = r.status === 200 ? 'Bewaard.' : r.body?.fout ?? `Dat lukte niet (${r.status}).`;
    if (r.status === 200) naBewaren();
  });
}

export function koppelMijnClub() {
  el('mijnclubkies').addEventListener('click', async () => {
    const blok = el('mijnclubkiezer');
    blok.hidden = !blok.hidden;
    el('mijnclubkies').setAttribute('aria-expanded', String(!blok.hidden));
    if (!blok.hidden) {
      await toonKiezer('mijnclubkiezer', () => {
        el('mijnclubkiezer').hidden = true;
        el('mijnclubkies').setAttribute('aria-expanded', 'false');
        laadMijnClub();
      });
    }
  });
}
