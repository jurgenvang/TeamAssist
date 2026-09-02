// Kleine hulpjes voor het scherm.

export const el = (id) => document.getElementById(id);

export function toon(id, tekst, foutief = false) {
  const vak = el(id);
  vak.textContent = tekst;
  vak.classList.toggle('fout', foutief);
  vak.hidden = false;
}

/**
 * Ontsmet tekst die in HTML terechtkomt.
 *
 * Namen komen uit een externe bron en uit invoervelden. Ze rechtstreeks in een
 * sjabloon plakken laat een naam met een punthaak het scherm breken — of erger.
 */
export function veilig(waarde) {
  return String(waarde ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function datum(waarde) {
  return waarde ?? '';
}
