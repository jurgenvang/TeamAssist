// Berichten ook naar de ouders (0.32.0), bij Mijn voorkeuren.
//
// Wat mag, beslist de backend (src/routes/meelezen.js); dit scherm toont de
// stand en biedt enkel de knoppen aan die er voor deze persoon toe doen.

import { api } from '../api.js';
import { el, toon, veilig } from '../hulp.js';

function wachtTekst(vraag) {
  if (!vraag) return '';
  const delen = [];
  if (vraag.wacht_op.length) delen.push(`wacht nog op ${vraag.wacht_op.join(' en ')}`);
  if (vraag.ja.length) delen.push(`${vraag.ja.join(' en ')} zei${vraag.ja.length > 1 ? 'den' : ''} al ja`);
  return `Je vroeg om ze uit te zetten: ${delen.join('; ')}.`;
}

function zelfHtml(z) {
  if (!z) return '';
  const ouders = veilig(z.ouders.join(' en '));
  if (z.aan) {
    const knop = z.vraag
      ? `<p class="klein">${veilig(wachtTekst(z.vraag))}</p>
         <button type="button" class="stil" data-meelezen-zelf="aan">Vraag intrekken</button>`
      : `<button type="button" class="stil" data-meelezen-zelf="uit">${z.minderjarig ? 'Vragen om uit te zetten' : 'Uitzetten'}</button>`;
    return `<p>Berichten van de club gaan ook naar ${ouders}.</p>
      ${z.minderjarig && !z.vraag ? '<p class="klein">Uitzetten kan pas als elke ouder toestemming geeft.</p>' : ''}
      <form>${knop}</form>`;
  }
  return `<p>Berichten van de club gaan enkel naar jou, niet naar ${ouders}.</p>
    <form><button type="button" class="stil" data-meelezen-zelf="aan">Ook naar mijn ouders sturen</button></form>`;
}

function kindHtml(k) {
  const naam = veilig(k.naam);
  let regel;
  if (k.verplicht) regel = `${naam} heeft geen eigen e-mailadres: de berichten gaan altijd naar de ouders.`;
  else if (k.aan) regel = `Berichten aan ${naam} gaan ook naar de ouders.`;
  else regel = `Berichten aan ${naam} gaan enkel naar ${naam}.`;

  let knoppen = '';
  if (k.mijn_antwoord_gevraagd) {
    regel += ` ${naam} vraagt om ze enkel nog naar ${naam} te sturen. Geef je toestemming?`;
    knoppen = `<button type="button" data-meelezen-antwoord="ja" data-kind="${veilig(k.id)}">Ja</button>
      <button type="button" class="stil" data-meelezen-antwoord="nee" data-kind="${veilig(k.id)}">Nee</button>`;
  } else if (!k.verplicht && !k.aan && k.minderjarig) {
    knoppen = `<button type="button" class="stil" data-meelezen-kind="${veilig(k.id)}">Weer ook naar de ouders sturen</button>`;
  }
  return `<p>${regel}</p>${knoppen ? `<form>${knoppen}</form>` : ''}`;
}

export async function toonMeelezen() {
  const uit = await api('/api/meelezen');
  if (uit.status !== 200) return;
  const { zelf, kinderen } = uit.body;
  el('meelezen').hidden = !zelf && !kinderen.length;
  el('meelezenzelf').innerHTML = zelfHtml(zelf);
  el('meelezenkinderen').innerHTML = kinderen.map(kindHtml).join('');
}

async function na(uitkomst) {
  if (uitkomst.status !== 200) {
    toon('meelezenmelding', uitkomst.body?.fout ?? `Fout ${uitkomst.status}`, true);
    return;
  }
  const b = uitkomst.body;
  toon(
    'meelezenmelding',
    b.toestemming_gevraagd
      ? `De vraag ging naar ${b.toestemming_gevraagd} ouder(s). Tot iedereen ja zegt, blijft het zoals het is.`
      : 'Bewaard.'
  );
  await toonMeelezen();
}

export function koppelMeelezen() {
  el('meelezen').addEventListener('click', async (e) => {
    const knop = e.target.closest('button');
    if (!knop) return;
    if (knop.dataset.meelezenZelf) {
      await na(await api('/api/meelezen', 'POST', { aan: knop.dataset.meelezenZelf === 'aan' }));
    } else if (knop.dataset.meelezenKind) {
      await na(await api('/api/meelezen', 'POST', { aan: true, kind_id: knop.dataset.meelezenKind }));
    } else if (knop.dataset.meelezenAntwoord) {
      await na(
        await api('/api/meelezen/antwoord', 'POST', {
          kind_id: knop.dataset.kind,
          ja: knop.dataset.meelezenAntwoord === 'ja',
        })
      );
    }
  });
}
