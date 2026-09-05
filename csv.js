// CSV lezen en schrijven.
//
// Geen `split(',')`: dat breekt zodra een veld een komma bevat, bijvoorbeeld
// een adresveld als "Bondgenotenlaan 1, bus 2". Dit volgt RFC 4180 — velden
// met een komma, een aanhalingsteken of een regeleinde staan tussen dubbele
// aanhalingstekens, met een verdubbeld aanhalingsteken als escape.

function csvVeld(waarde) {
  const tekst = String(waarde ?? '');
  if (/[",\n\r]/.test(tekst)) {
    return `"${tekst.replace(/"/g, '""')}"`;
  }
  return tekst;
}

/**
 * @param {Array<object>} rijen
 * @param {Array<{sleutel: string, label: string}>} kolommen
 */
export function csvSchrijven(rijen, kolommen) {
  const kop = kolommen.map((k) => csvVeld(k.label)).join(',');
  const inhoud = rijen.map((rij) => kolommen.map((k) => csvVeld(rij[k.sleutel])).join(','));
  // \r\n is de RFC-standaard; Excel en Google Sheets verwachten dat om
  // accenten en het aantal kolommen correct te herkennen.
  return [kop, ...inhoud].join('\r\n') + '\r\n';
}

/**
 * Ontleedt CSV-tekst naar rijen van objecten, met de eerste rij als
 * kolomkoppen. Aanvaardt zowel \n als \r\n, en aanhalingstekens rond een veld
 * dat een komma, een aanhalingsteken of een regeleinde bevat.
 */
export function csvLezen(tekst) {
  const rijenRuw = [];
  let veld = '';
  let rij = [];
  let inAanhaling = false;
  const schoon = String(tekst ?? '').replace(/^\uFEFF/, ''); // een BOM van Excel wegwerken

  for (let i = 0; i < schoon.length; i++) {
    const c = schoon[i];

    if (inAanhaling) {
      if (c === '"') {
        if (schoon[i + 1] === '"') {
          veld += '"';
          i++;
        } else {
          inAanhaling = false;
        }
      } else {
        veld += c;
      }
      continue;
    }

    if (c === '"') {
      inAanhaling = true;
    } else if (c === ',') {
      rij.push(veld);
      veld = '';
    } else if (c === '\r') {
      // \n dat erop volgt wordt hieronder opgevangen; sla \r zelf over.
    } else if (c === '\n') {
      rij.push(veld);
      veld = '';
      rijenRuw.push(rij);
      rij = [];
    } else {
      veld += c;
    }
  }
  // Laatste rij: enkel meenemen als er werkelijk iets staat, anders levert een
  // bestand dat op een regeleinde eindigt een spookrij met lege velden op.
  if (veld !== '' || rij.length) {
    rij.push(veld);
    rijenRuw.push(rij);
  }

  if (!rijenRuw.length) return [];
  const kop = rijenRuw[0].map((k) => k.trim());
  return rijenRuw
    .slice(1)
    .filter((r) => r.some((v) => v.trim() !== '')) // volledig lege rijen overslaan
    .map((r) => Object.fromEntries(kop.map((k, idx) => [k, (r[idx] ?? '').trim()])));
}
