// Kijken met een andere rol.
//
// De keuze wordt in een kop meegestuurd; de backend versmalt daarmee de
// rechten en kan ze nooit verbreden. Wat hier gebeurt is dus enkel het kiezen
// en het zichtbaar houden van de stand — de beveiliging zit aan de andere kant.

import { api, testrol, bewaarTestrol } from '../api.js';
import { el, veilig } from '../hulp.js';

const ROLLEN = ['ADMIN', 'FINADM', 'COORD', 'COACH', 'PLOEGV', 'SPELER', 'OUVO'];
const CLUBBREED = ['ADMIN', 'FINADM'];

export function toonTestbalk(gegevens) {
  const keuze = testrol();
  const balk = el('testbalk');
  if (!keuze) {
    balk.hidden = true;
    return;
  }
  // Permanent zichtbaar: zonder die stand vergeet je dat je versmald kijkt en
  // meld je een fout die er niet is.
  el('testbalktekst').textContent =
    `Je kijkt als ${keuze.rol}` + (keuze.team ? ` van ${keuze.team}` : '') +
    ` — je eigen rechten zijn tijdelijk beperkt.`;
  balk.hidden = false;
}

export async function vulTestrolkeuze() {
  el('testrolrol').innerHTML =
    '<option value="">— eigen rollen —</option>' +
    ROLLEN.map((r) => `<option>${r}</option>`).join('');

  const uitkomst = await api('/api/admin/teams');
  const ploegen = (uitkomst.body?.teams ?? []).filter((p) => p.gevolgd);
  el('testrolteam').innerHTML =
    '<option value="">— kies een ploeg —</option>' +
    ploegen
      .map((p) => `<option value="${veilig(p.guid)}">${veilig(p.categorie ?? '')} ${veilig(p.naam)}</option>`)
      .join('');

  const keuze = testrol();
  if (keuze) {
    el('testrolrol').value = keuze.rol;
    el('testrolteam').value = keuze.team ?? '';
  }
  werkTeamkeuzeBij();
}

function werkTeamkeuzeBij() {
  const rol = el('testrolrol').value;
  // Een ploegrol zonder ploeg levert niets op: de rechtenlaag weigert elk
  // ploegrecht waar geen ploeg bij hoort.
  el('testrolteamveld').hidden = !rol || CLUBBREED.includes(rol);
}

export function koppelTestrol() {
  el('testrolrol').addEventListener('change', werkTeamkeuzeBij);

  el('testrolstart').addEventListener('click', () => {
    const rol = el('testrolrol').value;
    if (!rol) {
      bewaarTestrol(null);
      location.reload();
      return;
    }
    const team = CLUBBREED.includes(rol) ? null : el('testrolteam').value;
    if (!CLUBBREED.includes(rol) && !team) {
      el('testrolmelding').textContent = 'Kies er ook een ploeg bij.';
      return;
    }
    bewaarTestrol({ rol, team });
    location.reload();
  });

  el('testrolstop').addEventListener('click', () => {
    bewaarTestrol(null);
    location.reload();
  });
}
