// Schoolvakanties ophalen bij de OpenHolidays API.
//
// Eén keer per seizoen, niet live bij het genereren van trainingen: een
// externe dienst die wegvalt mag de agenda van de club niet platleggen. Wat
// hier ophaalt, is een voorstel — een periode met bron 'club' blijft altijd
// staan, ongeacht wat deze functie teruggeeft.

const BASIS = 'https://openholidaysapi.org';

export function periodeUrl(van, tot, subdivisieCode) {
  const p = new URLSearchParams({
    countryIsoCode: 'BE',
    languageIsoCode: 'NL',
    validFrom: van,
    validTo: tot,
  });
  if (subdivisieCode) p.set('subdivisionCode', subdivisieCode);
  return `${BASIS}/SchoolHolidays?${p}`;
}

/**
 * Zet een OpenHolidays-antwoord om naar rijen voor de tabel `periodes`.
 * Neemt de Nederlandstalige naam wanneer die er is, anders de eerste die er
 * staat — de API levert een lijst per taal, niet gegarandeerd met NL erbij.
 */
export function naarPeriodes(antwoord, seizoen) {
  if (!Array.isArray(antwoord)) return [];
  return antwoord.map((v) => {
    const namen = Array.isArray(v.name) ? v.name : [];
    const nl = namen.find((n) => n.language === 'NL')?.text;
    return {
      seizoen,
      naam: nl ?? namen[0]?.text ?? 'Schoolvakantie',
      van: v.startDate,
      tot: v.endDate,
      soort: 'vakantie',
      doelgroep: 'iedereen',
      bron: 'openholidays',
    };
  });
}

export async function haalVakanties(seizoenVan, seizoenTot, subdivisieCode, fetcher = fetch) {
  const url = periodeUrl(seizoenVan, seizoenTot, subdivisieCode);
  const antwoord = await fetcher(url, { headers: { accept: 'application/json' } });
  if (!antwoord.ok) throw new Error(`OpenHolidays gaf status ${antwoord.status}`);
  return antwoord.json();
}
