// Een echte respons van de bond bekijken.

import { api } from '../api.js';
import { el } from '../hulp.js';

export async function toonDiagnose(ruw) {
  const team = el('diagnoseteam').value.trim();
  const vraag = new URLSearchParams();
  if (team) vraag.set('team', team);
  if (ruw) vraag.set('ruw', '1');

  const uitvoer = el('diagnoseuitvoer');
  uitvoer.hidden = false;
  uitvoer.textContent = 'Ophalen bij de bond …';

  const uitkomst = await api(`/api/admin/vbl-diagnose?${vraag}`);
  uitvoer.textContent = JSON.stringify(uitkomst.body, null, 2);
}
