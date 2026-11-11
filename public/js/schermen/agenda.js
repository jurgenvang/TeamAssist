// Mijn agenda (T21): de trainingen en wedstrijden van je ploeg, de
// wedstrijden die je fluit en je taken bij een wedstrijd, in één lijst per
// dag — voor een ouder die van het hele gezin, met 'voor …' bij elk item.
//
// Elke activiteit is de gedeelde kaart (kaart.js), met een label voor het
// type. De rand zegt hoe het ervoor staat, zoals in YOAssist: geel = nog niet
// ingevuld, groen = je komt (of het ligt vast), rood = je komt niet.
//
// Wat hier kan, per type (beslist met Jurgen, 10 november 2026):
//  - training en wedstrijd: aanwezig of afwezig opgeven, met een reden bij
//    afwezig; een uitsluiting door de coach blijft zichtbaar;
//  - fluiten en taak: enkel tonen en een probleem melden. Beschikbaarheid
//    opgeven blijft in Aanduidingen; bovenaan staat hoeveel er nog wacht.
// Een botsing tussen spelen en fluiten berekent de backend (routes/agenda.js);
// hier staat ze enkel bij beide kaarten.

import { api } from '../api.js';
import { el, veilig } from '../hulp.js';
import { grensMaand } from '../officials-hulp.js';
import { kaart, gegroepeerd } from '../kaart.js';
import { kiesOfficial } from './aanduidingen.js';

const staat = { gegevens: null, alles: false, afwezig: null };

const REDENEN = { ziek: 'ziek', gekwetst: 'gekwetst', ander: 'andere reden' };
const STATUS = { afgelast: 'afgelast', verplaatst: 'verplaatst', zaal_niet_beschikbaar: 'zaal niet beschikbaar' };

/** De toestand voor de rand van de kaart, uit wat er van dit item gekend is. */
export function toestandVan(it) {
  if (it.soort === 'fluiten' || it.soort === 'taak') return 'ja';
  if (it.status && it.status !== 'gepland') return 'weg';
  if (it.uitgesloten || it.opgave_status === 'afwezig') return 'nee';
  if (it.opgave_status === 'aanwezig') return 'ja';
  return 'open';
}

export async function laadAgenda() {
  const blok = el('agendablok');
  const uit = await api('/api/mij/agenda');
  if (uit.status !== 200 || !uit.body.tonen) {
    blok.hidden = true;
    return;
  }
  blok.hidden = false;
  staat.gegevens = uit.body;
  teken();
}

function teken() {
  const { agenda, te_beantwoorden: teBeantwoorden, gezin } = staat.gegevens;
  const grens = grensMaand();
  const dichtbij = agenda.filter((it) => it.datum.slice(0, 7) < grens);
  const later = agenda.length - dichtbij.length;
  const zichtbaar = staat.alles ? agenda : dichtbij;

  const delen = teBeantwoorden.map((o) => `<p class="teller open"><b>${o.aantal}</b>
    <span>${o.aantal === 1 ? 'wedstrijd' : 'wedstrijden'} te beantwoorden${o.ik ? '' : ` voor ${veilig(o.naam)}`} —
    <button type="button" class="alslink" data-naar-aanduidingen="${o.ik ? '' : veilig(o.id)}">naar Aanduidingen</button></span></p>`);

  if (!zichtbaar.length) {
    delen.push(`<p class="melding">${later ? 'Deze en volgende maand staat er niets gepland.' : 'Er staat voorlopig niets gepland.'}</p>`);
  } else {
    delen.push(gegroepeerd(zichtbaar, (it) => item(it, gezin)));
  }
  if (later) {
    delen.push(`<button type="button" class="stil" data-meer>${staat.alles ? 'Toon enkel deze en volgende maand' : `Toon ook wat later komt (${later})`}</button>`);
  }
  el('agendalijst').innerHTML = delen.join('');
}

function item(it, gezin) {
  const inhoud = [];
  if (it.soort === 'taak') inhoud.push(`<div class="wed-refs"><span class="ref-plaats gevuld${it.voor.ik ? ' ik' : ''}"><span class="ref-nr">TAAK</span>${veilig(it.taak_naam)}</span></div>`);
  if (it.status && it.status !== 'gepland') inhoud.push(`<p class="gaat-niet-door">${veilig(STATUS[it.status] ?? it.status)}</p>`);
  if (it.botsingen?.length) inhoud.push(`<p class="botsing">Valt kort op: ${it.botsingen.map(veilig).join('; ')}. Laat de club weten als het niet lukt.</p>`);
  return kaart({
    soort: it.soort,
    label: true,
    datum: it.datum,
    uur: it.uur,
    ploeg: it.soort === 'training' ? `Training ${it.ploeg}` : it.ploeg,
    tegenstander: it.tegenstander,
    thuis: it.soort === 'wedstrijd' || it.soort === 'taak' ? it.thuis : null,
    cat: it.cat_label,
    locatie: it.locatie,
    blad: it.wedstrijdblad,
    uitslag: it.uitslag,
    forfait: it.forfait,
    voor: gezin ? it.voor.naam : null,
    toestand: toestandVan(it),
    data: { sleutel: it.sleutel },
    inhoud: inhoud.join(''),
    acties: acties(it),
  });
}

function acties(it) {
  if (it.soort === 'fluiten') {
    return `<div class="vast"><span><span class="aangeduid-merk">Aangeduid</span></span>
      <span>Aanwezig op het terrein om ${veilig(it.opkomst ?? it.uur)}.</span>
      <span class="vast-knoppen"><button type="button" data-probleem="${veilig(it.sleutel)}">Probleem melden</button></span></div>`;
  }
  if (it.soort === 'taak') {
    // Een taak melden kan enkel wie ze zelf heeft (wedstrijdtaken.js): een
    // ouder doet het niet namens zijn kind.
    if (it.probleem_gemeld) return '<p class="gaat-niet-door">Probleem gemeld bij de begeleiding.</p>';
    return it.voor.ik
      ? `<div class="vast"><span class="vast-knoppen"><button type="button" data-probleem="${veilig(it.sleutel)}">Probleem melden</button></span></div>`
      : '';
  }
  if (it.status && it.status !== 'gepland') return '';
  if (it.uitgesloten) {
    return `<div class="vast"><span><span class="aangeduid-merk merk-afwezig">Niet opgeroepen</span></span>
      ${it.uitgesloten_reden ? `<span>${veilig(it.uitgesloten_reden)}</span>` : ''}</div>`;
  }
  const s = it.opgave_status;
  const reden = s === 'afwezig' && it.opgave_reden ? `<p class="klein">Afwezig: ${veilig(REDENEN[it.opgave_reden] ?? it.opgave_reden)}</p>` : '';
  const vorm = staat.afwezig === it.sleutel
    ? `<div class="afwezig-vorm">
        <select data-reden>${Object.entries(REDENEN).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <input type="text" data-toelichting placeholder="toelichting (bij een andere reden)">
        <button type="button" data-bevestig="${veilig(it.sleutel)}">Bevestigen</button>
      </div>`
    : '';
  return `<div class="wed-acties">
      <button type="button" class="keuze" data-keuze="ja" data-opgave="${veilig(it.sleutel)}" aria-pressed="${s === 'aanwezig'}">Aanwezig</button>
      <button type="button" class="keuze" data-keuze="nee" data-opgave="${veilig(it.sleutel)}" aria-pressed="${s === 'afwezig'}">Afwezig</button>
    </div>${reden}${vorm}`;
}

const zoek = (sleutel) => staat.gegevens.agenda.find((x) => x.sleutel === sleutel);

async function geefOp(it, status, reden = null, toelichting = null) {
  const uit = await api('/api/aanwezigheid/opgave', 'POST', {
    soort: it.soort, activiteit_id: it.id, persoon_id: it.voor.id, status, reden, toelichting,
  });
  if (uit.status !== 200) {
    alert(uit.body?.fout ?? `Dat lukte niet (${uit.status}).`);
    return;
  }
  it.opgave_status = status;
  it.opgave_reden = reden;
  staat.afwezig = null;
  teken();
}

async function meldProbleem(it) {
  const tekst = prompt('Wat is er aan de hand? De begeleiding krijgt dit te zien.');
  if (!tekst || !tekst.trim()) return;
  const uit = it.soort === 'fluiten'
    ? await api('/api/officials/probleem', 'POST', { wedstrijd_id: it.id, bericht: tekst.trim(), namens: it.voor.ik ? null : it.voor.id })
    : await api('/api/admin/wedstrijdtaken/probleem', 'POST', { wedstrijdtaak_id: it.id, reden: tekst.trim() });
  if (uit.status !== 200) {
    alert(uit.body?.fout ?? `Dat lukte niet (${uit.status}).`);
    return;
  }
  if (it.soort === 'taak') it.probleem_gemeld = true;
  alert('Gemeld.');
  teken();
}

export function koppelAgenda() {
  el('agendalijst').addEventListener('click', (e) => {
    const knop = e.target.closest('button');
    if (!knop) return;
    if (knop.hasAttribute('data-meer')) {
      staat.alles = !staat.alles;
      teken();
    } else if (knop.dataset.opgave) {
      const it = zoek(knop.dataset.opgave);
      if (!it) return;
      if (knop.dataset.keuze === 'ja') geefOp(it, 'aanwezig');
      else {
        staat.afwezig = staat.afwezig === it.sleutel ? null : it.sleutel;
        teken();
      }
    } else if (knop.dataset.bevestig) {
      const it = zoek(knop.dataset.bevestig);
      const vorm = knop.closest('.afwezig-vorm');
      if (it && vorm) geefOp(it, 'afwezig', vorm.querySelector('[data-reden]').value, vorm.querySelector('[data-toelichting]').value.trim() || null);
    } else if (knop.dataset.probleem) {
      const it = zoek(knop.dataset.probleem);
      if (it) meldProbleem(it);
    } else if ('naarAanduidingen' in knop.dataset) {
      kiesOfficial(knop.dataset.naarAanduidingen || null);
      document.querySelector('#navigatie button[data-tab="aanduidingen"]')?.click();
    }
  });
}
