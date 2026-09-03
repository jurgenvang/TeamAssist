// Ploegen: de lijst, het aanvinken, de synchronisatie en de ledenlijst.

import { api } from '../api.js';
import { el, toon, veilig } from '../hulp.js';
import { toonPersoon } from './persoon.js';
import { toonReeksen, toonWedstrijden } from './trainingen.js';

export async function laadPloegen() {
  const uitkomst = await api('/api/admin/teams');
  const ploegen = uitkomst.body?.teams ?? [];
  const magBeheren = uitkomst.status === 200;

  el('ploegenbeheer').hidden = !magBeheren;

  el('ploegenlijf').innerHTML = ploegen
    .map(
      (p) => `<tr>
        <td><input type="checkbox" data-guid="${veilig(p.guid)}" ${p.gevolgd ? 'checked' : ''}></td>
        <td>${veilig(p.categorie ?? '?')}</td>
        <td><button type="button" class="alslink" data-toon="${veilig(p.guid)}">${veilig(p.naam)}</button></td>
        <td class="ploegen">${p.bij_bond ? '' : 'niet meer bij de bond'}</td>
      </tr>`
    )
    .join('');

  for (const knop of el('ploegenlijf').querySelectorAll('button[data-toon]')) {
    knop.addEventListener('click', () => {
      toonLeden(knop.dataset.toon);
      toonReeksen(knop.dataset.toon);
      toonWedstrijden(knop.dataset.toon);
    });
  }

  for (const vinkje of el('ploegenlijf').querySelectorAll('input[type=checkbox]')) {
    vinkje.addEventListener('change', async () => {
      const gewild = vinkje.checked;
      vinkje.disabled = true;
      const uit = await api('/api/admin/teams/gevolgd', 'POST', {
        guid: vinkje.dataset.guid,
        gevolgd: gewild,
      });
      vinkje.disabled = false;

      if (uit.status === 200) {
        toon('ploegenplan', `${vinkje.dataset.guid}: ${gewild ? 'gevolgd' : 'niet meer gevolgd'}.`);
        return;
      }
      // Mislukt het, dan springt het vinkje terug: een scherm dat iets anders
      // toont dan de databank is erger dan een foutmelding.
      vinkje.checked = !gewild;
      toon('ploegenplan', `Dat lukte niet (${uit.status}): ${uit.body?.fout ?? 'geen uitleg'}.`, true);
    });
  }
}

export async function toonLeden(guid) {
  const uitkomst = await api(`/api/admin/team-leden?team=${encodeURIComponent(guid)}`);
  const vak = el('ledenlijst');
  vak.hidden = false;

  if (uitkomst.status !== 200) {
    el('ledenkop').textContent = `Dat lukte niet (${uitkomst.status})`;
    el('ledenlijf').innerHTML = '';
    return;
  }

  const b = uitkomst.body;
  el('ledenkop').textContent = `${b.ploeg.naam} — ${b.spelers.length} spelers`;

  // De naam van de bond ernaast, zodat een foute splitsing op de eerste spatie
  // meteen opvalt. Daar wordt ze rechtgezet, niet in de synchronisatie.
  const regel = (r, extra = '') => `<tr>
      <td><button type="button" class="alslink" data-persoon="${veilig(r.id)}">${veilig(r.voornaam)} ${veilig(r.achternaam)}</button></td>
      <td class="ploegen">${veilig(r.naam_vbl ?? '')}</td>
      <td>${veilig(r.geboortedatum ?? '')}</td>
      <td class="ploegen">${veilig(extra)}${r.bij_bond === 0 ? ' niet meer bij de bond' : ''}</td>
    </tr>`;

  el('ledenlijf').innerHTML =
    b.spelers.map((r) => regel(r)).join('') +
    b.staf.map((r) => regel(r, r.rol.toLowerCase())).join('');

  for (const knop of el('ledenlijf').querySelectorAll('button[data-persoon]')) {
    knop.addEventListener('click', () => toonPersoon(knop.dataset.persoon));
  }
}

// Twee stappen: eerst tonen wat er zou gebeuren, pas na bevestiging uitvoeren.
export async function synchroniseerPloegen() {
  const vak = el('ploegenplan');
  vak.hidden = false;
  vak.textContent = 'Ophalen bij de bond …';

  const proef = await api('/api/admin/teams/sync', 'POST');
  const plan = proef.body;
  if (proef.status !== 200) {
    vak.textContent = `Dat lukte niet: ${plan?.fout ?? proef.status}`;
    return;
  }

  const samenvatting =
    `${plan.nieuw.length} nieuw, ${plan.gewijzigd.length} gewijzigd, ` +
    `${plan.ongewijzigd.length} ongewijzigd, ${plan.verdwenen.length} niet meer bij de bond` +
    (plan.melding ? `\n\nLet op: ${plan.melding}` : '');

  if (!confirm(`Dit zou er gebeuren:\n\n${samenvatting}\n\nUitvoeren?`)) {
    vak.textContent = `Niets gewijzigd. ${samenvatting}`;
    return;
  }

  const echt = await api('/api/admin/teams/sync?uitvoeren=1', 'POST');
  vak.textContent = echt.status === 200 ? `Klaar. ${samenvatting}` : 'Uitvoeren lukte niet.';
  await laadPloegen();
}

export async function synchroniseerLeden() {
  const vak = el('ledenplan');
  vak.hidden = false;
  vak.textContent = 'Ophalen bij de bond …';

  const proef = await api('/api/admin/leden/sync', 'POST');
  if (proef.status !== 200) {
    vak.textContent = `Dat lukte niet: ${proef.body?.fout ?? proef.status}`;
    return;
  }

  const t = proef.body.totalen;
  const twijfels = proef.body.ploegen.flatMap((p) => p.twijfel ?? []);
  const samenvatting =
    `${proef.body.ploegen.length} ploegen: ${t.nieuw} nieuwe personen, ` +
    `${t.koppelen} gekoppeld aan iemand die er al stond, ${t.bijwerken} bijgewerkt, ` +
    `${t.uit_ploeg} niet meer bij de bond` +
    (t.twijfel
      ? `\n\n${t.twijfel} twijfelgeval(len) — die worden overgeslagen:\n` +
        twijfels.map((x) => `  ${x.lid.naam_vbl}: ${x.reden}`).join('\n')
      : '');

  if (!confirm(`Dit zou er gebeuren:\n\n${samenvatting}\n\nUitvoeren?`)) {
    vak.textContent = `Niets gewijzigd. ${samenvatting}`;
    return;
  }

  const echt = await api('/api/admin/leden/sync?uitvoeren=1', 'POST');
  vak.textContent = echt.status === 200 ? `Klaar. ${samenvatting}` : 'Uitvoeren lukte niet.';
}
