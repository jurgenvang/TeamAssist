// De beheerdelen van de module Officials (0.41.0, I1 fase 4d, uit YOAssist).
//
// Ze staan in de panelen Dagelijks beheer en Configuratie, zoals in YOAssist,
// en zijn er ook voor een YOADM die de rest van die panelen niet ziet
// (data-recht in index.html, app.js). Elke route vraagt zelf officials.beheren.
//
// Alles wat iets wijzigt of wist, toont eerst wat er zou gebeuren.

import { api } from '../api.js';
import { el, veilig } from '../hulp.js';

const fout = (uit) => `<p class="melding fout">${veilig(uit.body?.fout ?? `Fout ${uit.status}`)}</p>`;

const LIJST_STATUS = {
  ontvangen: 'ontvangen, nog niet verwerkt',
  verwerkt: 'verwerkt',
  fout: 'niet verwerkt',
  dubbel: 'dubbel: dezelfde lijst kwam al binnen',
};

// --- Dagelijks beheer ---------------------------------------------------------

async function laadWoensdaglijst() {
  const doel = el('woensdaglijststatus');
  const uit = await api('/api/admin/officials/woensdaglijst');
  if (uit.status !== 200) {
    doel.innerHTML = fout(uit);
    return;
  }
  const lijsten = uit.body.lijsten;
  doel.innerHTML = lijsten.length
    ? `<ul class="lijst">${lijsten
        .map((l) => {
          const wat = l.van ? `${l.van} tot ${l.tot}` : l.onderwerp || 'onbekend';
          const extra = [
            LIJST_STATUS[l.status] ?? l.status,
            `ontvangen ${String(l.ontvangen ?? '').slice(0, 16)}`,
            l.status === 'fout' && l.fout ? l.fout : null,
            l.aantal_rijen ? `${l.aantal_eigen} eigen van ${l.aantal_rijen}` : l.status !== 'fout' ? 'geen wedstrijden zonder scheidsrechter' : null,
            l.niet_gekoppeld ? `${l.niet_gekoppeld} niet te koppelen` : null,
          ].filter(Boolean);
          return `<li${l.status === 'fout' ? ' class="fout"' : ''}><b>${veilig(wat)}</b><br><span class="klein">${veilig(extra.join(' · '))}</span></li>`;
        })
        .join('')}</ul>`
    : '<p class="klein">Nog geen lijst ontvangen.</p>';
}

function totalenTekst(t) {
  return [
    `${t.gevonden} thuiswedstrijden gevonden`,
    t.nieuw ? `${t.nieuw} nieuw` : null,
    t.gewijzigd ? `${t.gewijzigd} gewijzigd` : null,
    t.bijgewerkt ? `${t.bijgewerkt} met andere scheidsrechters of forfait` : null,
    t.nieuwe_forfaits ? `${t.nieuwe_forfaits} nieuw forfait` : null,
    t.verdwenen ? `${t.verdwenen} niet meer bij de bond` : null,
  ].filter(Boolean).join(', ');
}

async function syncProef() {
  const doel = el('officialssyncmelding');
  doel.innerHTML = '<p class="melding">Ophalen bij de bond…</p>';
  const uit = await api('/api/admin/officials/sync', 'POST');
  if (uit.status !== 200) {
    doel.innerHTML = fout(uit);
    return;
  }
  const b = uit.body;
  doel.innerHTML = `<p class="melding">${veilig(totalenTekst(b.totalen))}.${b.melding ? `<br>${veilig(b.melding)}` : ''}</p>
    <form><button type="button" id="officialssyncecht">Uitvoeren</button></form>`;
  el('officialssyncecht').addEventListener('click', async () => {
    el('officialssyncecht').disabled = true;
    const echt = await api('/api/admin/officials/sync?uitvoeren=1', 'POST');
    doel.innerHTML = echt.status === 200
      ? `<p class="melding">Gesynchroniseerd: ${veilig(totalenTekst(echt.body.totalen))}.</p>`
      : fout(echt);
  });
}

export async function laadDagelijksOfficials() {
  el('officialssyncmelding').innerHTML = '';
  await laadWoensdaglijst();
}

// --- Configuratie ----------------------------------------------------------------

async function laadVolgClubs() {
  const uit = await api('/api/admin/officials/volg-clubs');
  const doel = el('volgclublijst');
  if (uit.status !== 200) {
    doel.innerHTML = fout(uit);
    return;
  }
  const clubs = uit.body.clubs;
  doel.innerHTML = clubs.length
    ? `<ul class="lijst">${clubs
        .map((c) => `<li>${veilig(c.naam || '(naam onbekend)')} <span class="klein">${veilig(c.guid)}</span>
          <button type="button" class="mini" data-volgweg="${veilig(c.guid)}">verwijder</button></li>`)
        .join('')}</ul>`
    : '<p class="klein">Nog geen clubs.</p>';
  for (const k of doel.querySelectorAll('[data-volgweg]')) {
    k.addEventListener('click', async () => {
      if (!confirm(`${k.dataset.volgweg} niet meer volgen?`)) return;
      const v = await api('/api/admin/officials/volg-clubs/weg', 'POST', { guid: k.dataset.volgweg });
      el('volgclubmelding').innerHTML = v.status === 200 ? '' : fout(v);
      await laadVolgClubs();
    });
  }
}

async function laadInstellingen() {
  const uit = await api('/api/admin/officials/instellingen');
  if (uit.status !== 200) {
    el('officialsinstmelding').innerHTML = fout(uit);
    return;
  }
  el('instforfait').value = uit.body.instellingen.forfait_aanduiding.waarde;
  el('instextern').value = uit.body.instellingen.extern_namen.waarde;
}

async function bewaar(sleutel, waarde) {
  const uit = await api('/api/admin/officials/instellingen', 'POST', { sleutel, waarde });
  el('officialsinstmelding').innerHTML = uit.status === 200 ? '<p class="klein">Bewaard.</p>' : fout(uit);
}

export async function laadConfiguratieOfficials() {
  el('volgclubmelding').innerHTML = '';
  el('officialsinstmelding').innerHTML = '';
  await Promise.all([laadVolgClubs(), laadInstellingen()]);
}

/** Eén keer, bij het starten van de app. */
export function koppelOfficialsBeheer() {
  el('officialssyncproef').addEventListener('click', syncProef);
  el('instforfait').addEventListener('change', () => bewaar('forfait_aanduiding', el('instforfait').value));
  el('instextern').addEventListener('change', () => bewaar('extern_namen', el('instextern').value));

  el('volgclubtoevoegen').addEventListener('click', async () => {
    const guid = el('volgclubguid').value.trim().toUpperCase();
    if (!guid) {
      el('volgclubmelding').innerHTML = '<p class="melding fout">Vul een club-GUID in.</p>';
      return;
    }
    const uit = await api('/api/admin/officials/volg-clubs', 'POST', { guid });
    if (uit.status !== 200) {
      el('volgclubmelding').innerHTML = fout(uit);
      return;
    }
    el('volgclubguid').value = '';
    el('volgclubmelding').innerHTML = `<p class="klein">${veilig(uit.body.naam || uit.body.guid)} toegevoegd. De wedstrijden komen bij de volgende synchronisatie.</p>`;
    await laadVolgClubs();
  });

  el('volgclubsync').addEventListener('click', async () => {
    const doel = el('volgclubmelding');
    el('volgclubsync').disabled = true;
    doel.innerHTML = '<p class="melding">Ophalen…</p>';
    const uit = await api('/api/admin/officials/regio/sync', 'POST');
    el('volgclubsync').disabled = false;
    if (uit.status !== 200) {
      doel.innerHTML = fout(uit);
      return;
    }
    const r = uit.body;
    doel.innerHTML = `<p class="melding">${r.clubs} clubs, ${r.gevonden} wedstrijden opgehaald.${
      r.fouten.length ? `<br>Mislukt: ${veilig(r.fouten.join(', '))}` : ''}</p>`;
  });

  // Leegmaken wist: eerst vragen hoeveel, dan bevestigen.
  el('volgclubwis').addEventListener('click', async () => {
    const doel = el('volgclubmelding');
    const proef = await api('/api/admin/officials/regio/leegmaken', 'POST', {});
    if (proef.status !== 200) {
      doel.innerHTML = fout(proef);
      return;
    }
    if (!confirm(`De wedstrijdenlijst van Regio wissen (${proef.body.zou_wissen} wedstrijden)?\n\n` +
        'De gevolgde clubs blijven staan; de volgende synchronisatie bouwt de lijst opnieuw op.')) return;
    const uit = await api('/api/admin/officials/regio/leegmaken', 'POST', { uitvoeren: true });
    doel.innerHTML = uit.status === 200 ? `<p class="klein">${uit.body.gewist} wedstrijden gewist.</p>` : fout(uit);
  });
}
