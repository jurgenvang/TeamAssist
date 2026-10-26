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
  // Meteen erna, in dezelfde ronde: de rijen van de gevolgde ploegen staan er
  // dan al (0.33.0, module Officials).
  if ([0, 6, 12, 18].includes(uur)) taken.push('officials');

  // Ploegen en leden wijzigen veel trager dan de kalender — één keer per dag
  // volstaat. Op een rustig uur, vóór de bestaande ping op 4 uur.
  if (uur === 3) taken.push('teams', 'leden');

  // Vakanties, examens en feestdagen wijzigen zelden binnen een schooljaar.
  // Wekelijks, maandagochtend, ruim vóór de woensdagse trainingen.
  if (uur === 5 && dag === 1) taken.push('periodes');

  // De woensdagregel van de officials (0.34.0, uit YOAssist): woensdag om 14
  // uur de lijst van de bond verwerken, om 20 uur terugvallen op de API als
  // ze er dan nog niet is. Elke avond om 20 uur daarna de avondcontrole.
  if (uur === 14 && dag === 3) taken.push('woensdagregel');
  if (uur === 20 && dag === 3) taken.push('woensdag-terugval');
  if (uur === 20) taken.push('avondcontrole');

  // Herinneringen aan wie aangeduid is (0.35.0): 's avonds voor morgen, 's
  // ochtends voor vandaag. Maandag 8 uur het overzicht voor de beheerders.
  if (uur === 19) taken.push('herinnering-avond');
  if (uur === 7) taken.push('herinnering-ochtend');
  if (uur === 8 && dag === 1) taken.push('weekoverzicht');

  // De bestaande supabase-ping, ongewijzigd.
  if (uur === 4) taken.push('ping');

  return taken;
}
