// Mijn berichten, het meldingenbolletje en de banner (0.28.0, uit YOAssist).
//
// Een bericht wordt pas gelezen als je het zelf aantikt, niet bij het openen
// van de lijst: zo kan je eerst scannen zonder dat de stipjes verdwijnen.

import { api } from '../api.js';
import { el, toon, veilig } from '../hulp.js';

// Hoe vaak de teller zichzelf ververst terwijl de app openstaat. Enkel als
// het tabblad zichtbaar is: een vergeten tabblad hoort de backend niet de hele
// dag te bevragen.
const TELLER_INTERVAL_MS = 3 * 60 * 1000;

let ongelezen = 0;

function zetTeller(n) {
  ongelezen = Math.max(0, n);
  const badge = el('berichtenbadge');
  badge.textContent = ongelezen > 9 ? '9+' : String(ongelezen);
  badge.hidden = ongelezen === 0;
  badge.setAttribute('aria-label', `${ongelezen} ongelezen bericht${ongelezen === 1 ? '' : 'en'}`);
}

export async function ververTeller() {
  const uit = await api('/api/berichten/ongelezen');
  if (uit.status === 200) zetTeller(uit.body.ongelezen);
}

export function startTeller() {
  ververTeller();
  setInterval(() => {
    if (document.visibilityState === 'visible') ververTeller();
  }, TELLER_INTERVAL_MS);
  // Terug naar de app na een tijd elders: meteen bijwerken, niet wachten.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ververTeller();
  });
}

/**
 * Tekst zoals verstuurd, met de links erin klikbaar. Eerst ontsmet, dan pas
 * de links: zo kan een bericht nooit eigen HTML in het scherm brengen, en
 * enkel http(s) wordt een link.
 */
export function metLinks(tekst) {
  return veilig(tekst).replace(
    /https?:\/\/[^\s<]+/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}

function datumTekst(sqlTijd) {
  // 'jjjj-mm-dd uu:mm:ss' in UTC uit de databank.
  const d = new Date(`${String(sqlTijd).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return sqlTijd ?? '';
  return d.toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export async function toonBerichten() {
  el('berichtenscherm').hidden = false;
  el('berichtenscherm').scrollIntoView({ block: 'start' });
  const lijst = el('berichtenlijst');
  lijst.innerHTML = '<p class="klein">Laden…</p>';

  const uit = await api('/api/berichten');
  if (uit.status !== 200) {
    lijst.innerHTML = '';
    toon('berichtenmelding', `Laden lukte niet (${uit.status}).`, true);
    return;
  }
  el('berichtenmelding').hidden = true;
  zetTeller(uit.body.ongelezen);

  const berichten = uit.body.berichten ?? [];
  if (!berichten.length) {
    lijst.innerHTML = '<p class="melding">Er zijn nog geen berichten. Wat de app je stuurt, komt hier.</p>';
    return;
  }
  lijst.innerHTML = berichten
    .map(
      (b) => `
      <article class="bericht${b.gelezen ? '' : ' ongelezen'}" data-id="${b.id}">
        <div class="bericht-kop">
          ${b.gelezen ? '' : '<span class="bericht-stip" aria-label="ongelezen"></span>'}
          <strong>${veilig(b.onderwerp)}</strong>
          <span class="klein bericht-tijd">${veilig(datumTekst(b.verzonden))}</span>
          ${
            // Een bericht van een kind (0.32.0): verwijderen kan enkel het kind zelf.
            b.voor ? '' : `<button type="button" class="alslink bericht-weg" data-weg="${b.id}" aria-label="Verwijderen">×</button>`
          }
        </div>
        ${b.voor ? `<p class="klein bericht-voor">Voor ${veilig(b.voor)}</p>` : ''}
        <p class="bericht-kort">${veilig(b.kort)}</p>
        ${b.inhoud ? `<div class="bericht-volledig" hidden>${metLinks(b.inhoud)}</div><p class="klein bericht-meer">lees meer</p>` : ''}
      </article>`
    )
    .join('');

  for (const kaart of lijst.querySelectorAll('article.bericht')) {
    kaart.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      openBericht(kaart);
    });
  }
  for (const knop of lijst.querySelectorAll('button[data-weg]')) {
    knop.addEventListener('click', () => verwijderBericht(knop.closest('article')));
  }
}

async function openBericht(kaart) {
  const volledig = kaart.querySelector('.bericht-volledig');
  if (volledig) {
    volledig.hidden = !volledig.hidden;
    // De korte regel is meestal de eerste zin van de volledige tekst; samen
    // getoond staat die er twee keer.
    kaart.querySelector('.bericht-kort').hidden = !volledig.hidden;
    kaart.querySelector('.bericht-meer').textContent = volledig.hidden ? 'lees meer' : 'minder';
  }
  if (kaart.classList.contains('ongelezen')) {
    kaart.classList.remove('ongelezen');
    kaart.querySelector('.bericht-stip')?.remove();
    zetTeller(ongelezen - 1);
    await api('/api/berichten/gelezen', 'POST', { id: Number(kaart.dataset.id) });
  }
}

async function verwijderBericht(kaart) {
  const uit = await api('/api/berichten/verwijderen', 'POST', { id: Number(kaart.dataset.id) });
  if (uit.status !== 200) return toon('berichtenmelding', 'Verwijderen lukte niet.', true);
  if (kaart.classList.contains('ongelezen')) zetTeller(ongelezen - 1);
  kaart.remove();
}

export async function allesGelezen() {
  const uit = await api('/api/berichten/gelezen', 'POST', { alles: true });
  if (uit.status !== 200) return toon('berichtenmelding', 'Dat lukte niet.', true);
  zetTeller(0);
  for (const kaart of el('berichtenlijst').querySelectorAll('article.ongelezen')) {
    kaart.classList.remove('ongelezen');
    kaart.querySelector('.bericht-stip')?.remove();
  }
}

// --- de banner ---------------------------------------------------------------

export async function toonMededeling() {
  const uit = await api('/api/mededeling');
  const m = uit.status === 200 ? uit.body.mededeling : null;
  const vak = el('mededeling');
  if (!m) {
    vak.hidden = true;
    return;
  }
  el('mededelingtekst').textContent = m.tekst;
  const link = el('mededelinglink');
  // De backend aanvaardt enkel http(s); hier nog eens, omdat dit in een href
  // terechtkomt.
  if (m.link && /^https?:\/\//.test(m.link)) {
    link.href = m.link;
    link.textContent = m.link_tekst || 'Meer lezen';
    link.hidden = false;
  } else {
    link.hidden = true;
  }
  vak.dataset.id = m.id;
  vak.hidden = false;
}

export async function mededelingWegklikken() {
  const vak = el('mededeling');
  vak.hidden = true;
  await api('/api/mededeling/wegklikken', 'POST', { id: Number(vak.dataset.id) });
}
