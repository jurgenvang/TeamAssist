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
  const beinvloedtHuisstijl = ['clubkleur_accent', 'clubkleur_topbalk', 'clublogo_url'];
  if (beinvloedtHuisstijl.includes(sleutel)) await pasHuisstijlToe();
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
  if (b.shirt_kleur_ruw) {
    stukken.push(`Kleur van de bond: ${b.shirt_kleur_ruw}`);
    stukken.push(
      b.shirt_kleur_bruikbaar.ok
        ? '— bruikbaar als accentkleur (knoppen, links).'
        : `— niet bruikbaar als accentkleur (${b.shirt_kleur_bruikbaar.reden}).`
    );
    stukken.push(
      b.shirt_kleur_bruikbaar_topbalk.ok
        ? `— bruikbaar als topbalkkleur, met ${b.shirt_kleur_bruikbaar_topbalk.tekstkleur === '#000000' ? 'zwarte' : 'witte'} tekst erop.`
        : `— niet bruikbaar als topbalkkleur (${b.shirt_kleur_bruikbaar_topbalk.reden}).`
    );
  } else {
    stukken.push('De bond gaf geen shirtkleur terug.');
  }

  vak.innerHTML = '';

  // Het logo zelf tonen in plaats van enkel de URL: een link zegt niets over
  // hoe het logo eruitziet, een voorbeeld wel. Laadt het niet — het
  // URL-patroon is niet uit de officiële documentatie bevestigd — dan valt
  // dit terug op de tekst, net als bij het toepassen in huisstijl.js.
  const logoRij = document.createElement('p');
  const logoImg = document.createElement('img');
  logoImg.src = b.logo_url;
  logoImg.alt = 'Voorgesteld clublogo';
  logoImg.className = 'logovoorbeeld';
  const logoOnderschrift = document.createElement('span');
  logoOnderschrift.className = 'klein';
  logoOnderschrift.textContent = 'Niet uit de officiële documentatie bevestigd, enkel afgeleid uit het club-GUID.';
  logoImg.addEventListener('error', () => {
    logoImg.remove();
    logoOnderschrift.textContent = `Logo kon niet geladen worden (${b.logo_url}).`;
  });
  logoRij.append(logoImg, document.createElement('br'), logoOnderschrift);
  vak.appendChild(logoRij);

  const tekstRij = document.createElement('p');
  tekstRij.innerHTML = stukken.map(veilig).join('<br>');
  vak.appendChild(tekstRij);

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
    knoppenRij.appendChild(
      maakKleurknop('Als accentkleur gebruiken', 'clubkleur_accent', b.shirt_kleur_ruw, 'stil')
    );
  }
  if (b.shirt_kleur_bruikbaar_topbalk?.ok) {
    knoppenRij.appendChild(
      maakKleurknop('Als topbalkkleur gebruiken', 'clubkleur_topbalk', b.shirt_kleur_ruw, 'stil')
    );
  }
  vak.appendChild(knoppenRij);
}

function maakKleurknop(tekst, sleutel, waarde, klasse) {
  const knop = document.createElement('button');
  knop.type = 'button';
  if (klasse) knop.className = klasse;
  knop.textContent = tekst;
  knop.addEventListener('click', async () => {
    const res = await api('/api/admin/instellingen', 'POST', { sleutel, waarde });
    if (res.status === 200) {
      await laadInstellingen();
      await pasHuisstijlToe();
      toon('instellingmelding', 'Kleur overgenomen.');
    } else {
      toon('instellingmelding', `Dat lukte niet: ${res.body?.fout}`, true);
    }
  });
  return knop;
}
