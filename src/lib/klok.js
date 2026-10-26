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

// De Brusselse kalenderdag, 'jjjj-mm-dd'. Rond middernacht verschilt die van
// de UTC-dag — een herinnering 'voor morgen' moet over de Brusselse morgen gaan.
export function brusselDatum(datum = new Date()) {
  const d = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(datum)
      .map((s) => [s.type, s.value])
  );
  return `${d.year}-${d.month}-${d.day}`;
}

/** 'jjjj-mm-dd' plus n dagen. */
export function plusDagen(iso, n) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}
