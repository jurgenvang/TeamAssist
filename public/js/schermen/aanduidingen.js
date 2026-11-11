// Aanduidingen: het scherm van een official (0.38.0, uit YOAssist).
//
// Drie secties, in de volgorde van wat er van je verwacht wordt: wat vastligt
// (aangeduid), wat nog een antwoord vraagt, en onderaan wat je al beantwoordde.
// Een ouder vult in namens zijn kind: de keuze bovenaan, en elke oproep geeft
// `namens` mee. Dat het mag, beslist de backend (namens.js); hier enkel kiezen.

import { api } from '../api.js';
import { el, veilig } from '../hulp.js';
import { sectieVoor, forfaitTekst, grensMaand, internationaal } from '../officials-hulp.js';
import { kaart as gedeeldeKaart, sectieKop, gegroepeerd } from '../kaart.js';

const staat = {
  ik: null, // { id, naam, official }
  kinderen: [], // [{ id, naam }]
  namens: null, // null = mezelf
  wedstrijden: [],
  // Waar een wedstrijd staat, ligt vast per bezoek. Anders springt de kaart
  // die je net aantikte naar een andere sectie, en ben je kwijt waar je was.
  sectieVast: null,
  allesOpen: false,
};

/** Wie dit scherm kan gebruiken: de persoon zelf als official, en zijn kinderen die official zijn. */
export function zetOfficialsPersonen(persoon, isOfficial, kinderen) {
  staat.ik = { id: persoon.id, naam: `${persoon.voornaam} ${persoon.achternaam}`.trim(), official: isOfficial };
  staat.kinderen = kinderen ?? [];
  // Wie zelf geen official is, begint bij zijn eerste kind.
  staat.namens = isOfficial ? null : staat.kinderen[0]?.id ?? null;
}

/**
 * Voor wie Aanduidingen opent: vanuit Mijn agenda ('nog te beantwoorden voor
 * Max') meteen bij dat kind. null = mezelf. Enkel een keuze die er al is:
 * dat het mag, beslist de backend toch.
 */
export function kiesOfficial(id) {
  const kan = id ? staat.kinderen.some((k) => k.id === id) : staat.ik?.official;
  if (!kan) return;
  staat.namens = id;
  staat.sectieVast = null;
}

/** Voor wie er nu gehandeld wordt, voor de andere schermen (vergoeding, voorkeuren). */
export function huidigNamens() {
  return staat.namens;
}

export function namensKeuzeHtml(id) {
  const keuzes = [
    ...(staat.ik?.official ? [{ id: '', naam: `${staat.ik.naam} (ikzelf)` }] : []),
    ...staat.kinderen.map((k) => ({ id: k.id, naam: k.naam })),
  ];
  if (keuzes.length < 2) return '';
  return `<label class="veld"><span>Invullen voor</span><select id="${id}">${keuzes
    .map((k) => `<option value="${veilig(k.id)}" ${(staat.namens ?? '') === k.id ? 'selected' : ''}>${veilig(k.naam)}</option>`)
    .join('')}</select></label>`;
}

const metNamens = (pad) => (staat.namens ? `${pad}${pad.includes('?') ? '&' : '?'}namens=${encodeURIComponent(staat.namens)}` : pad);

export async function laadAanduidingen() {
  el('aanduidingennamens').innerHTML = namensKeuzeHtml('aanduidingenvoor');
  const keuze = el('aanduidingenvoor');
  if (keuze) {
    keuze.addEventListener('change', () => {
      staat.namens = keuze.value || null;
      staat.sectieVast = null;
      laadAanduidingen();
    });
  }

  const uit = await api(metNamens('/api/officials/wedstrijden'));
  const doel = el('aanduidingenlijst');
  if (uit.status !== 200) {
    doel.innerHTML = `<p class="melding fout">${veilig(uit.body?.fout ?? `Fout ${uit.status}`)}</p>`;
    return;
  }
  staat.wedstrijden = uit.body.wedstrijden ?? [];
  if (!staat.sectieVast) staat.sectieVast = new Map(staat.wedstrijden.map((w) => [w.id, sectieVoor(w)]));
  teken();
}

function teken() {
  const doel = el('aanduidingenlijst');
  if (!staat.wedstrijden.length) {
    doel.innerHTML = '<p class="melding">Er staan momenteel geen wedstrijden klaar. Zodra er iets is, verschijnt het hier.</p>';
    return;
  }
  // Een wedstrijd die er bij het openen nog niet was, krijgt alsnog een plaats.
  const sectieVan = (w) => staat.sectieVast.get(w.id) ?? sectieVoor(w);
  const aangeduid = staat.wedstrijden.filter((w) => sectieVan(w) === 'aangeduid');
  const open = staat.wedstrijden.filter((w) => sectieVan(w) === 'open');
  const beantwoord = staat.wedstrijden.filter((w) => sectieVan(w) === 'beantwoord');

  // De teller telt wél meteen mee: voortgang, zonder dat er iets beweegt.
  const nogOpen = staat.wedstrijden.filter((w) => sectieVoor(w) === 'open').length;
  const nuAangeduid = staat.wedstrijden.filter((w) => w.toegewezen).length;
  const extra = nuAangeduid ? ` · ${nuAangeduid} keer aangeduid` : '';
  const delen = [
    nogOpen
      ? `<p class="teller open"><b>${nogOpen}</b> nog te beantwoorden${extra}.</p>`
      : `<p class="teller klaar"><b>✓</b> Alles beantwoord${extra}.</p>`,
  ];

  const grens = grensMaand();
  const dichtbij = open.filter((w) => w.datum.slice(0, 7) < grens);
  const verder = open.length - dichtbij.length;
  delen.push(sectie('Je bent aangeduid', 'Deze wedstrijden fluit je. Lukt het niet, meld dat dan.', aangeduid));
  delen.push(
    sectie('Nog te beantwoorden', '', staat.allesOpen ? open : dichtbij,
      verder
        ? `<button type="button" class="stil" data-meer>${staat.allesOpen ? 'Toon enkel deze en volgende maand' : `Toon ook wat later komt (${verder})`}</button>`
        : '')
  );
  delen.push(sectie('Je hebt geantwoord', 'Je kan dit nog wijzigen zolang je niet aangeduid bent.', beantwoord));
  doel.innerHTML = delen.join('');
}

function sectie(titel, uitleg, items, staart = '') {
  if (!items.length && !staart) return '';
  return `${sectieKop(titel, items.length, uitleg)}${gegroepeerd(items, kaart, { per: 'maand' })}${staart}`;
}

function refsRegel(w) {
  const delen = [];
  // De scheidsrechters van de bond. Bij U10/U12 duidt de bond niemand aan.
  if (w.cat_groep !== 'U10U12' || w.vbl_aantal > 0) {
    const vbl = w.vbl_namen_gewist && w.vbl_aantal > 0 ? [`${w.vbl_aantal} van de bond`] : w.vbl_refs ?? [];
    if (vbl.length) delen.push(`<span class="vbl-regel">Basketbal Vlaanderen: ${vbl.map(veilig).join(', ')}</span>`);
  }
  // De eigen plaatsen als REF1 en REF2, zoals iedereen erover spreekt.
  const club = w.club_refs ?? [];
  for (let i = 0; i < w.nodig; i += 1) {
    const o = club[i];
    if (!o) {
      delen.push(`<span class="ref-plaats leeg"><span class="ref-nr">REF${i + 1}</span>nog gezocht</span>`);
      continue;
    }
    // Een nummer staat er enkel bij een collega met wie je samen fluit, en
    // enkel als die het deelt — dat beslist de backend.
    const contact = o.gsm
      ? `<span class="contact"><a href="tel:${veilig(o.gsm)}" title="${veilig(o.gsm)} — bellen">bel</a>
          <a href="https://wa.me/${internationaal(o.gsm)}" target="_blank" rel="noopener noreferrer" title="${veilig(o.gsm)} — WhatsApp">wa</a></span>`
      : o.gsm_ontbreekt
        ? '<span class="contact klein">nog geen gsm-nummer</span>'
        : '';
    delen.push(`<span class="ref-plaats gevuld${o.ik_zelf ? ' ik' : ''}"><span class="ref-nr">REF${i + 1}</span>${veilig(o.naam)}${contact}</span>`);
  }
  return delen.length ? `<div class="wed-refs">${delen.join('')}</div>` : '';
}

function kaart(w) {
  const status = w.beschikbaarheid ?? '';
  let acties;
  if (w.forfait && !w.toegewezen) {
    acties = `<p class="gaat-niet-door">Gaat niet door: ${veilig(forfaitTekst(w.forfait))}.</p>`;
  } else if (w.toegewezen) {
    // Zoals in YOAssist: het ligt vast, dus geen keuzeknoppen meer — enkel wat
    // je vlak voor de wedstrijd nodig hebt.
    acties = `<div class="vast"><span><span class="aangeduid-merk">Aangeduid</span></span>
      <span>Aanwezig op het terrein om ${veilig(w.opkomst ?? w.uur)}.</span>
      <span class="vast-knoppen"><button type="button" data-probleem="${w.id}">Probleem melden</button></span></div>`;
  } else {
    acties = `<div class="wed-acties">
      <button type="button" class="keuze" data-keuze="ja" data-wedstrijd="${w.id}" aria-pressed="${status === 'ja'}">Beschikbaar</button>
      <button type="button" class="keuze" data-keuze="nee" data-wedstrijd="${w.id}" aria-pressed="${status === 'nee'}">Niet beschikbaar</button></div>`;
  }
  return gedeeldeKaart({
    datum: w.datum,
    uur: w.uur,
    ploeg: w.ploeg,
    tegenstander: w.tegenstander ?? '?',
    cat: w.cat_label,
    locatie: w.locatie,
    blad: w.wedstrijdblad,
    uitslag: w.uitslag,
    forfait: w.forfait,
    data: { status, toegewezen: w.toegewezen ? '1' : '0' },
    inhoud: refsRegel(w),
    acties,
  });
}

async function kies(knop) {
  const w = staat.wedstrijden.find((x) => x.id === Number(knop.dataset.wedstrijd));
  if (!w) return;
  // Een tweede tik op dezelfde knop wist het antwoord: een vergissing kan
  // terug naar 'nog niet geantwoord'.
  const nieuw = w.beschikbaarheid === knop.dataset.keuze ? null : knop.dataset.keuze;
  for (const k of knop.parentElement.querySelectorAll('.keuze')) k.disabled = true;
  const uit = await api('/api/officials/beschikbaarheid', 'POST', { wedstrijd_id: w.id, status: nieuw, namens: staat.namens });
  if (uit.status !== 200) {
    alert(uit.body?.fout ?? `Dat lukte niet (${uit.status}).`);
    for (const k of knop.parentElement.querySelectorAll('.keuze')) k.disabled = false;
    return;
  }
  w.beschikbaarheid = nieuw;
  teken();
}

async function meldProbleem(id) {
  const bericht = prompt('Wat is er aan de hand? De beheerders krijgen dit te zien.');
  if (!bericht || !bericht.trim()) return;
  const uit = await api('/api/officials/probleem', 'POST', { wedstrijd_id: id, bericht: bericht.trim(), namens: staat.namens });
  alert(uit.status === 200 ? 'Gemeld bij de beheerders.' : uit.body?.fout ?? `Dat lukte niet (${uit.status}).`);
}

export function koppelAanduidingen() {
  el('aanduidingenlijst').addEventListener('click', (e) => {
    const knop = e.target.closest('button');
    if (!knop) return;
    if (knop.dataset.keuze) kies(knop);
    else if (knop.dataset.probleem) meldProbleem(Number(knop.dataset.probleem));
    else if (knop.hasAttribute('data-meer')) {
      staat.allesOpen = !staat.allesOpen;
      teken();
    }
  });
}
