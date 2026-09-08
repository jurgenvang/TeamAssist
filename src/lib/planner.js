// Welke automatische taak op welk Brussels uur moet lopen.
//
// Zuivere functie, geen databank- of netwerktoegang — dat maakt haar zonder
// mocks te testen. Dezelfde reden als bij brusselUur() zelf: één taak per uur
// die zelf beslist, in plaats van cron-expressies die tweemaal per jaar een
// uur zouden verschuiven met de zomertijd.

/**
 * @param {number} uur   Brussels uur, 0-23 (zie klok.js, brusselUur())
 * @param {number} dag   ISO-weekdag, 1 (maandag) - 7 (zondag) (brusselWeekdag())
 * @returns {string[]}   namen van de taken die dit uur moeten lopen, kan leeg zijn
 */
export function takenVoorUur(uur, dag) {
  const taken = [];

  // Opruiming (T15): elke dag, op het rustigste uur — vóór ploegen/leden (3
  // uur) en de ping (4 uur). Geen enkele van de vier onderdelen (logboek,
  // taak_runs, berichten, inactieve personen) is tijdsgevoelig genoeg om
  // vaker te moeten lopen.
  if (uur === 2) taken.push('opkuis');

  // Wedstrijden: het meest tijdsgevoelig, want een wijziging triggert een
  // echte mail (verwittig(), sinds 0.18.0). Vier keer per dag, zoals YOAssist.
  if ([0, 6, 12, 18].includes(uur)) taken.push('wedstrijden');

  // Ploegen en leden wijzigen veel trager dan de kalender — één keer per dag
  // volstaat. Op een rustig uur, vóór de bestaande ping op 4 uur.
  if (uur === 3) taken.push('teams', 'leden');

  // Vakanties, examens en feestdagen wijzigen zelden binnen een schooljaar.
  // Wekelijks, maandagochtend, ruim vóór de woensdagse trainingen.
  if (uur === 5 && dag === 1) taken.push('periodes');

  // De bestaande supabase-ping, ongewijzigd.
  if (uur === 4) taken.push('ping');

  return taken;
}
