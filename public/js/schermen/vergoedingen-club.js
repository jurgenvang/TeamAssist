// Vergoedingen club (0.40.0, I1 fase 4c, uit YOAssist).
//
// Een maand afsluiten gaat altijd langs het voorbeeld: eerst zien wat er
// betaald wordt, per official met de wedstrijden erbij, en pas dan afsluiten.
// Daarna liggen de bedragen vast; wat nadien verandert, komt als correctie in
// de volgende maand (officials/facturatie.js).
//
// Weghalen uit het voorbeeld is gewoon vrijgeven, zoals in het cluboverzicht:
// dan kloppen het cluboverzicht, Mijn vergoeding en het logboek vanzelf mee,
// zonder uitzondering in de facturatie. Enkel voor wie de officials beheert
// (vrijgeven vraagt officials.beheren); een FINADM ziet de knop niet.
//
// Nieuw tegenover YOAssist: de tarieven zijn hier aan te passen. In YOAssist
// kon dat enkel via de console.

import { api } from '../api.js';
import { el, veilig } from '../hulp.js';
import { maandLabel, naarCent, wedstrijdTekst } from '../officials-hulp.js';

const staat = { magVrijgeven: false };

export async function laadVergoedingen(rechten = {}) {
  staat.magVrijgeven = Object.hasOwn(rechten, 'officials.beheren');
  el('vergoedingendetail').innerHTML = '';
  await Promise.all([laadMaanden(), laadTarieven()]);
}

const fout = (uit) => `<p class="melding fout">${veilig(uit.body?.fout ?? `Fout ${uit.status}`)}</p>`;

async function laadMaanden() {
  const uit = await api('/api/admin/officials/facturatie');
  const doel = el('vergoedingenmaanden');
  if (uit.status !== 200) {
    doel.innerHTML = fout(uit);
    return;
  }
  const b = uit.body;
  el('vergoedingenontvangers').value = b.ontvangers ?? '';

  const open = b.open.length
    ? b.open
        .map(
          (m) => `<div class="maandblok">
            <h3>${veilig(maandLabel(m.maand))}</h3>
            <p class="klein">${m.aanduidingen} aanduiding${m.aanduidingen === 1 ? '' : 'en'}${m.mag ? '' : ` — ${veilig(m.reden ?? '')}`}</p>
            <button type="button" data-voorbeeld="${veilig(m.maand)}" ${m.mag ? '' : 'disabled'}>
              ${m.mag ? 'Bekijken en afsluiten' : 'Nog niet af te sluiten'}</button>
          </div>`
        )
        .join('')
    : '<p class="klein">Geen openstaande maanden.</p>';

  const afgesloten = b.afgesloten.length
    ? `<h3>Afgesloten</h3><table><thead><tr><th>Maand</th><th>Officials</th><th>Totaal</th><th></th></tr></thead><tbody>${b.afgesloten
        .map(
          (a) => `<tr><td>${veilig(maandLabel(a.maand))}</td><td>${a.aantal_officials}</td>
            <td>${veilig(a.totaal)}</td><td><button type="button" class="mini" data-staat="${veilig(a.maand)}">bekijk</button></td></tr>`
        )
        .join('')}</tbody></table>`
    : '';

  doel.innerHTML = open + afgesloten;
  for (const k of doel.querySelectorAll('[data-voorbeeld]')) k.addEventListener('click', () => toonVoorbeeld(k.dataset.voorbeeld));
  for (const k of doel.querySelectorAll('[data-staat]')) k.addEventListener('click', () => toonStaat(k.dataset.staat));
}

function regelTekst(r) {
  const wat = `${r.soort === 'correctie' && r.aantal > 0 ? '+' : ''}${r.aantal} × ${r.catLabel ?? r.catCode}`;
  return r.soort === 'correctie' ? `correctie ${maandLabel(r.betreftMaand)}: ${wat}` : wat;
}

/**
 * Eén official. De knop 'weg' enkel bij werk in een open maand: een correctie
 * op een afgesloten maand is al uitbetaald, en die haal je hier niet weg.
 */
function officialHtml(o, { weghalen = false } = {}) {
  const wedstrijden = o.wedstrijden ?? [];
  return `<div class="maandblok">
    <h3>${veilig(o.naam)} <span class="bedrag">${veilig(o.totaal)}</span></h3>
    <ul>${o.regels.map((r) => `<li>${veilig(regelTekst(r))} — ${veilig(r.bedrag)}</li>`).join('')}</ul>
    ${wedstrijden.length ? `<details${weghalen ? ' open' : ''}><summary>Wedstrijden (${wedstrijden.length})</summary><ul class="klein">${wedstrijden
      .map(
        (w) => `<li>${veilig(wedstrijdTekst(w))}${
          weghalen && staat.magVrijgeven && w.soort !== 'correctie' && w.wedstrijdId
            ? ` <button type="button" class="mini" data-weg="${w.wedstrijdId}" data-persoon="${veilig(o.persoonId)}"
                 data-naam="${veilig(o.naam)}" data-wat="${veilig(w.wedstrijd)}">weg</button>`
            : ''
        }</li>`
      )
      .join('')}</ul></details>` : ''}
  </div>`;
}

async function toonVoorbeeld(maand) {
  const doel = el('vergoedingendetail');
  doel.innerHTML = '<p class="melding">Berekenen…</p>';
  const uit = await api(`/api/admin/officials/facturatie/voorbeeld?maand=${encodeURIComponent(maand)}`);
  if (uit.status !== 200) {
    doel.innerHTML = fout(uit);
    return;
  }
  const r = uit.body;
  const waarschuwingen = [];
  if (r.zonder_tarief.length) {
    const codes = [...new Set(r.zonder_tarief.map((z) => z.catCode))].join(', ');
    waarschuwingen.push(`<p class="melding fout">${r.zonder_tarief.length} aanduiding(en) op een categorie zonder tarief
      (${veilig(codes)}). Vul hieronder een tarief in, of geef die aanduidingen vrij.</p>`);
  }
  if (r.verdwenen.length) {
    waarschuwingen.push(`<p class="melding">${r.verdwenen.length} aanduiding(en) op een wedstrijd die niet meer bij de bond staat.
      Die tellen niet mee: ${veilig(r.verdwenen.map((v) => `${v.naam} (${v.omschrijving})`).join(', '))}.</p>`);
  }

  doel.innerHTML = `<h2>${veilig(maandLabel(maand))} — voorbeeld</h2>
    ${waarschuwingen.join('')}
    <p><b>${r.aantal_officials} officials, ${veilig(r.totaal)}</b>${r.aantal_correcties ? ` — waarvan ${r.aantal_correcties} correctie(s) op eerdere maanden` : ''}</p>
    ${r.officials.map((o) => officialHtml(o, { weghalen: true })).join('')}
    <form>
      <button type="button" id="vergoedingenafsluiten" ${r.kan_afsluiten ? '' : 'disabled'}>Afsluiten en versturen</button>
      <button type="button" class="stil" id="vergoedingenannuleer">Annuleren</button>
    </form>`;

  // Het voorbeeld komt onder de lijst met maanden: op een telefoon buiten beeld.
  doel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el('vergoedingenannuleer').addEventListener('click', () => { doel.innerHTML = ''; });
  for (const k of doel.querySelectorAll('[data-weg]')) {
    k.addEventListener('click', async () => {
      if (!confirm(`${k.dataset.wat} weghalen bij ${k.dataset.naam}?\n\n` +
          'De aanduiding wordt vrijgegeven en telt niet meer mee voor de vergoeding. ' +
          'Omdat de wedstrijd voorbij is, krijgt de official geen bericht.')) return;
      k.disabled = true;
      const v = await api('/api/admin/officials/vrijgeven', 'POST', { wedstrijd_id: Number(k.dataset.weg), persoon_id: k.dataset.persoon });
      if (v.status !== 200) {
        k.disabled = false;
        alert(v.body?.fout ?? `Fout ${v.status}`);
        return;
      }
      await toonVoorbeeld(maand);
      await laadMaanden();
    });
  }
  el('vergoedingenafsluiten').addEventListener('click', async () => {
    if (!confirm(`${maandLabel(maand)} afsluiten?\n\nDe bedragen liggen daarna vast, elke official krijgt zijn overzicht ` +
        'en de ontvangers de verzamelstaat. Wat nadien nog verandert, komt als correctie in de volgende maand.')) return;
    el('vergoedingenafsluiten').disabled = true;
    const a = await api('/api/admin/officials/facturatie/afsluiten', 'POST', { maand });
    if (a.status !== 200) {
      doel.innerHTML = fout(a);
      return;
    }
    const v = a.body.verzending;
    doel.innerHTML = `<p class="melding">${veilig(maandLabel(maand))} afgesloten: ${a.body.aantal_officials} officials,
      ${veilig(a.body.totaal)}.${v ? ` Overzicht naar ${v.officials} official(s), verzamelstaat naar ${v.ontvangers} adres(sen).` : ''}</p>`;
    await laadMaanden();
  });
}

async function toonStaat(maand) {
  const doel = el('vergoedingendetail');
  const uit = await api(`/api/admin/officials/facturatie/staat?maand=${encodeURIComponent(maand)}`);
  if (uit.status !== 200) {
    doel.innerHTML = fout(uit);
    return;
  }
  const r = uit.body;
  doel.innerHTML = `<h2>${veilig(maandLabel(maand))} — afgesloten</h2>
    <p class="klein">${veilig(r.totaal)}, afgesloten op ${veilig(String(r.afgesloten_op ?? '').slice(0, 10))}
      door ${veilig(r.afgesloten_door_naam || 'onbekend')}.
      ${r.verstuurd_naar ? `Verzamelstaat naar ${veilig(r.verstuurd_naar)}.` : 'Geen verzamelstaat verstuurd.'}</p>
    ${r.officials.map((o) => officialHtml(o)).join('')}
    <form><button type="button" class="stil" id="vergoedingensluit">Sluiten</button></form>`;
  doel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el('vergoedingensluit').addEventListener('click', () => { doel.innerHTML = ''; });
}

async function toonPerOfficial() {
  const doel = el('vergoedingenperofficial');
  const uit = await api('/api/admin/officials/facturatie/officials');
  if (uit.status !== 200) {
    doel.innerHTML = fout(uit);
    return;
  }
  const r = uit.body;
  doel.innerHTML = r.officials.length
    ? `<p>${r.officials.length} officials, samen <b>${veilig(r.totaal)}</b>.</p>${r.officials
        .map(
          (o) => `<div class="maandblok"><h3>${veilig(o.naam)} <span class="bedrag">${veilig(o.bedrag)}</span></h3>
            <ul class="klein">${o.per_maand.map((m) => `<li>${veilig(maandLabel(m.maand))}: ${m.aantal} wedstrijd${m.aantal === 1 ? '' : 'en'} — ${veilig(m.bedrag)}</li>`).join('')}</ul></div>`
        )
        .join('')}`
    : '<p class="klein">Nog geen afgesloten maanden.</p>';
}

async function laadTarieven() {
  const uit = await api('/api/admin/officials/tarieven');
  const doel = el('vergoedingentarieven');
  if (uit.status !== 200) {
    doel.innerHTML = fout(uit);
    return;
  }
  doel.innerHTML = `<table><thead><tr><th>Categorie</th><th>Tarief</th><th></th></tr></thead><tbody>${uit.body.tarieven
    .map(
      (t) => `<tr><td>${veilig(t.label ?? t.code)} <span class="klein">${veilig(t.code)}</span></td>
        <td><input type="text" inputmode="decimal" size="7" data-tarief="${veilig(t.code)}"
             value="${t.tarief_cent === null ? '' : veilig(t.tarief.replace('€ ', ''))}" placeholder="geen"></td>
        <td><button type="button" class="mini" data-bewaar="${veilig(t.code)}">bewaar</button></td></tr>`
    )
    .join('')}</tbody></table>`;
  for (const k of doel.querySelectorAll('[data-bewaar]')) {
    k.addEventListener('click', async () => {
      const veld = doel.querySelector(`[data-tarief="${CSS.escape(k.dataset.bewaar)}"]`);
      const cent = naarCent(veld.value);
      if (cent === null) {
        alert('Geef een bedrag in euro, bijvoorbeeld 15 of 17,50.');
        return;
      }
      if (!confirm(`Tarief ${k.dataset.bewaar} op ${veld.value} zetten?\n\n` +
          'Het geldt voor wat nog niet afgesloten is. Afgesloten maanden blijven zoals ze waren.')) return;
      const v = await api('/api/admin/officials/tarieven', 'POST', { code: k.dataset.bewaar, tarief_cent: cent });
      if (v.status !== 200) alert(v.body?.fout ?? `Fout ${v.status}`);
      await laadTarieven();
    });
  }
}

/** Eén keer, bij het starten van de app: de knoppen die niet bij een lijst horen. */
export function koppelVergoedingen() {
  el('vergoedingenperofficialknop').addEventListener('click', toonPerOfficial);
  el('vergoedingenontvangersbewaar').addEventListener('click', async () => {
    const uit = await api('/api/admin/officials/facturatie/ontvangers', 'POST', { ontvangers: el('vergoedingenontvangers').value });
    el('vergoedingenontvangersmelding').innerHTML = uit.status === 200
      ? `<p class="klein">Bewaard: ${veilig(uit.body.ontvangers.join(', ') || 'niemand')}.</p>`
      : fout(uit);
  });
}
