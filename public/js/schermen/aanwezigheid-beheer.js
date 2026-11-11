// Aanwezigheid beheren: de trainingen en wedstrijden van een ploeg tonen,
// erop klikken om de aanwezigheidslijst te zien, en daar vaststellen,
// uitsluiten of een selectie samenstellen.

import { api } from '../api.js';
import { el, toon, veilig } from '../hulp.js';
import { kaart, gegroepeerd, wedstrijdblad } from '../kaart.js';

let huidigeActiviteit = null; // { soort, id }

// Wat de lijsten van de ploeg al ophaalden, zodat de aanwezigheid de
// activiteit zelf kan tonen zonder een extra oproep.
const gekend = { training: new Map(), wedstrijd: new Map() };

const STATUS = { afgelast: 'afgelast', verplaatst: 'verplaatst', zaal_niet_beschikbaar: 'zaal niet beschikbaar' };

/** Een training of wedstrijd van de ploeg als gedeelde kaart (T21). */
export function activiteitKaart(soort, a, { knop = true } = {}) {
  const ploeg = a.naam_kort || a.ploeg_naam || '';
  const status = a.status && a.status !== 'gepland' ? `<p class="gaat-niet-door">${veilig(STATUS[a.status] ?? a.status)}</p>` : '';
  const bond = soort === 'wedstrijd' && a.bij_bond === 0 ? '<p class="gaat-niet-door">niet meer bij de bond</p>' : '';
  return kaart({
    soort,
    datum: a.datum,
    uur: a.begin,
    ploeg: soort === 'training' ? `Training ${ploeg}`.trim() : ploeg,
    tegenstander: soort === 'wedstrijd' ? a.tegenstander : null,
    thuis: soort === 'wedstrijd' ? a.thuis === 1 : null,
    locatie: soort === 'training' ? a.zaal ?? a.locatie_tekst : a.locatie_tekst,
    blad: soort === 'wedstrijd' && a.wedstrijd_guid ? wedstrijdblad(a.wedstrijd_guid) : null,
    uitslag: a.uitslag,
    toestand: (a.status && a.status !== 'gepland') || a.bij_bond === 0 ? 'weg' : null,
    inhoud: status + bond,
    acties: knop
      ? `<div class="vast"><span class="vast-knoppen"><button type="button" data-aanwezigheid="${soort}" data-id="${a.id}">Aanwezigheid${soort === 'wedstrijd' ? ' en selectie' : ''} →</button></span></div>`
      : '',
  });
}

/** Onthoudt de activiteiten van een lijst, voor de kop van de aanwezigheid. */
export function onthoud(soort, lijst) {
  for (const a of lijst) gekend[soort].set(a.id, a);
}

export async function laadTrainingenVoorAanwezigheid(teamGuid) {
  const uitkomst = await api(`/api/admin/trainingen?team=${encodeURIComponent(teamGuid)}`);
  if (uitkomst.status !== 200) return;
  const lijst = uitkomst.body.trainingen ?? [];
  onthoud('training', lijst);
  el('aanwezigheidtrainingenlijst').innerHTML = lijst.length
    ? gegroepeerd(lijst, (t) => activiteitKaart('training', t))
    : '<p class="melding">Geen trainingen gepland.</p>';
}

/** Eén klik-afhandeling voor de kaarten van wedstrijden en trainingen. */
export function koppelAanwezigheidKnoppen() {
  for (const id of ['wedstrijdenlijst', 'aanwezigheidtrainingenlijst']) {
    el(id).addEventListener('click', (e) => {
      const knop = e.target.closest('[data-aanwezigheid]');
      if (knop) toonAanwezigheid(knop.dataset.aanwezigheid, Number(knop.dataset.id));
    });
  }
}

async function toonAanwezigheid(soort, activiteitId) {
  huidigeActiviteit = { soort, id: activiteitId };
  el('aanwezigheidscherm').hidden = false;

  const uitkomst = await api(`/api/admin/aanwezigheid?soort=${soort}&activiteit=${activiteitId}`);
  if (uitkomst.status !== 200) {
    el('aanwezigheidkop').textContent = `Dat lukte niet (${uitkomst.status}).`;
    el('aanwezigheidlijf').innerHTML = '';
    el('selectieblok').hidden = true;
    return;
  }

  const b = uitkomst.body;
  // De activiteit zelf bovenaan (T21): anders zie je niet waarover deze lijst gaat.
  el('aanwezigheidkop').textContent = soort === 'training' ? 'Aanwezigheid — training' : 'Aanwezigheid — wedstrijd';
  const activiteit = gekend[soort].get(activiteitId);
  el('aanwezigheidactiviteit').innerHTML = activiteit ? activiteitKaart(soort, activiteit, { knop: false }) : '';
  el('aanwezigheidscherm').scrollIntoView({ behavior: 'smooth', block: 'start' });

  el('aanwezigheidlijf').innerHTML = b.spelers
    .map((s) => {
      const opgave = s.uitgesloten
        ? `uitgesloten${s.uitgesloten_reden ? ` — ${veilig(s.uitgesloten_reden)}` : ''}`
        : s.opgave_status === 'afwezig'
          ? `afwezig${s.opgave_reden ? ` (${veilig(s.opgave_reden)}${s.opgave_toelichting ? `: ${veilig(s.opgave_toelichting)}` : ''})` : ''}`
          : (s.opgave_status ?? 'nog niet ingevuld');
      return `<tr data-persoon="${veilig(s.id)}">
        <td>${veilig(s.voornaam)} ${veilig(s.achternaam)}</td>
        <td class="ploegen">${opgave}</td>
        <td>
          <select data-vaststelling="${veilig(s.id)}">
            <option value="">—</option>
            <option value="aanwezig" ${s.vaststelling_status === 'aanwezig' ? 'selected' : ''}>aanwezig</option>
            <option value="afwezig" ${s.vaststelling_status === 'afwezig' ? 'selected' : ''}>afwezig</option>
            <option value="te_laat" ${s.vaststelling_status === 'te_laat' ? 'selected' : ''}>te laat</option>
          </select>
        </td>
        <td>
          <button type="button" class="stil" data-uitsluiten="${veilig(s.id)}">
            ${s.uitgesloten ? 'Terugdraaien' : 'Uitsluiten'}
          </button>
        </td>
      </tr>`;
    })
    .join('');

  for (const invoer of el('aanwezigheidlijf').querySelectorAll('[data-vaststelling]')) {
    invoer.addEventListener('change', async () => {
      if (!invoer.value) return;
      await api('/api/admin/aanwezigheid/vaststellen', 'POST', {
        soort, activiteit_id: activiteitId, persoon_id: invoer.dataset.vaststelling, status: invoer.value,
      });
      toon('aanwezigheidmelding', 'Bewaard.');
    });
  }

  for (const knop of el('aanwezigheidlijf').querySelectorAll('[data-uitsluiten]')) {
    knop.addEventListener('click', async () => {
      const persoonId = knop.dataset.uitsluiten;
      const alUitgesloten = knop.textContent.trim() === 'Terugdraaien';
      let reden = null;
      if (!alUitgesloten) {
        reden = prompt('Reden voor uitsluiting (verplicht):');
        if (!reden?.trim()) return; // geannuleerd, of geen reden — de route zou dit toch weigeren
      }
      const uit = await api('/api/admin/aanwezigheid/uitsluiten', 'POST', {
        soort, activiteit_id: activiteitId, persoon_id: persoonId, uitgesloten: !alUitgesloten, reden,
      });
      if (uit.status === 200) await toonAanwezigheid(soort, activiteitId);
      else toon('aanwezigheidmelding', `Dat lukte niet: ${uit.body?.fout}`, true);
    });
  }

  // Selectie: enkel bij een wedstrijd waar de ploeg selecteert.
  const selectieBlok = el('selectieblok');
  if (soort === 'wedstrijd' && b.selectie?.aan) {
    selectieBlok.hidden = false;
    el('selectiestatus').textContent = b.selectie.gepubliceerd
      ? 'Gepubliceerd — de hele ploeg ziet deze namen.'
      : 'Klad — enkel de begeleiding ziet dit tot je publiceert.';

    el('selectielijf').innerHTML = b.spelers
      .map(
        (s) => `<label class="veld">
          <input type="checkbox" value="${veilig(s.id)}" ${b.selectie.geselecteerd.includes(s.id) ? 'checked' : ''}>
          ${veilig(s.voornaam)} ${veilig(s.achternaam)}
        </label>`
      )
      .join('');
  } else {
    selectieBlok.hidden = true;
  }

  // Taken (T1): enkel bij een wedstrijd, en enkel als er taakslots bestaan.
  // Een wedstrijd van een ploeg met een onbekende categorie heeft er geen —
  // dan blijft dit blok gewoon weg in plaats van een lege tabel te tonen.
  await toonTaken(soort, activiteitId);
}

async function toonTaken(soort, activiteitId) {
  const blok = el('taakblok');
  if (soort !== 'wedstrijd') {
    blok.hidden = true;
    return;
  }

  const uit = await api(`/api/admin/wedstrijdtaken?wedstrijd_id=${activiteitId}`);
  if (uit.status !== 200 || !uit.body?.taken?.length) {
    blok.hidden = true;
    return;
  }

  blok.hidden = false;
  el('taakmelding').hidden = true;

  el('taaklijf').innerHTML = uit.body.taken
    .map(
      (t) => `<tr>
        <td>${veilig(t.taak_naam)}</td>
        <td class="ploegen">${
          t.persoon_naam
            ? veilig(t.persoon_naam) +
              (t.probleem_gemeld
                ? ` — <strong>probleem gemeld</strong>${t.probleem_reden ? `: ${veilig(t.probleem_reden)}` : ''}`
                : '')
            : 'nog niemand'
        }</td>
        <td>
          <select data-taak-keuze="${t.id}"></select>
          <button type="button" class="stil" data-taak-toewijzen="${t.id}">Aanduiden</button>
        </td>
      </tr>`
    )
    .join('');

  // De kandidatenlijst is elk actief clublid — zo is T1 uitgeklaard, geen
  // beperking tot ouders van spelers in dat team.
  const personen = await api(`/api/admin/wedstrijdtaken/kandidaten?wedstrijd_id=${activiteitId}`);
  const opties = (personen.body?.kandidaten ?? [])
    .map((p) => `<option value="${veilig(p.id)}">${veilig(p.voornaam)} ${veilig(p.achternaam)}</option>`)
    .join('');

  for (const keuze of el('taaklijf').querySelectorAll('[data-taak-keuze]')) {
    const taakId = Number(keuze.dataset.taakKeuze);
    const taak = uit.body.taken.find((t) => t.id === taakId);
    keuze.innerHTML = `<option value="">— kies —</option>${opties}`;
    if (taak?.persoon_id) keuze.value = taak.persoon_id;
  }

  for (const knop of el('taaklijf').querySelectorAll('[data-taak-toewijzen]')) {
    knop.addEventListener('click', async () => {
      const taakId = Number(knop.dataset.taakToewijzen);
      const keuze = el('taaklijf').querySelector(`[data-taak-keuze="${taakId}"]`);
      const persoonId = keuze?.value;
      if (!persoonId) return;
      const res = await api('/api/admin/wedstrijdtaken/toewijzen', 'POST', {
        wedstrijdtaak_id: taakId,
        persoon_id: persoonId,
      });
      if (res.status === 200) await toonTaken('wedstrijd', activiteitId);
      else toon('taakmelding', res.body?.fout ?? `Fout ${res.status}`, true);
    });
  }
}

export async function bewaarSelectie() {
  if (!huidigeActiviteit || huidigeActiviteit.soort !== 'wedstrijd') return;
  const ids = [...el('selectielijf').querySelectorAll('input:checked')].map((i) => i.value);
  const uit = await api('/api/admin/selectie', 'POST', { wedstrijd_id: huidigeActiviteit.id, persoon_ids: ids });
  toon(
    'aanwezigheidmelding',
    uit.status === 200 ? `Bewaard: ${ids.length} spelers (klad).` : `Dat lukte niet: ${uit.body?.fout}`,
    uit.status !== 200
  );
  if (uit.status === 200) await toonAanwezigheid('wedstrijd', huidigeActiviteit.id);
}

export async function publiceerSelectie() {
  if (!huidigeActiviteit || huidigeActiviteit.soort !== 'wedstrijd') return;
  if (!confirm('Deze selectie publiceren? De hele ploeg ziet dan wie erop staat.')) return;
  const uit = await api('/api/admin/selectie/publiceren', 'POST', { wedstrijd_id: huidigeActiviteit.id });
  if (uit.status === 200) await toonAanwezigheid('wedstrijd', huidigeActiviteit.id);
  else toon('aanwezigheidmelding', `Dat lukte niet: ${uit.body?.fout}`, true);
}
