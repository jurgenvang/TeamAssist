// Belangrijk nieuws plaatsen, bij Dagelijks beheer (0.28.0).
//
// Altijd eerst een droogloop: 'Voorbereiden' toont hoeveel mensen het zouden
// krijgen, pas 'Plaatsen' doet het. Dit kan naar de hele club tegelijk gaan.

import { api } from '../api.js';
import { el, toon, veilig } from '../hulp.js';

function invoer() {
  const tot = el('mededelingtot').value;
  return {
    tekst: el('mededelinginvoer').value,
    link: el('mededelinginvoerlink').value,
    link_tekst: el('mededelinginvoerlinktekst').value,
    // datetime-local is plaatselijke tijd zonder zone; new Date() leest het
    // als plaatselijk, toISOString() maakt er UTC van — zoals de backend het
    // bewaart.
    geldig_tot: tot ? new Date(tot).toISOString() : '',
    doelgroep: el('mededelingdoelgroep').value,
    team_guid: el('mededelingploeg').value || null,
    bericht: el('mededelingbericht').checked,
  };
}

function werkPloegkeuzeBij() {
  el('mededelingploeg').hidden = el('mededelingdoelgroep').value !== 'ploeg';
}

/** Een standaardeinde een week verder, in de vorm die datetime-local wil. */
function overEenWeek() {
  const d = new Date(Date.now() + 7 * 86400000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export async function laadMededelingBeheer() {
  if (!el('mededelingtot').value) el('mededelingtot').value = overEenWeek();
  el('mededelingplaatsen').hidden = true;
  el('mededelingplan').hidden = true;

  const [huidig, ploegen] = await Promise.all([api('/api/admin/mededeling'), api('/api/admin/teams')]);
  const m = huidig.body?.mededeling;
  el('mededelinghuidig').innerHTML = m
    ? `<p><strong>Nu zichtbaar:</strong> ${veilig(m.tekst)}</p>
       <p class="klein">Tot ${veilig(new Date(m.geldig_tot).toLocaleString('nl-BE'))} — ${veilig(m.doelgroep)},
       ${huidig.body.weggeklikt} keer weggeklikt.</p>`
    : '<p class="klein">Er staat nu geen mededeling.</p>';
  el('mededelingintrekken').hidden = !m;

  const gevolgd = (ploegen.body?.teams ?? []).filter((p) => p.gevolgd);
  el('mededelingploeg').innerHTML =
    '<option value="">— kies een ploeg —</option>' +
    gevolgd
      .map((p) => `<option value="${veilig(p.guid)}">${veilig(p.naam_kort ?? p.naam)}</option>`)
      .join('');
  werkPloegkeuzeBij();
}

export async function bereidMededelingVoor() {
  const uit = await api('/api/admin/mededeling', 'POST', invoer());
  if (uit.status !== 200) {
    el('mededelingplaatsen').hidden = true;
    return toon('mededelingplan', uit.body?.fout ?? `Fout ${uit.status}`, true);
  }
  const b = uit.body;
  toon(
    'mededelingplan',
    invoer().bericht
      ? `Dit gaat als bericht naar ${b.ontvangers} ${b.ontvangers === 1 ? 'persoon' : 'personen'} met een account` +
          (b.zonder_mail ? ` (${b.zonder_mail} zonder e-mailadres: enkel de banner).` : '.') +
          ' De banner zien ze bovenaan tot de einddatum.'
      : 'Enkel de banner, zonder mail of Mijn berichten.'
  );
  el('mededelingplaatsen').hidden = false;
}

export async function plaatsMededeling() {
  if (!confirm('Deze mededeling nu plaatsen? Een vorige verdwijnt dan.')) return;
  const uit = await api('/api/admin/mededeling', 'POST', { ...invoer(), uitvoeren: true });
  if (uit.status !== 200) return toon('mededelingplan', uit.body?.fout ?? `Fout ${uit.status}`, true);
  const b = uit.body;
  toon(
    'mededelingplan',
    b.omgeleid
      ? 'Geplaatst. De berichten gingen naar het omleidadres (bericht_modus staat op omleiden).'
      : `Geplaatst. ${b.verstuurd} verstuurd${b.mislukt ? `, ${b.mislukt} mislukt (zie logboek)` : ''}.`,
    Boolean(b.mislukt)
  );
  el('mededelingplaatsen').hidden = true;
  el('mededelinginvoer').value = '';
  laadMededelingBeheer();
}

export async function trekMededelingIn() {
  if (!confirm('De huidige mededeling weghalen? Wie ze als bericht kreeg, houdt dat bericht.')) return;
  await api('/api/admin/mededeling/intrekken', 'POST', {});
  laadMededelingBeheer();
}

export function koppelMededelingBeheer() {
  el('mededelingdoelgroep').addEventListener('change', werkPloegkeuzeBij);
  el('mededelingvoorbereiden').addEventListener('click', bereidMededelingVoor);
  el('mededelingplaatsen').addEventListener('click', plaatsMededeling);
  el('mededelingintrekken').addEventListener('click', trekMededelingIn);
  // Na elke wijziging aan het formulier opnieuw voorbereiden: anders zou
  // 'Plaatsen' iets anders kunnen versturen dan de droogloop toonde.
  for (const id of ['mededelinginvoer', 'mededelinginvoerlink', 'mededelinginvoerlinktekst', 'mededelingtot',
    'mededelingdoelgroep', 'mededelingploeg', 'mededelingbericht']) {
    el(id).addEventListener('input', () => { el('mededelingplaatsen').hidden = true; });
  }
}
