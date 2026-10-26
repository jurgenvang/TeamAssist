// Eén persoon bekijken en aanpassen.

import { api } from '../api.js';
import { el, toon, veilig } from '../hulp.js';

const VELDEN = [
  ['voornaam', 'Voornaam'],
  ['achternaam', 'Achternaam'],
  ['geboortedatum', 'Geboortedatum (jjjj-mm-dd)'],
  ['email', 'E-mailadres'],
  ['tel_vast', 'Telefoon vast'],
  ['tel_gsm', 'Gsm'],
  ['straat', 'Straat'],
  ['nummer', 'Nummer'],
  ['bus', 'Bus'],
  ['postcode', 'Postcode'],
  ['gemeente', 'Gemeente'],
];

let huidige = null;

export async function toonPersoon(id) {
  const uitkomst = await api(`/api/admin/persoon?id=${encodeURIComponent(id)}`);
  if (uitkomst.status !== 200) return;

  const p = uitkomst.body.persoon;
  huidige = p;
  el('persoon').hidden = false;
  el('persoonkop').textContent = `${p.voornaam} ${p.achternaam}`;

  // De herkomst erbij: dat verklaart waarom een veld staat zoals het staat, en
  // of een correctie zal blijven staan.
  const stukken = [];
  if (p.naam_vbl) stukken.push(`Bij de bond: ${p.naam_vbl}`);
  if (p.lid_nr) stukken.push(`lidnummer ${p.lid_nr}`);
  stukken.push(`naam ${p.naam_bron === 'club' ? 'handmatig gezet' : 'afgeleid van de bond'}`);
  if (!p.actief) stukken.push('staat op te verwijderen');
  el('persoonherkomst').textContent = stukken.join(' — ');

  el('persoonvelden').innerHTML = VELDEN.map(
    ([veld, label]) => `<label class="veld"><span>${label}</span>
      <input type="text" data-veld="${veld}" value="${veilig(p[veld] ?? '')}"></label>`
  ).join('');

  toonPloegen(p.ploegen ?? []);
  toonRollen(p.rollen ?? []);
  toonFamilie(uitkomst.body);
  await vulTeamkeuze();

  el('persoonverwijderen').textContent = p.actief
    ? 'Op te verwijderen zetten'
    : 'Toch niet verwijderen';
  el('persoonmelding').hidden = true;
  el('persoon').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function toonPloegen(ploegen) {
  el('persoonploegenlijf').innerHTML = ploegen
    .map((pl) => {
      const herkomst = pl.bron === 'club' ? 'handmatig gekoppeld' : pl.bij_bond ? 'bij de bond' : 'niet meer bij de bond';
      return `<tr>
        <td>${veilig(pl.naam)}</td>
        <td class="ploegen">${herkomst}</td>
        <td>${
          pl.bron === 'club'
            ? `<button type="button" class="alslink" data-team-ontkoppelen="${veilig(pl.guid)}">Ontkoppelen</button>`
            : ''
        }</td>
      </tr>`;
    })
    .join('');

  for (const knop of el('persoonploegenlijf').querySelectorAll('[data-team-ontkoppelen]')) {
    knop.addEventListener('click', async () => {
      if (!huidige) return;
      if (!confirm('Deze handmatige koppeling verwijderen?')) return;
      const uit = await api('/api/admin/persoon/team-ontkoppelen', 'POST', {
        persoon_id: huidige.id,
        team_guid: knop.dataset.teamOntkoppelen,
      });
      if (uit.status === 200) await toonPersoon(huidige.id);
      else toon('persoonmelding', uit.body?.fout ?? `Fout ${uit.status}`, true);
    });
  }
}

const CLUBBREDE_ROLLEN = ['ADMIN', 'FINADM', 'YOADM', 'YO', 'YOPLUS'];

function toonRollen(rollen) {
  el('persoonrollenlijf').innerHTML = rollen
    .map((r) => {
      const herkomst = r.bron === 'club' ? 'handmatig gekoppeld' : 'bij de bond';
      return `<tr>
        <td>${veilig(r.rol)}</td>
        <td class="ploegen">${veilig(r.team_naam ?? '—')}</td>
        <td class="ploegen">${herkomst}</td>
        <td>${
          r.bron === 'club'
            ? `<button type="button" class="alslink" data-rol-ontkoppelen="${veilig(r.rol)}" data-rol-team="${veilig(r.team_guid ?? '')}">Ontkoppelen</button>`
            : ''
        }</td>
      </tr>`;
    })
    .join('');

  for (const knop of el('persoonrollenlijf').querySelectorAll('[data-rol-ontkoppelen]')) {
    knop.addEventListener('click', async () => {
      if (!huidige) return;
      if (!confirm('Deze rol verwijderen?')) return;
      const uit = await api('/api/admin/persoon/rol-ontkoppelen', 'POST', {
        persoon_id: huidige.id,
        rol: knop.dataset.rolOntkoppelen,
        team_guid: knop.dataset.rolTeam || undefined,
      });
      if (uit.status === 200) await toonPersoon(huidige.id);
      else toon('persoonmelding', uit.body?.fout ?? `Fout ${uit.status}`, true);
    });
  }
}

// Ouders en kinderen (0.32.0). Koppelen kon tot dan enkel via het
// personensjabloon; een official die geen speler is, staat daar niet in.
function toonFamilie({ ouders = [], kinderen = [], ouders_meelezen }) {
  const rijen = [
    ...ouders.map((o) => ({ ...o, is: 'ouder', ouder_id: o.id, kind_id: huidige.id })),
    ...kinderen.map((k) => ({ ...k, is: 'kind', ouder_id: huidige.id, kind_id: k.id })),
  ];
  el('persoonfamilielijf').innerHTML = rijen
    .map(
      (r) => `<tr>
        <td><button type="button" class="alslink" data-persoon-open="${veilig(r.id)}">${veilig(r.voornaam)} ${veilig(r.achternaam)}</button></td>
        <td class="ploegen">${r.is}${
          r.is === 'kind' ? (r.ouders_meelezen ? ' — berichten ook naar de ouders' : ' — berichten enkel naar het kind') : ''
        }</td>
        <td><button type="button" class="alslink" data-familie-weg data-ouder="${veilig(r.ouder_id)}" data-kind="${veilig(r.kind_id)}">Ontkoppelen</button></td>
      </tr>`
    )
    .join('');
  el('persoonmeelezen').textContent =
    ouders_meelezen === null || ouders_meelezen === undefined
      ? ''
      : ouders_meelezen
        ? 'Berichten aan deze persoon gaan ook naar de ouders.'
        : 'Berichten aan deze persoon gaan enkel naar de persoon zelf.';
  el('persoonfamilietreffers').innerHTML = '';

  for (const knop of el('persoonfamilielijf').querySelectorAll('[data-persoon-open]')) {
    knop.addEventListener('click', () => toonPersoon(knop.dataset.persoonOpen));
  }
  for (const knop of el('persoonfamilielijf').querySelectorAll('[data-familie-weg]')) {
    knop.addEventListener('click', async () => {
      if (!confirm('Deze koppeling tussen ouder en kind verwijderen?')) return;
      const uit = await api('/api/admin/persoon/ouder-ontkoppelen', 'POST', {
        ouder_id: knop.dataset.ouder,
        kind_id: knop.dataset.kind,
      });
      if (uit.status === 200) await toonPersoon(huidige.id);
      else toon('persoonmelding', uit.body?.fout ?? `Fout ${uit.status}`, true);
    });
  }
}

async function zoekFamilie() {
  const term = el('persoonfamiliezoek').value.trim();
  if (!term || !huidige) return;
  const uit = await api(`/api/admin/personen?zoek=${encodeURIComponent(term)}`);
  if (uit.status !== 200) {
    toon('persoonmelding', uit.body?.fout ?? `Fout ${uit.status}`, true);
    return;
  }
  const treffers = (uit.body.personen ?? []).filter((p) => p.id !== huidige.id);
  el('persoonfamilietreffers').innerHTML = treffers.length
    ? `<table><tbody>${treffers
        .map(
          (p) => `<tr>
            <td>${veilig(p.voornaam)} ${veilig(p.achternaam)}</td>
            <td><button type="button" class="alslink" data-als="ouder" data-id="${veilig(p.id)}">is ouder</button></td>
            <td><button type="button" class="alslink" data-als="kind" data-id="${veilig(p.id)}">is kind</button></td>
          </tr>`
        )
        .join('')}</tbody></table>`
    : '<p class="klein">Niemand gevonden.</p>';

  for (const knop of el('persoonfamilietreffers').querySelectorAll('[data-als]')) {
    knop.addEventListener('click', async () => {
      const ander = knop.dataset.id;
      const body =
        knop.dataset.als === 'ouder' ? { ouder_id: ander, kind_id: huidige.id } : { ouder_id: huidige.id, kind_id: ander };
      const res = await api('/api/admin/persoon/ouder-koppelen', 'POST', body);
      if (res.status === 200) await toonPersoon(huidige.id);
      else toon('persoonmelding', res.body?.fout ?? `Fout ${res.status}`, true);
    });
  }
}

async function vulTeamkeuze() {
  const uit = await api('/api/admin/teams');
  if (uit.status !== 200) return;
  const opties = (uit.body.teams ?? [])
    .map((t) => `<option value="${veilig(t.guid)}">${veilig(t.naam_kort ?? t.naam)}</option>`)
    .join('');
  el('persoonteamkeuze').innerHTML = opties;
  el('persoonrolteam').innerHTML = opties;
}

async function bewaar() {
  if (!huidige) return;
  const body = { id: huidige.id };
  for (const invoer of el('persoonvelden').querySelectorAll('input[data-veld]')) {
    body[invoer.dataset.veld] = invoer.value;
  }

  const uitkomst = await api('/api/admin/persoon', 'POST', body);
  if (uitkomst.status !== 200) {
    toon('persoonmelding', uitkomst.body?.fout ?? `Fout ${uitkomst.status}`, true);
    return;
  }
  const gewijzigd = uitkomst.body.gewijzigd;
  toon(
    'persoonmelding',
    gewijzigd.length
      ? `Bewaard: ${gewijzigd.join(', ')}. Wat je zelf invulde, wordt niet meer door de bond overschreven.`
      : 'Er was niets gewijzigd.'
  );
  await toonPersoon(huidige.id);
}

export function koppelPersoonscherm() {
  el('persoonbewaren').addEventListener('click', bewaar);
  el('persoonfamiliezoeken').addEventListener('click', zoekFamilie);
  el('persoonteamkoppelen').addEventListener('click', async () => {
    if (!huidige) return;
    const team_guid = el('persoonteamkeuze').value;
    if (!team_guid) return;
    const uit = await api('/api/admin/persoon/team-koppelen', 'POST', { persoon_id: huidige.id, team_guid });
    if (uit.status === 200) await toonPersoon(huidige.id);
    else toon('persoonmelding', uit.body?.fout ?? `Fout ${uit.status}`, true);
  });

  // Een clubbrede rol (ADMIN/FINADM) vraagt geen team — het keuzeveld
  // verbergen voorkomt dat iemand denkt dat het wel nodig is.
  const toonRolteamveld = () => {
    el('persoonrolteam').hidden = CLUBBREDE_ROLLEN.includes(el('persoonrolkeuze').value);
  };
  el('persoonrolkeuze').addEventListener('change', toonRolteamveld);
  toonRolteamveld();

  el('persoonrolkoppelen').addEventListener('click', async () => {
    if (!huidige) return;
    const rol = el('persoonrolkeuze').value;
    const clubbreed = CLUBBREDE_ROLLEN.includes(rol);
    const team_guid = clubbreed ? undefined : el('persoonrolteam').value;
    if (!clubbreed && !team_guid) return;
    const uit = await api('/api/admin/persoon/rol-koppelen', 'POST', { persoon_id: huidige.id, rol, team_guid });
    if (uit.status === 200) await toonPersoon(huidige.id);
    else toon('persoonmelding', uit.body?.fout ?? `Fout ${uit.status}`, true);
  });
  el('persoonsluiten').addEventListener('click', () => {
    el('persoon').hidden = true;
    huidige = null;
  });
  el('persoonverwijderen').addEventListener('click', async () => {
    if (!huidige) return;
    const naarActief = !huidige.actief;
    if (!naarActief && !confirm('Deze persoon op te verwijderen zetten? Hij blijft zichtbaar voor beheerders.')) {
      return;
    }
    const uitkomst = await api('/api/admin/persoon/actief', 'POST', {
      id: huidige.id,
      actief: naarActief,
    });
    if (uitkomst.status !== 200) {
      toon('persoonmelding', uitkomst.body?.fout ?? `Fout ${uitkomst.status}`, true);
      return;
    }
    await toonPersoon(huidige.id);
  });
}
