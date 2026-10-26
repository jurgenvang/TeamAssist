// Automatisch aanvullen: het planningsalgoritme (0.35.0, uit YOAssist
// `autotoewijzing.js`).
//
// Bewust een zuivere functie: geen databank, geen tijd, geen toeval. Dezelfde
// invoer geeft altijd dezelfde uitvoer. Dat maakt de regels testbaar én de
// droogloop betrouwbaar — wat het voorbeeld toont, is exact wat er gebeurt
// als je bevestigt.
//
// Wat de automaat optimaliseert: iedereen ongeveer evenveel wedstrijden. Bij
// gelijke stand wint wie het minst is aangeduid; blijft het gelijk, dan de id
// alfabetisch. Die laatste regel is arbitrair maar noodzakelijk: zonder vaste
// volgorde zou dezelfde invoer wisselende resultaten geven.
//
// Wat ze niet doet: bestaande aanduidingen aanraken. Wat een beheerder zette,
// blijft staan.

import { botst } from './regels.js';

/**
 * @param {object[]} o.wedstrijden  {id, datum, uur, accGuid, nodig, bezet}
 * @param {Map<number,string[]>} o.kandidaten  wedstrijd-id -> persoon-id's die 'ja' zeiden
 * @param {Map<string,number>} o.telling  persoon-id -> aanduidingen dit seizoen
 * @param {Map<string,object[]>} o.agenda  persoon-id -> wedstrijden waarop hij al staat
 */
export function plan({ wedstrijden, kandidaten, telling = new Map(), agenda = new Map() }) {
  // Kopieën: de aanroeper mag niet ongemerkt gewijzigd worden.
  const stand = new Map(telling);
  const bezetting = new Map();
  for (const [p, lijst] of agenda) bezetting.set(p, [...lijst]);

  const tekort = wedstrijden
    .map((w) => ({ ...w, open: Math.max(0, (w.nodig ?? 0) - (w.bezet ?? 0)) }))
    .filter((w) => w.open > 0);

  // Schaarste eerst. Een wedstrijd met twee kandidaten moet vóór een wedstrijd
  // met tien aan de beurt komen, anders zijn die twee al weg en blijft ze leeg.
  const volgorde = [...tekort].sort((a, b) => {
    const ka = (kandidaten.get(a.id) ?? []).length;
    const kb = (kandidaten.get(b.id) ?? []).length;
    if (ka !== kb) return ka - kb;
    if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
    if (a.uur !== b.uur) return a.uur < b.uur ? -1 : 1;
    return a.id - b.id;
  });

  const toewijzingen = [];
  const onvolledig = [];
  for (const w of volgorde) {
    const beschikbaar = kandidaten.get(w.id) ?? [];
    const gekozen = [];
    const geweigerd = new Map(); // persoon -> reden

    while (gekozen.length < w.open) {
      const bruikbaar = beschikbaar
        .filter((p) => !gekozen.includes(p))
        .filter((p) => {
          const reeds = bezetting.get(p) ?? [];
          if (reeds.some((b) => b.id === w.id)) {
            geweigerd.set(p, 'staat er al op');
            return false;
          }
          const botsing = reeds.find((b) => botst(w, b));
          if (botsing) {
            geweigerd.set(p, `botst met ${botsing.datum} ${botsing.uur}`);
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          const va = stand.get(a) ?? 0;
          const vb = stand.get(b) ?? 0;
          if (va !== vb) return va - vb;
          return a < b ? -1 : 1;
        });
      if (!bruikbaar.length) break;

      const p = bruikbaar[0];
      gekozen.push(p);
      toewijzingen.push({ id: w.id, persoon_id: p });
      stand.set(p, (stand.get(p) ?? 0) + 1);
      bezetting.set(p, [...(bezetting.get(p) ?? []), { id: w.id, datum: w.datum, uur: w.uur, accGuid: w.accGuid }]);
    }

    if (gekozen.length < w.open) {
      onvolledig.push({
        id: w.id,
        datum: w.datum,
        uur: w.uur,
        tekort: w.open - gekozen.length,
        toegewezen: gekozen.length,
        reden: !beschikbaar.length
          ? 'niemand heeft zich beschikbaar gezet'
          : geweigerd.size
            ? 'alle overige kandidaten botsen met een andere aanduiding'
            : 'te weinig beschikbare officials',
        geweigerd: [...geweigerd.entries()].map(([persoon_id, reden]) => ({ persoon_id, reden })),
      });
    }
  }

  // Verdeling na afloop, zodat een beheerder ziet of het eerlijk uitkomt.
  const verdeling = [...stand.entries()]
    .map(([persoon_id, aantal]) => ({ persoon_id, aantal }))
    .sort((a, b) => b.aantal - a.aantal || (a.persoon_id < b.persoon_id ? -1 : 1));

  return { toewijzingen, onvolledig, verdeling };
}
