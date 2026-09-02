// Namen van de bond.
//
// De bond geeft één veld: `Dries van Geijstelen Forier`, `Otto Muñiz Espinoza`.
// De splitsing gebeurt op de **eerste** spatie — het eerste woord is de
// voornaam, de rest de achternaam. Op de dertien spelers van de nagekeken ploeg
// klopt dat overal, ook bij een tussenvoegsel en bij een dubbele achternaam.
// Splitsen op de láátste spatie zou daar juist misgaan.
//
// Waar het wel fout loopt: een dubbele voornaam met een spatie (`Anna Maria
// Peeters`). Een koppelteken is veilig, een spatie niet. Zulke gevallen worden
// rechtgezet via het sjabloon of het beheerscherm, en dragen daarna bron
// 'club', waarna de synchronisatie ze met rust laat.

export function splitsNaam(volledig) {
  const tekst = String(volledig ?? '').trim().replace(/\s+/g, ' ');
  if (!tekst) return { voornaam: '', achternaam: '' };

  const spatie = tekst.indexOf(' ');
  if (spatie === -1) return { voornaam: '', achternaam: tekst };

  return {
    voornaam: tekst.slice(0, spatie),
    achternaam: tekst.slice(spatie + 1),
  };
}

/**
 * Voor het vergelijken van namen bij het matchen.
 * Accenten en dubbele spaties weg, kleine letters. `De Smet` en `Desmet`
 * blijven bewust verschillend: een verkeerde samenvoeging is erger dan een
 * dubbele rij.
 */
export function normaliseerNaam(waarde) {
  return String(waarde ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
