// Cluboverzicht: aanduiden (0.39.0, uit YOAssist).
//
// Wat aandacht vraagt bovenaan, dan U10/U12 en de rest, en onderaan — enkel op
// vraag — wat voorbij is, om achteraf recht te zetten. De cijfers gaan over de
// twee eerstvolgende weekends. Filteren gebeurt hier: de backend stuurt alles
// mee, een filter kost geen nieuwe oproep.
//
// Elke actie zegt de backend ja of nee (officials/routes.js); vraagt hij om te
// bevestigen (iemand die 'nee' zei, een botsing), dan beslist de beheerder.

import { api } from '../api.js';
import { el, veilig } from '../hulp.js';
import { dagVan, forfaitTekst } from '../officials-hulp.js';

const staat = { o: null, filter: null, alles: false, voorbij: false };

export async function laadCluboverzicht() {
  const uit = await api(`/api/admin/officials/overzicht${staat.voorbij ? '?voorbij=1' : ''}`);
  if (uit.status !== 200) {
    el('cluboverzichtlijst').innerHTML = `<p class="melding fout">${veilig(uit.body?.fout ?? `Fout ${uit.status}`)}</p>`;
    return;
  }
  staat.o = uit.body;
  teken();
  laadProblemen();
}

async function laadProblemen() {
  const uit = await api('/api/admin/officials/problemen');
  const lijst = uit.status === 200 ? uit.body.problemen : [];
  el('cluboverzichtproblemen').innerHTML = lijst.length
    ? `<h3>Gemelde problemen <span class="aantal">${lijst.length}</span></h3>${lijst
        .map(
          (p) => `<div class="probleem-melding"><b>${veilig(p.naam)}</b> — ${veilig(p.wedstrijd)}<br>
            <span class="klein">"${veilig(p.bericht)}"</span>
            <button type="button" class="mini" data-afgehandeld="${p.id}">afgehandeld</button></div>`
        )
        .join('')}`
    : '';
}

const past = (w) => {
  if (staat.filter === 'scope') return w.in_scope;
  if (staat.filter === 'onvolledig') return w.in_scope && w.toegewezen.length < w.nodig;
  if (staat.filter === 'geenvrij') return w.in_scope && !w.forfait && w.beschikbaar.length === 0;
  return true;
};

function teken() {
  const o = staat.o;
  const tegel = (sleutel, waarde, label, waarschuw = false) =>
    `<button type="button" class="tegel${waarschuw && waarde ? ' let' : ''}" data-filter="${sleutel}"
       aria-pressed="${staat.filter === sleutel}"><b>${waarde}</b><span>${label}</span></button>`;
  const delen = [
    `<div class="tegels">${tegel('alles', o.in_venster, 'wedstrijden')}${tegel('scope', o.in_scope, 'in de lijst')}${tegel(
      'onvolledig', o.onvolledig, 'niet volledig aangeduid', true)}${tegel('geenvrij', o.zonder_beschikbaren, 'zonder beschikbare', true)}</div>
     <p class="klein">Cijfers gelden voor ${veilig(o.venster.label)} — de twee eerstvolgende weekends.</p>`,
  ];

  const zichtbaar = o.wedstrijden.filter(past).filter((w) => w.voorbij || staat.alles || w.in_venster);
  const verderop = o.wedstrijden.filter(past).filter((w) => !w.voorbij && !w.in_venster).length;
  if (!zichtbaar.length) {
    delen.push('<p class="melding">Geen wedstrijden die aan dit filter voldoen.</p>');
  } else {
    const komend = zichtbaar.filter((w) => !w.voorbij);
    const aandacht = komend.filter((w) => w.probleem && w.in_venster);
    const rest = komend.filter((w) => !(w.probleem && w.in_venster));
    const groepen = [
      ['Aandacht nodig', aandacht],
      ['U10 / U12', rest.filter((w) => w.cat_groep === 'U10U12')],
      ['Overige', rest.filter((w) => w.cat_groep !== 'U10U12')],
      ['Voorbij', zichtbaar.filter((w) => w.voorbij)],
    ];
    for (const [titel, items] of groepen) {
      if (!items.length) continue;
      delen.push(`<h3>${veilig(titel)} <span class="aantal">${items.length}</span></h3>`);
      let vorige = null;
      for (const w of items) {
        if (w.datum !== vorige) {
          const d = dagVan(w.datum);
          delen.push(`<div class="dag-kop">${d.dag} ${d.nr}/${w.datum.slice(5, 7)}</div>`);
        }
        vorige = w.datum;
        delen.push(kaart(w));
      }
    }
  }
  if (verderop) {
    delen.push(`<button type="button" class="stil" data-meer>${staat.alles ? 'Toon enkel de twee eerstvolgende weekends' : `Toon ook wat later komt (${verderop})`}</button>`);
  }
  delen.push(`<button type="button" class="stil" data-voorbij>${staat.voorbij ? 'Verberg voorbije wedstrijden' : 'Toon voorbije wedstrijden (om achteraf recht te zetten)'}</button>`);
  if (staat.voorbij) {
    delen.push(`<p class="klein">Voorbije wedstrijden vanaf ${veilig(o.van)}. Wie je nu nog aanduidt of vrijgeeft, krijgt daar geen bericht van.</p>`);
  }
  el('cluboverzichtlijst').innerHTML = delen.join('');
}

function kaart(w) {
  const chip = (tekst, soort = '', data = '') => `<span class="chip ${soort}" ${data}>${veilig(tekst)}</span>`;
  // Bij U10/U12 duidt de bond niemand aan: die regel zou enkel 'nog niemand'
  // tonen. Staat er toch iemand op, dan is dat wel informatie.
  let vbl = '';
  if (w.cat_groep !== 'U10U12' || w.vbl_aantal > 0) {
    const refs = w.vbl_namen_gewist && w.vbl_aantal
      ? chip(`${w.vbl_aantal} aangeduid`, 'vbl')
      : w.vbl_refs.length ? w.vbl_refs.map((n) => chip(n, 'vbl')).join('') : chip('nog niemand', 'geen');
    // De woensdaglijst weet soms meer dan de API: zeggen, anders lijkt 'nog
    // niemand' naast een volle plaats tegenstrijdig.
    const lijst = w.bond_officials !== null && w.bond_officials > w.vbl_aantal
      ? chip(`volgens de lijst van de bond: ${w.bond_officials === 1 ? 'één' : 'twee'} voorzien`, 'vbl') : '';
    const bevestig = w.in_scope && w.vbl_aantal < 2 && !w.voorbij
      ? `<button type="button" class="mini" data-refs="${w.refs_bevestigd ? '0' : '1'}">${w.refs_bevestigd ? 'twee refs bevestigd ✓' : 'er komen twee refs'}</button>` : '';
    vbl = `<div class="ov-regel"><span class="ov-label">Bond</span>${refs}${lijst}${bevestig}</div>`;
  }

  const plaatsen = [];
  for (let i = 0; i < w.nodig; i += 1) {
    const o = w.toegewezen[i];
    plaatsen.push(o
      ? `<span class="ref-plaats gevuld"><span class="ref-nr">REF${i + 1}</span>${veilig(o.naam)}
           <button type="button" class="mini" data-vrij="${veilig(o.id)}" title="Vrijgeven">×</button></span>`
      : `<span class="ref-plaats leeg"><span class="ref-nr">REF${i + 1}</span>nog te vullen</span>`);
  }
  // Bij een forfait is er niemand nodig. Wie er nog op staat, blijft zichtbaar
  // met een knop om vrij te geven — anders verdwijnt die aanduiding uit beeld.
  const club = w.forfait
    ? w.toegewezen.map((o) => `<span class="ref-plaats gevuld">${veilig(o.naam)}
        <button type="button" class="mini" data-vrij="${veilig(o.id)}" title="Vrijgeven">×</button></span>`).join('') || chip('gaat niet door', 'geen')
    : plaatsen.join('') || chip('de bond voorziet er twee', 'geen');

  const alToe = new Set(w.toegewezen.map((p) => p.id));
  const ja = w.beschikbaar.filter((p) => !alToe.has(p.id));
  const nee = w.niet_beschikbaar.filter((p) => !alToe.has(p.id));
  const kanNog = w.toegewezen.length < w.nodig;
  const persoon = (p, soort, titel) => (kanNog
    ? `<button type="button" class="chip ${soort} klik" data-wijs="${veilig(p.id)}" title="${titel}">${veilig(p.naam)}</button>`
    : chip(p.naam, soort));

  const lijstRegels = w.in_scope
    ? `<div class="ov-regel"><span class="ov-label">Club</span>${club}</div>
       ${w.forfait ? '' : `<div class="ov-regel"><span class="ov-label">Kan</span>${
         w.beschikbaar.length ? ja.map((p) => persoon(p, 'ja', 'Aanduiden')).join('') || chip('iedereen aangeduid', 'geen') : chip('niemand', 'geen')}</div>
       ${nee.length ? `<div class="ov-regel"><span class="ov-label">Niet</span>${nee.map((p) => persoon(p, 'nee', 'Toch aanduiden')).join('')}</div>` : ''}`}`
    : '';

  const klassen = ['ov'];
  if (w.voorbij) klassen.push('voorbij');
  if (!w.in_scope || w.forfait) klassen.push('buiten');
  else if (w.probleem && w.in_venster) klassen.push('probleem');
  else if (w.toegewezen.length >= w.nodig) klassen.push('compleet');

  // U10/U12 komt vanzelf in de lijst: een knop om ze eruit te halen zou enkel
  // verwarren.
  const scope = w.scope_reden === 'auto'
    ? '<span class="klein">staat er automatisch in</span>'
    : `<button type="button" class="mini" data-scope="${w.in_scope ? '0' : '1'}">${w.in_scope ? 'Uit de aanduidingslijst' : 'In de aanduidingslijst zetten'}</button>`;

  return `<article class="${klassen.join(' ')}" data-wedstrijd="${w.id}">
    <div class="ov-kop"><b>${veilig(w.uur)}</b> <span class="cat">${veilig(w.cat_label ?? w.cat_code ?? '??')}</span>
      <b>${veilig(w.ploeg)}</b> – ${veilig(w.tegenstander ?? '?')}
      ${w.forfait ? `<span class="forfait-label">${veilig(forfaitTekst(w.forfait))}</span>` : ''}
      ${w.uitslag ? `<span class="uitslag">${veilig(w.uitslag)}</span>` : ''}</div>
    <div class="ov-regel klein">${veilig(w.locatie ?? 'locatie onbekend')} · <a href="${veilig(w.wedstrijdblad)}" target="_blank" rel="noopener noreferrer">wedstrijdblad ↗</a></div>
    ${vbl}
    ${lijstRegels}
    <div class="ov-actie">${scope}${w.in_scope && !w.forfait && kanNog ? '<button type="button" class="mini" data-ander>Iemand anders aanduiden</button>' : ''}</div>
  </article>`;
}

const fout = (uit) => uit.body?.fout ?? `Dat lukte niet (${uit.status}).`;

async function wijsAan(id, persoonId, forceer = false) {
  const uit = await api('/api/admin/officials/aanduiden', 'POST', { wedstrijd_id: id, persoon_id: persoonId, forceer });
  // 'bevestig' in de reden: iets wat de beheerder mag overrulen (een 'nee', een botsing).
  if (uit.status === 409 && /bevestig/i.test(uit.body?.fout ?? '') && !forceer) {
    if (confirm(`${uit.body.fout}.\n\nToch aanduiden?`)) return wijsAan(id, persoonId, true);
    return;
  }
  if (uit.status !== 200) alert(fout(uit));
  await laadCluboverzicht();
}

async function geefVrij(id, persoonId) {
  if (!confirm('Deze aanduiding vrijgeven? Bij een wedstrijd die nog moet komen, krijgt de official bericht.')) return;
  const uit = await api('/api/admin/officials/vrijgeven', 'POST', { wedstrijd_id: id, persoon_id: persoonId });
  if (uit.status !== 200) alert(fout(uit));
  await laadCluboverzicht();
}

async function iemandAnders(id) {
  const uit = await api(`/api/admin/officials/kandidaten?wedstrijd_id=${id}`);
  if (uit.status !== 200) return alert(fout(uit));
  const lijst = uit.body.kandidaten.filter((k) => !k.toegewezen);
  if (!lijst.length) return alert('Er is niemand die hier nog in aanmerking komt.');
  const keuze = prompt(
    `Wie wil je aanduiden?\n\n${lijst
      .map((k, i) => `${i + 1}. ${k.naam}${k.beschikbaarheid ? ` (${k.beschikbaarheid})` : ''}${k.botsingen.length ? ` — staat al op ${k.botsingen.join(', ')}` : ''}`)
      .join('\n')}`
  );
  const nr = Number(keuze);
  if (!Number.isInteger(nr) || nr < 1 || nr > lijst.length) return;
  await wijsAan(id, lijst[nr - 1].id);
}

async function post(pad, body) {
  const uit = await api(pad, 'POST', body);
  if (uit.status !== 200) alert(fout(uit));
  await laadCluboverzicht();
}

/** Automatisch aanvullen: eerst het voorstel, pas na bevestiging uitvoeren. */
async function automatisch() {
  const doel = el('cluboverzichtvoorstel');
  doel.innerHTML = '<p class="klein">Voorstel berekenen…</p>';
  const uit = await api('/api/admin/officials/automatisch', 'POST', { dagen: 21 });
  if (uit.status !== 200) {
    doel.innerHTML = `<p class="melding fout">${veilig(fout(uit))}</p>`;
    return;
  }
  const r = uit.body;
  if (!r.aantal_toegewezen) {
    doel.innerHTML = `<p class="melding">Geen enkele aanduiding mogelijk. ${veilig(r.boodschap ?? 'Er is niemand beschikbaar die nog past.')}</p>`;
    return;
  }
  const per = new Map();
  for (const t of r.toewijzingen) per.set(t.wedstrijd, [...(per.get(t.wedstrijd) ?? []), t.naam]);
  doel.innerHTML = `<div class="voorstel">
    <h3>${r.aantal_toegewezen} aanduiding(en) over ${per.size} wedstrijd(en)</h3>
    <ul>${[...per].map(([w, namen]) => `<li>${veilig(w)}: <b>${namen.map(veilig).join(', ')}</b></li>`).join('')}</ul>
    ${r.onvolledig.length ? `<h4>Blijft onvolledig</h4><ul>${r.onvolledig.map((o) => `<li>${veilig(o.wedstrijd)}: nog ${o.tekort} nodig — ${veilig(o.reden)}</li>`).join('')}</ul>` : ''}
    <p class="klein">Wie aangeduid wordt, krijgt meteen bericht.</p>
    <form><button type="button" data-voorstel="ja">Bevestigen</button>
      <button type="button" class="stil" data-voorstel="nee">Annuleren</button></form></div>`;
}

async function vulNogIn() {
  // Het eerstvolgende weekend: de zaterdag vanaf vandaag.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  const zaterdag = d.toISOString().slice(0, 10);
  if (!confirm(`Een herinnering sturen aan wie voor het weekend van ${zaterdag} nog niets invulde?`)) return;
  const uit = await api('/api/admin/officials/vul-nog-in', 'POST', { zaterdag });
  alert(uit.status === 200
    ? uit.body.aantal ? `${uit.body.verstuurd} van ${uit.body.aantal} herinnering(en) verstuurd.` : uit.body.boodschap
    : fout(uit));
}

export function koppelCluboverzicht() {
  el('cluboverzichtauto').addEventListener('click', automatisch);
  el('cluboverzichtvulnogin').addEventListener('click', vulNogIn);
  el('cluboverzichtvoorstel').addEventListener('click', async (e) => {
    const knop = e.target.closest('[data-voorstel]');
    if (!knop) return;
    if (knop.dataset.voorstel === 'nee') {
      el('cluboverzichtvoorstel').innerHTML = '';
      return;
    }
    knop.disabled = true;
    const uit = await api('/api/admin/officials/automatisch', 'POST', { dagen: 21, uitvoeren: true });
    el('cluboverzichtvoorstel').innerHTML = uit.status === 200
      ? `<p class="melding">${uit.body.aantal_toegewezen} aanduiding(en) gezet, ${uit.body.verwittigd} bericht(en) verstuurd.</p>`
      : `<p class="melding fout">${veilig(fout(uit))}</p>`;
    await laadCluboverzicht();
  });
  el('cluboverzichtproblemen').addEventListener('click', async (e) => {
    const knop = e.target.closest('[data-afgehandeld]');
    if (!knop) return;
    await api('/api/admin/officials/probleem-afhandelen', 'POST', { id: Number(knop.dataset.afgehandeld) });
    laadProblemen();
  });
  el('cluboverzichtlijst').addEventListener('click', (e) => {
    const knop = e.target.closest('button');
    if (!knop) return;
    if (knop.dataset.filter) {
      // Nog eens op hetzelfde filter klikken heft het op.
      staat.filter = knop.dataset.filter === 'alles' || staat.filter === knop.dataset.filter ? null : knop.dataset.filter;
      return teken();
    }
    if (knop.hasAttribute('data-meer')) {
      staat.alles = !staat.alles;
      return teken();
    }
    if (knop.hasAttribute('data-voorbij')) {
      staat.voorbij = !staat.voorbij;
      return laadCluboverzicht();
    }
    const kaartEl = knop.closest('[data-wedstrijd]');
    if (!kaartEl) return;
    const id = Number(kaartEl.dataset.wedstrijd);
    if (knop.dataset.wijs) return wijsAan(id, knop.dataset.wijs);
    if (knop.dataset.vrij) return geefVrij(id, knop.dataset.vrij);
    if (knop.dataset.scope) return post('/api/admin/officials/scope', { wedstrijd_id: id, scope: knop.dataset.scope === '1' });
    if (knop.dataset.refs) return post('/api/admin/officials/refs-bevestigd', { wedstrijd_id: id, bevestigd: knop.dataset.refs === '1' });
    if (knop.hasAttribute('data-ander')) return iemandAnders(id);
  });
}
