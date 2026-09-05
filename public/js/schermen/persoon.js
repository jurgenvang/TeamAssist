// Eén persoon bekijken en aanpassen.

import { api } from '../api.js';
import { el, toon, veilig } from '../hulp.js';

const VELDEN = [
  ['voornaam', 'Voornaam'],
  ['achternaam', 'Achternaam'],
  ['geboortedatum', 'Geboortedatum (jjjj-mm-dd)'],
  ['email', 'E-mailadres'],
  ['tel_vast', 'Telefoon vast'],
  ['tel_gsm', 'Gsm'],
  ['straat', 'Straat'],
  ['nummer', 'Nummer'],
  ['bus', 'Bus'],
  ['postcode', 'Postcode'],
  ['gemeente', 'Gemeente'],
];

let huidige = null;

export async function toonPersoon(id) {
  const uitkomst = await api(`/api/admin/persoon?id=${encodeURIComponent(id)}`);
  if (uitkomst.status !== 200) return;

  const p = uitkomst.body.persoon;
  huidige = p;
  el('persoon').hidden = false;
  el('persoonkop').textContent = `${p.voornaam} ${p.achternaam}`;

  // De herkomst erbij: dat verklaart waarom een veld staat zoals het staat, en
  // of een correctie zal blijven staan.
  const stukken = [];
  if (p.naam_vbl) stukken.push(`Bij de bond: ${p.naam_vbl}`);
  if (p.lid_nr) stukken.push(`lidnummer ${p.lid_nr}`);
  stukken.push(`naam ${p.naam_bron === 'club' ? 'handmatig gezet' : 'afgeleid van de bond'}`);
  if (!p.actief) stukken.push('staat op te verwijderen');
  el('persoonherkomst').textContent = stukken.join(' — ');

  el('persoonvelden').innerHTML = VELDEN.map(
    ([veld, label]) => `<label class="veld"><span>${label}</span>
      <input type="text" data-veld="${veld}" value="${veilig(p[veld] ?? '')}"></label>`
  ).join('');

  toonPloegen(p.ploegen ?? []);
  await vulTeamkeuze();

  el('persoonverwijderen').textContent = p.actief
    ? 'Op te verwijderen zetten'
    : 'Toch niet verwijderen';
  el('persoonmelding').hidden = true;
  el('persoon').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function toonPloegen(ploegen) {
  el('persoonploegenlijf').innerHTML = ploegen
    .map((pl) => {
      const herkomst = pl.bron === 'club' ? 'handmatig gekoppeld' : pl.bij_bond ? 'bij de bond' : 'niet meer bij de bond';
      return `<tr>
        <td>${veilig(pl.naam)}</td>
        <td class="ploegen">${herkomst}</td>
        <td>${
          pl.bron === 'club'
            ? `<button type="button" class="alslink" data-team-ontkoppelen="${veilig(pl.guid)}">Ontkoppelen</button>`
            : ''
        }</td>
      </tr>`;
    })
    .join('');

  for (const knop of el('persoonploegenlijf').querySelectorAll('[data-team-ontkoppelen]')) {
    knop.addEventListener('click', async () => {
      if (!huidige) return;
      if (!confirm('Deze handmatige koppeling verwijderen?')) return;
      const uit = await api('/api/admin/persoon/team-ontkoppelen', 'POST', {
        persoon_id: huidige.id,
        team_guid: knop.dataset.teamOntkoppelen,
      });
      if (uit.status === 200) await toonPersoon(huidige.id);
      else toon('persoonmelding', uit.body?.fout ?? `Fout ${uit.status}`, true);
    });
  }
}

async function vulTeamkeuze() {
  const uit = await api('/api/admin/teams');
  if (uit.status !== 200) return;
  el('persoonteamkeuze').innerHTML = (uit.body.teams ?? [])
    .map((t) => `<option value="${veilig(t.guid)}">${veilig(t.naam_kort ?? t.naam)}</option>`)
    .join('');
}

async function bewaar() {
  if (!huidige) return;
  const body = { id: huidige.id };
  for (const invoer of el('persoonvelden').querySelectorAll('input[data-veld]')) {
    body[invoer.dataset.veld] = invoer.value;
  }

  const uitkomst = await api('/api/admin/persoon', 'POST', body);
  if (uitkomst.status !== 200) {
    toon('persoonmelding', uitkomst.body?.fout ?? `Fout ${uitkomst.status}`, true);
    return;
  }
  const gewijzigd = uitkomst.body.gewijzigd;
  toon(
    'persoonmelding',
    gewijzigd.length
      ? `Bewaard: ${gewijzigd.join(', ')}. Wat je zelf invulde, wordt niet meer door de bond overschreven.`
      : 'Er was niets gewijzigd.'
  );
  await toonPersoon(huidige.id);
}

export function koppelPersoonscherm() {
  el('persoonbewaren').addEventListener('click', bewaar);
  el('persoonteamkoppelen').addEventListener('click', async () => {
    if (!huidige) return;
    const team_guid = el('persoonteamkeuze').value;
    if (!team_guid) return;
    const uit = await api('/api/admin/persoon/team-koppelen', 'POST', { persoon_id: huidige.id, team_guid });
    if (uit.status === 200) await toonPersoon(huidige.id);
    else toon('persoonmelding', uit.body?.fout ?? `Fout ${uit.status}`, true);
  });
  el('persoonsluiten').addEventListener('click', () => {
    el('persoon').hidden = true;
    huidige = null;
  });
  el('persoonverwijderen').addEventListener('click', async () => {
    if (!huidige) return;
    const naarActief = !huidige.actief;
    if (!naarActief && !confirm('Deze persoon op te verwijderen zetten? Hij blijft zichtbaar voor beheerders.')) {
      return;
    }
    const uitkomst = await api('/api/admin/persoon/actief', 'POST', {
      id: huidige.id,
      actief: naarActief,
    });
    if (uitkomst.status !== 200) {
      toon('persoonmelding', uitkomst.body?.fout ?? `Fout ${uitkomst.status}`, true);
      return;
    }
    await toonPersoon(huidige.id);
  });
}
