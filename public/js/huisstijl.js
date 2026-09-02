// De huisstijl van de club toepassen.
//
// Wordt zowel vóór als na het aanmelden aangeroepen: het aanmeldscherm mag de
// clubkleur al tonen (via de publieke route /api/branding), en na het bewaren
// van een nieuwe instelling wordt dezelfde functie herbruikt om meteen te
// laten zien wat er veranderd is.
//
// Past enkel toe wat de backend al goedgekeurd heeft — de contrastcontrole zit
// in src/lib/kleur.js aan de kant van de server. Hier wordt niets herbeoordeeld,
// enkel weergegeven.

import { el } from './hulp.js';
import { haalBranding } from './api.js';

export async function pasHuisstijlToe() {
  let gegevens;
  try {
    gegevens = await haalBranding();
  } catch {
    return; // geen netwerk, geen huisstijl — de standaardkleuren blijven gelden
  }

  const root = document.documentElement.style;
  if (gegevens.kleur_accent) {
    root.setProperty('--accent', gegevens.kleur_accent);
  } else {
    root.removeProperty('--accent');
  }

  const clubnaamEl = el('clubnaam');
  if (clubnaamEl && gegevens.clubnaam) clubnaamEl.textContent = gegevens.clubnaam;

  const logo = el('clublogo');
  if (logo) {
    if (gegevens.logo_url) {
      logo.src = gegevens.logo_url;
      logo.hidden = false;
      // Het logo-URL-patroon is niet uit de officiële VBL-documentatie
      // bevestigd (zie src/lib/vbl.js). Laadt het niet, dan verbergen we het
      // gewoon weer in plaats van een gebroken afbeelding te tonen.
      logo.onerror = () => {
        logo.hidden = true;
      };
    } else {
      logo.hidden = true;
    }
  }
}
