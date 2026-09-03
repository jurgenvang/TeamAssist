// Zalen, periodes en trainingsreeksen.

import { api } from '../api.js';
import { el, toon, veilig } from '../hulp.js';

const DAGNAMEN = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

export async function laadZalen() {
  const uitkomst = await api('/api/admin/zalen');
  if (uitkomst.status !== 200) return;
  const zalen = uitkomst.body.zalen;

  el('zalenlijf').innerHTML = zalen
    .map(
      (z) => `<tr>
        <td>${veilig(z.naam)}</td>
        <td class="ploegen">${z.blokken
          .map((b) => `${DAGNAMEN[b.weekdag]} ${veilig(b.begin)}-${veilig(b.einde)}`)
          .join(', ') || 'geen blokken'}</td>
      </tr>`
    )
    .join('');

  el('zaalkeuze').innerHTML = zalen.map((z) => `<option value="${veilig(z.id)}">${veilig(z.naam)}</option>`).join('');

  const reekszaal = el('reekszaal');
  if (reekszaal) {
    reekszaal.innerHTML =
      '<option value="">— vrije locatie —</option>' +
      zalen.map((z) => `<option value="${veilig(z.id)}">${veilig(z.naam)}</option>`).join('');
  }
}

export async function maakZaal() {
  const naam = el('nieuwezaalnaam').value.trim();
  if (!naam) return;
  const uit = await api('/api/admin/zalen', 'POST', { naam });
  toon('zalenmelding', uit.status === 200 ? 'Zaal aangemaakt.' : `Dat lukte niet: ${uit.body?.fout}`, uit.status !== 200);
  if (uit.status === 200) {
    el('nieuwezaalnaam').value = '';
    await laadZalen();
  }
}

export async function maakBlok() {
  const zaal_id = el('zaalkeuze').value;
  const weekdag = Number(el('blokweekdag').value);
  const begin = el('blokbegin').value;
  const einde = el('blokeinde').value;
  if (!zaal_id || !begin || !einde) {
    toon('zalenmelding', 'Kies een zaal en vul begin en einde in.', true);
    return;
  }
  const uit = await api('/api/admin/zalen/blok', 'POST', { zaal_id, weekdag, begin, einde });
  toon('zalenmelding', uit.status === 200 ? 'Blok toegevoegd.' : `Dat lukte niet: ${uit.body?.fout}`, uit.status !== 200);
  if (uit.status === 200) await laadZalen();
}

export async function laadPeriodes() {
  const uitkomst = await api('/api/admin/periodes');
  if (uitkomst.status !== 200) return;
  el('periodeslijf').innerHTML = uitkomst.body.periodes
    .map(
      (p) => `<tr>
        <td>${veilig(p.naam)}</td>
        <td>${veilig(p.van)} — ${veilig(p.tot)}</td>
        <td>${veilig(p.soort)}</td>
        <td>${veilig(p.doelgroep)}</td>
        <td class="ploegen">${p.bron === 'club' ? 'handmatig' : 'opgehaald'}</td>
      </tr>`
    )
    .join('');
}

export async function synchroniseerVakanties() {
  const vak = el('periodesplan');
  vak.hidden = false;
  vak.textContent = 'Ophalen bij OpenHolidays …';

  const proef = await api('/api/admin/periodes/sync', 'POST');
  if (proef.status !== 200) {
    vak.textContent = `Dat lukte niet: ${proef.body?.fout ?? proef.status}`;
    return;
  }
  const samenvatting = `${proef.body.gevonden} gevonden, ${proef.body.nieuw} nieuw, ${proef.body.ongewijzigd} ongewijzigd.`;
  if (!confirm(`${samenvatting}\n\nUitvoeren?`)) {
    vak.textContent = `Niets gewijzigd. ${samenvatting}`;
    return;
  }
  const echt = await api('/api/admin/periodes/sync?uitvoeren=1', 'POST');
  vak.textContent = echt.status === 200 ? `Klaar. ${samenvatting}` : 'Uitvoeren lukte niet.';
  await laadPeriodes();
}

// --- Wedstrijden per ploeg ---------------------------------------------------

let huidigWedstrijdenTeam = null;

export async function toonWedstrijden(teamGuid) {
  huidigWedstrijdenTeam = teamGuid;
  el('wedstrijdenscherm').hidden = false;
  const uitkomst = await api(`/api/admin/wedstrijden?team=${encodeURIComponent(teamGuid)}`);
  if (uitkomst.status !== 200) return;

  el('wedstrijdenlijf').innerHTML = uitkomst.body.wedstrijden
    .map(
      (w) => `<tr>
        <td>${veilig(w.datum)} ${veilig(w.begin)}</td>
        <td>${w.thuis ? 'thuis' : 'uit'} — ${veilig(w.tegenstander ?? '')}</td>
        <td>${veilig(w.locatie_tekst ?? '')}</td>
        <td>${veilig(w.uitslag ?? '')}</td>
        <td class="ploegen">${w.bij_bond ? '' : 'niet meer bij de bond'}</td>
        <td><button type="button" class="alslink" data-wedstrijd-aanwezigheid="${w.id}">Aanwezigheid</button></td>
      </tr>`
    )
    .join('');
}

function wedstrijdenSyncUrl(teamGuid, uitvoeren) {
  const vraag = new URLSearchParams();
  if (teamGuid) vraag.set('team', teamGuid);
  if (uitvoeren) vraag.set('uitvoeren', '1');
  const tekst = vraag.toString();
  return `/api/admin/wedstrijden/sync${tekst ? `?${tekst}` : ''}`;
}

export function getHuidigWedstrijdenTeam() {
  return huidigWedstrijdenTeam;
}

export async function synchroniseerWedstrijden(teamGuid) {
  const vak = el('wedstrijdenplan');
  vak.hidden = false;
  vak.textContent = 'Ophalen bij de bond …';

  const proef = await api(wedstrijdenSyncUrl(teamGuid, false), 'POST');
  if (proef.status !== 200) {
    vak.textContent = `Dat lukte niet: ${proef.body?.fout ?? proef.status}`;
    return;
  }
  const t = proef.body.totalen;
  const samenvatting =
    `${proef.body.ploegen.length} ploegen: ${t.nieuw} nieuw, ${t.gewijzigd} gewijzigd, ` +
    `${t.uitslag_bijgewerkt} uitslagen bijgewerkt, ${t.verdwenen} niet meer bij de bond`;

  if (!confirm(`${samenvatting}\n\nUitvoeren?`)) {
    vak.textContent = `Niets gewijzigd. ${samenvatting}`;
    return;
  }
  const echt = await api(wedstrijdenSyncUrl(teamGuid, true), 'POST');
  vak.textContent = echt.status === 200 ? `Klaar. ${samenvatting}` : 'Uitvoeren lukte niet.';
  if (teamGuid) await toonWedstrijden(teamGuid);
}

// --- Trainingsreeksen per ploeg ---------------------------------------------

let huidigTeam = null;

export async function toonReeksen(teamGuid) {
  huidigTeam = teamGuid;
  el('reeksenscherm').hidden = false;
  const uitkomst = await api(`/api/admin/trainingsreeksen?team=${encodeURIComponent(teamGuid)}`);
  if (uitkomst.status !== 200) return;

  el('reeksenlijf').innerHTML = uitkomst.body.reeksen
    .map(
      (r) => `<tr>
        <td>${DAGNAMEN[r.weekdag]} ${veilig(r.begin)}-${veilig(r.einde)}</td>
        <td>${veilig(r.zaal_naam ?? r.locatie_tekst ?? '')}</td>
        <td>${veilig(r.van)} — ${veilig(r.tot)}</td>
        <td><button type="button" data-genereer="${r.id}">Trainingen genereren</button></td>
        <td><button type="button" class="stil" data-stop="${r.id}">Stoppen</button></td>
      </tr>`
    )
    .join('');

  for (const knop of el('reeksenlijf').querySelectorAll('button[data-genereer]')) {
    knop.addEventListener('click', () => genereerVoorReeks(knop.dataset.genereer));
  }
  for (const knop of el('reeksenlijf').querySelectorAll('button[data-stop]')) {
    knop.addEventListener('click', async () => {
      if (!confirm('Deze reeks stoppen? Bestaande trainingen blijven staan.')) return;
      await api('/api/admin/trainingsreeksen/stoppen', 'POST', { id: Number(knop.dataset.stop) });
      await toonReeksen(huidigTeam);
    });
  }
}

async function genereerVoorReeks(reeksId) {
  const vak = el('reeksenmelding');
  vak.hidden = false;
  vak.textContent = 'Bezig …';

  const proef = await api(`/api/admin/trainingsreeksen/genereren?reeks=${reeksId}`, 'POST');
  if (proef.status !== 200) {
    vak.textContent = `Dat lukte niet: ${proef.body?.fout ?? proef.status}`;
    return;
  }
  const p = proef.body;
  const samenvatting =
    `${p.nieuw.length} nieuw of bijgewerkt, ${p.ongewijzigd.length} ongewijzigd, ` +
    `${p.behouden.length} handmatig gewijzigd (blijft staan), ` +
    `${p.overgeslagen_vakantie.length} vakantie, ${p.overgeslagen_sluiting.length} zaalsluiting`;

  if (!confirm(`${samenvatting}\n\nUitvoeren?`)) {
    vak.textContent = `Niets gewijzigd. ${samenvatting}`;
    return;
  }
  const echt = await api(`/api/admin/trainingsreeksen/genereren?reeks=${reeksId}&uitvoeren=1`, 'POST');
  vak.textContent = echt.status === 200 ? `Klaar. ${samenvatting}` : 'Uitvoeren lukte niet.';
}

export async function maakReeks() {
  if (!huidigTeam) return;
  const body = {
    team_guid: huidigTeam,
    weekdag: Number(el('reeksweekdag').value),
    begin: el('reeksbegin').value,
    einde: el('reekseinde').value,
    zaal_id: el('reekszaal').value || null,
    locatie_tekst: el('reekslocatie').value.trim() || null,
    van: el('reeksvan').value,
    tot: el('reekstot').value,
  };
  const uit = await api('/api/admin/trainingsreeksen', 'POST', body);
  toon('reeksenmelding', uit.status === 200 ? 'Reeks aangemaakt.' : `Dat lukte niet: ${uit.body?.fout}`, uit.status !== 200);
  if (uit.status === 200) await toonReeksen(huidigTeam);
}
