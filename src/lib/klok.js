// Brusselse tijd.
//
// De cron van Cloudflare draait op UTC. Zeven taken over zeven cron-expressies
// verdelen zou twee keer per jaar een uur verschuiven met de zomertijd, dus
// draait er één taak per uur die zelf beslist welk Brussels uur het is.

export function brusselUur(datum = new Date()) {
  const stukken = new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'Europe/Brussels',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(datum);
  const uur = stukken.find((s) => s.type === 'hour');
  return Number(uur.value) % 24;
}

// 1 = maandag, 7 = zondag. Dezelfde nummering als ISO, zodat 'woensdag 14u'
// leesbaar blijft in de planner.
export function brusselWeekdag(datum = new Date()) {
  const naam = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels',
    weekday: 'short',
  }).format(datum);
  const volgorde = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return volgorde[naam] ?? 0;
}
