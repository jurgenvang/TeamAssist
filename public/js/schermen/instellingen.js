// Instellingen, waaronder de schakelaar voor de testrol en de huisstijl.

import { api } from '../api.js';
import { el, toon, veilig } from '../hulp.js';
import { pasHuisstijlToe } from '../huisstijl.js';

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
            : def.soort === 'kleur'
              ? `<input type="color" data-sleutel="${sleutel}" value="${veilig(def.waarde || '#000000')}">
                 <button type="button" class="stil" data-wiskleur="${sleutel}">Standaard</button>`
              : `<input type="text" data-sleutel="${sleutel}" value="${veilig(def.waarde)}">`;
      return `<tr><td>${sleutel}</td><td>${invoer}</td></tr>`;
    })
    .join('');

  for (const invoer of el('instellingenlijf').querySelectorAll('[data-sleutel]')) {
    invoer.addEventListener('change', () => bewaarInstelling(invoer.dataset.sleutel, invoer));
  }
  for (const knop of el('instellingenlijf').querySelectorAll('[data-wiskleur]')) {
    // Een kleur 'wissen' is een lege waarde bewaren, niet een kleur raden: dat
    // zou de club een andere kleur geven zonder dat ze het koos.
    knop.addEventListener('click', async () => {
      const uit = await api('/api/admin/instellingen', 'POST', { sleutel: knop.dataset.wiskleur, waarde: '' });
      el('instellingmelding').textContent = uit.status === 200 ? 'Teruggezet op de standaardkleur.' : 'Dat lukte niet.';
      if (uit.status === 200) {
        await laadInstellingen();
        await pasHuisstijlToe();
      }
    });
  }
}

async function bewaarInstelling(sleutel, invoer) {
  const waarde = invoer.type === 'checkbox' ? invoer.checked : invoer.value;
  const uit = await api('/api/admin/instellingen', 'POST', { sleutel, waarde });
  el('instellingmelding').textContent =
    uit.status === 200 ? 'Bewaard.' : `Dat lukte niet: ${uit.body?.fout ?? uit.status}`;
  if (uit.status !== 200 && invoer.type === 'color') {
    // Een afgekeurde kleur (te weinig contrast) springt terug naar wat er
    // daarvoor stond, in plaats van de geweigerde waarde te laten staan alsof
    // ze bewaard was.
    await laadInstellingen();
    return;
  }
  // De testrolschakelaar verandert wat er op het scherm hoort te staan.
  if (sleutel === 'testrol_toegelaten') location.reload();
  if (sleutel === 'clubkleur_accent' || sleutel === 'clublogo_url') await pasHuisstijlToe();
}

// --- Voorstel ophalen bij de bond -------------------------------------------

export async function haalBrandingvoorstel() {
  const vak = el('brandingvoorstel');
  vak.hidden = false;
  vak.textContent = 'Ophalen bij de bond …';

  const uit = await api('/api/admin/branding-voorstel');
  if (uit.status !== 200) {
    vak.textContent = `Dat lukte niet: ${uit.body?.fout ?? uit.status}`;
    return;
  }

  const b = uit.body;
  const stukken = [];
  stukken.push(`Logo (nog niet uit de officiële documentatie bevestigd, enkel afgeleid): ${b.logo_url}`);
  if (b.shirt_kleur_ruw) {
    stukken.push(
      b.shirt_kleur_bruikbaar.ok
        ? `Kleur van de bond: ${b.shirt_kleur_ruw} — bruikbaar als accentkleur.`
        : `Kleur van de bond: ${b.shirt_kleur_ruw} — niet bruikbaar (${b.shirt_kleur_bruikbaar.reden}).`
    );
  } else {
    stukken.push('De bond gaf geen shirtkleur terug.');
  }

  vak.innerHTML = `<p>${stukken.map(veilig).join('</p><p>')}</p>`;

  const knoppenRij = document.createElement('p');
  const logoKnop = document.createElement('button');
  logoKnop.type = 'button';
  logoKnop.textContent = 'Dit logo gebruiken';
  logoKnop.addEventListener('click', async () => {
    await api('/api/admin/instellingen', 'POST', { sleutel: 'clublogo_url', waarde: b.logo_url });
    await api('/api/admin/instellingen', 'POST', { sleutel: 'clublogo_bron', waarde: 'vbl' });
    await laadInstellingen();
    await pasHuisstijlToe();
    toon('instellingmelding', 'Logo overgenomen.');
  });
  knoppenRij.appendChild(logoKnop);

  if (b.shirt_kleur_bruikbaar?.ok) {
    const kleurKnop = document.createElement('button');
    kleurKnop.type = 'button';
    kleurKnop.className = 'stil';
    kleurKnop.textContent = 'Deze kleur gebruiken';
    kleurKnop.addEventListener('click', async () => {
      const res = await api('/api/admin/instellingen', 'POST', { sleutel: 'clubkleur_accent', waarde: b.shirt_kleur_ruw });
      if (res.status === 200) {
        await laadInstellingen();
        await pasHuisstijlToe();
        toon('instellingmelding', 'Kleur overgenomen.');
      } else {
        toon('instellingmelding', `Dat lukte niet: ${res.body?.fout}`, true);
      }
    });
    knoppenRij.appendChild(kleurKnop);
  }
  vak.appendChild(knoppenRij);
}
