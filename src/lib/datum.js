// Datums van de bond.
//
// Twee formaten in hetzelfde record, nagekeken op een echt antwoord:
// `sGebDat` is `dd-mm-jjjj`, `sAanslDat` is `dd-mm-jjjj uu:mm`. Een parser die
// op één vorm gokt, struikelt dus binnen dezelfde speler.
//
// Er wordt niets geraden. Wat er niet uit komt, geeft null terug en de
// aanroeper laat het veld leeg met een regel in het logboek — een verkeerd
// gelezen geboortedatum is erger dan een ontbrekende.

/**
 * Zet een datum van de bond om naar ISO (`jjjj-mm-dd`).
 * Geeft null bij alles wat niet met zekerheid te lezen valt.
 */
export function vblDatumNaarIso(waarde) {
  if (typeof waarde !== 'string') return null;
  const tekst = waarde.trim();
  if (!tekst) return null;

  // Enkel het datumgedeelte; een eventuele tijd erachter doet er niet toe.
  const match = tekst.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (!match) return null;

  const [, dag, maand, jaar] = match;
  const d = Number(dag);
  const m = Number(maand);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  // Nagaan of de datum echt bestaat: 31-02-2010 komt anders als 3 maart terug.
  const iso = `${jaar}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const gecontroleerd = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(gecontroleerd.getTime()) || gecontroleerd.getUTCDate() !== d) return null;

  return iso;
}

/**
 * Het uur van een VBL-wedstrijd: `10.30` — met een punt, niet een dubbele punt.
 * Geeft `uu:mm` terug, of null wanneer het niet klopt.
 */
export function vblTijdNaarUur(waarde) {
  if (typeof waarde !== 'string') return null;
  const match = waarde.trim().match(/^(\d{1,2})[.:](\d{2})$/);
  if (!match) return null;
  const [, u, m] = match;
  const uur = Number(u);
  if (uur < 0 || uur > 23 || Number(m) > 59) return null;
  return `${String(uur).padStart(2, '0')}:${m}`;
}
