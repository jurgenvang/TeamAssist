// Regio (0.41.0, uit YOAssist V31/V42): wedstrijden bij clubs die de club
// volgt, waar de bond nul of één scheidsrechter heeft, de komende twee
// weekends en vanaf U14.
//
// Per dag staat waar de cijfers vandaan komen. Is de woensdaglijst van de bond
// al verwerkt, dan ligt het vast; anders volgen de cijfers nog de API, en kan
// een wedstrijd woensdag verdwijnen, omdat de bond er toch twee voorziet.

import { api } from '../api.js';
import { el, veilig } from '../hulp.js';
import { dagVan, maandLabel } from '../officials-hulp.js';

const wedstrijdblad = (guid) => `https://vblweb.wisseq.eu/Home/MatchDetail?wedguid=${encodeURIComponent(guid)}`;

/** De bron van een dag: 'lijst' als elke wedstrijd uit de verwerkte lijst komt. */
export function bronVanDag(wedstrijden) {
  return wedstrijden.every((w) => w.bron === 'lijst') ? 'lijst' : 'api';
}

function kaart(w) {
  const refs = w.refs === 0
    ? 'geen scheidsrechter aangeduid'
    : `nog maar één scheidsrechter aangeduid${w.naam ? `: ${veilig(w.naam)}` : ''}`;
  return `<article class="wed" data-refs="${w.refs}">
    <div class="wed-datum"><b>${veilig(w.uur ?? '')}</b></div>
    <div class="wed-lijf">
      <div class="wed-ploegen"><b>${veilig(w.thuis ?? '')}</b> – ${veilig(w.uit ?? '')}</div>
      <div class="wed-meta klein">
        <span class="cat">${veilig(w.categorie ?? '')}</span> ${veilig(w.club ?? w.club_guid)}
        — <a href="${wedstrijdblad(w.guid)}" target="_blank" rel="noopener">wedstrijdblad</a>
      </div>
      <div class="wed-refs">${refs}</div>
    </div>
  </article>`;
}

export async function laadRegio() {
  const doel = el('regiolijst');
  const uit = await api('/api/admin/officials/regio');
  if (uit.status !== 200) {
    doel.innerHTML = `<p class="melding fout">${veilig(uit.body?.fout ?? `Fout ${uit.status}`)}</p>`;
    return;
  }
  const { aantal_clubs: clubs, wedstrijden } = uit.body;
  const clubTekst = `${clubs} gevolgde ${clubs === 1 ? 'club' : 'clubs'}`;
  if (!clubs) {
    doel.innerHTML = '<p class="melding">Nog geen clubs om te volgen. Voeg ze toe bij Beheer → Configuratie → Regio.</p>';
    return;
  }
  if (!wedstrijden.length) {
    doel.innerHTML = `<div class="teller klaar"><b>0</b> <span>krap bij de ${clubTekst} de komende twee weekends.</span></div>`;
    return;
  }

  const delen = [`<div class="teller open"><b>${wedstrijden.length}</b> <span>krap bij ${clubTekst}, de komende twee weekends.</span></div>`];
  let vorige = null;
  for (const w of wedstrijden) {
    if (w.datum !== vorige) {
      const d = dagVan(w.datum);
      const bron = bronVanDag(wedstrijden.filter((x) => x.datum === w.datum));
      delen.push(`<div class="dag-kop">${d.dag} ${d.nr} ${veilig(maandLabel(w.datum.slice(0, 7)).split(' ')[0])}
        <span class="regio-bron${bron === 'api' ? ' api' : ''}">${bron === 'lijst'
          ? 'volgens de lijst van de bond'
          : 'volgens de API — de lijst van de bond volgt woensdag'}</span></div>`);
      vorige = w.datum;
    }
    delen.push(kaart(w));
  }
  doel.innerHTML = delen.join('');
}
