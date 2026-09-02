// Client voor de API van Basketbal Vlaanderen.
//
// Ongedocumenteerd en zonder authenticatie. De veldnamen zijn afgeleid uit
// echte antwoorden; wat er niet in staat, wordt niet verondersteld.
//
// Belangrijk: deze code draait in de Worker en niet in de ontwikkelomgeving.
// Cloudflare kan `vblcb.wisseq.eu` gewoon bereiken, een kantoornetwerk achter
// een proxy vaak niet. Vandaar dat het uitzoeken van de velden via een
// beheerdersroute gebeurt en niet via een script op een laptop.

export const VBL_BASIS = 'https://vblcb.wisseq.eu/VBLCB_WebService/data';

/**
 * Bouwt de URL voor de ploegdetails.
 *
 * De GUID bevat twee spaties (`BVBL1125J16  2`). Die moeten als `%20%20` over
 * de lijn; een `+` wordt door deze server niet als spatie gelezen, en dat is
 * precies de reden waarom een GUID soms een lege of generieke fout opleverde.
 */
export function teamDetailUrl(guid, basis = VBL_BASIS) {
  return `${basis}/TeamDetailByGuid?teamguid=${encodeURIComponent(guid)}`;
}

export function orgDetailUrl(clubGuid, basis = VBL_BASIS) {
  return `${basis}/OrgDetailByGuid?issguid=${encodeURIComponent(clubGuid)}`;
}

export async function haalVbl(url, fetcher = fetch) {
  const antwoord = await fetcher(url, { headers: { accept: 'application/json' } });
  if (!antwoord.ok) throw new Error(`VBL gaf status ${antwoord.status}`);
  const tekst = await antwoord.text();
  if (!tekst.trim()) throw new Error('VBL gaf een leeg antwoord');
  try {
    return JSON.parse(tekst);
  } catch {
    // Wisseq antwoordt bij een ongeldige GUID met een WCF-foutpagina in XML.
    // Dat is bijna altijd een verkeerde of verouderde GUID, geen storing.
    throw new Error(`VBL gaf geen JSON terug (${tekst.slice(0, 120)})`);
  }
}

/**
 * Zoekt ploeg-GUID's in een antwoord zonder op een vaste structuur te rekenen.
 *
 * De veldnamen van OrgDetailByGuid staan nergens beschreven, dus wordt er
 * gezocht op de vorm van de waarde: de club-GUID gevolgd door een categoriecode.
 * Zo blijft dit werken als de bond de structuur ooit wijzigt.
 */
export function zoekPloegGuids(data, clubGuid) {
  const gevonden = new Set();
  const loop = (knoop) => {
    if (Array.isArray(knoop)) return knoop.forEach(loop);
    if (knoop && typeof knoop === 'object') {
      for (const [sleutel, waarde] of Object.entries(knoop)) {
        if (
          sleutel.toLowerCase().endsWith('guid') &&
          typeof waarde === 'string' &&
          waarde.startsWith(clubGuid) &&
          waarde.length > clubGuid.length
        ) {
          gevonden.add(waarde);
        }
        loop(waarde);
      }
    }
  };
  loop(data);
  return [...gevonden].sort();
}

/**
 * Haalt de ploegen uit een clubantwoord: GUID, naam en categorie.
 *
 * Zoekt op de vorm van de GUID en niet op een vast pad, om dezelfde reden als
 * zoekPloegGuids: de structuur van OrgDetailByGuid staat nergens beschreven.
 * De naam wordt meegenomen als hij naast de GUID staat, maar is bijzaak — de
 * categorie komt uit de GUID zelf, want die is stabiel en de naam niet.
 */
export function leesPloegen(data, clubGuid) {
  const perGuid = new Map();

  const loop = (knoop) => {
    if (Array.isArray(knoop)) return knoop.forEach(loop);
    if (!knoop || typeof knoop !== 'object') return;

    for (const [sleutel, waarde] of Object.entries(knoop)) {
      if (
        sleutel.toLowerCase().endsWith('guid') &&
        typeof waarde === 'string' &&
        waarde.startsWith(clubGuid) &&
        waarde.length > clubGuid.length
      ) {
        const naam = typeof knoop.naam === 'string' ? knoop.naam.trim() : null;
        // Een latere vondst met een naam wint van een eerdere zonder: dezelfde
        // GUID komt in het antwoord soms twee keer voor, één keer kaal.
        const bestaand = perGuid.get(waarde);
        if (!bestaand || (!bestaand.naam && naam)) {
          perGuid.set(waarde, { guid: waarde, naam });
        }
      }
      loop(waarde);
    }
  };

  loop(data);
  return [...perGuid.values()].sort((a, b) => a.guid.localeCompare(b.guid));
}

/** Alle sleutelpaden in een antwoord, zodat onbekende velden zichtbaar worden. */
export function sleutelpaden(data, prefix = '', uit = new Set()) {
  if (Array.isArray(data)) {
    for (const item of data) sleutelpaden(item, prefix, uit);
    return [...uit].sort();
  }
  if (data && typeof data === 'object') {
    for (const [sleutel, waarde] of Object.entries(data)) {
      const pad = prefix ? `${prefix}.${sleutel}` : sleutel;
      uit.add(pad);
      sleutelpaden(waarde, pad, uit);
    }
  }
  return [...uit].sort();
}

function tel(waarden) {
  const uit = {};
  for (const w of waarden) {
    const sleutel = w === null || w === undefined ? '(leeg)' : String(w);
    uit[sleutel] = (uit[sleutel] ?? 0) + 1;
  }
  return uit;
}

/**
 * Vat een ploegantwoord samen zonder namen.
 *
 * Bedoeld om de openstaande vragen te beantwoorden — het formaat van sGebDat,
 * de waarden van ma, de codes in tvCaC — zonder daarvoor een ledenlijst van
 * minderjarigen door een scherm te halen.
 */
export function vatPloegSamen(data) {
  const records = Array.isArray(data) ? data : [data];
  const spelers = [];
  const staf = [];
  for (const record of records) {
    if (Array.isArray(record?.spelers)) spelers.push(...record.spelers);
    if (Array.isArray(record?.tvlijst)) staf.push(...record.tvlijst);
  }

  return {
    sleutelpaden: sleutelpaden(data),
    spelers: {
      aantal: spelers.length,
      ma: tel(spelers.map((s) => s.ma)),
      gebdat_voorbeelden: spelers.map((s) => s.sGebDat).filter(Boolean).slice(0, 5),
      aansldat_voorbeelden: spelers.map((s) => s.sAanslDat).filter(Boolean).slice(0, 3),
      met_relguid: spelers.filter((s) => s.relGuid).length,
      met_lidnr: spelers.filter((s) => s.lidNr).length,
    },
    staf: {
      aantal: staf.length,
      tvCaC: tel(staf.map((s) => s.tvCaC)),
      // tvNr is geen volgnummer maar een samengestelde sleutel die het
      // lidnummer bevat (51125J162_601903). Tellen levert dus enkel eenlingen
      // op; een paar voorbeelden zeggen meer.
      tvNr_voorbeelden: staf.map((s) => s.tvNr).filter(Boolean).slice(0, 3),
    },
  };
}
