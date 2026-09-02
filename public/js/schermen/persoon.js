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

  el('persoonverwijderen').textContent = p.actief
    ? 'Op te verwijderen zetten'
    : 'Toch niet verwijderen';
  el('persoonmelding').hidden = true;
  el('persoon').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
