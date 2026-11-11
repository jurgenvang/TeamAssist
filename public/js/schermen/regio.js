// Regio (0.41.0, uit YOAssist V31/V42): wedstrijden bij clubs die de club
// volgt, waar de bond nul of één scheidsrechter heeft, de komende twee
// weekends en vanaf U14.
//
// Per dag staat waar de cijfers vandaan komen. Is de woensdaglijst van de bond
// al verwerkt, dan ligt het vast; anders volgen de cijfers nog de API, en kan
// een wedstrijd woensdag verdwijnen, omdat de bond er toch twee voorziet.

import { api } from '../api.js';
import { el, veilig } from '../hulp.js';
import { kaart as gedeeldeKaart, gegroepeerd, wedstrijdblad } from '../kaart.js';

/** De bron van een dag: 'lijst' als elke wedstrijd uit de verwerkte lijst komt. */
export function bronVanDag(wedstrijden) {
  return wedstrijden.every((w) => w.bron === 'lijst') ? 'lijst' : 'api';
}

// De gedeelde kaart (T21), met de rand die zegt hoe krap het is.
function kaart(w) {
  const refs = w.refs === 0
    ? 'geen scheidsrechter aangeduid'
    : `nog maar één scheidsrechter aangeduid${w.naam ? `: ${veilig(w.naam)}` : ''}`;
  return gedeeldeKaart({
    datum: w.datum,
    uur: w.uur,
    ploeg: w.thuis,
    tegenstander: w.uit,
    cat: w.categorie,
    blad: wedstrijdblad(w.guid),
    data: { refs: w.refs },
    inhoud: `<div class="wed-meta">${veilig(w.club ?? w.club_guid)}</div><div class="wed-refs">${refs}</div>`,
  });
}

function bronKop(w, alle) {
  const bron = bronVanDag(alle.filter((x) => x.datum === w.datum));
  return `<span class="regio-bron${bron === 'api' ? ' api' : ''}">${bron === 'lijst'
    ? 'volgens de lijst van de bond'
    : 'volgens de API — de lijst van de bond volgt woensdag'}</span>`;
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
  doel.innerHTML = `<div class="teller open"><b>${wedstrijden.length}</b> <span>krap bij ${clubTekst}, de komende twee weekends.</span></div>
    ${gegroepeerd(wedstrijden, kaart, { extraKop: bronKop })}`;
}
