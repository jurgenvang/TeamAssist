// Een persoon aanpassen, met de bron-vlag correct bijgewerkt.
//
// Zowel het detailscherm (src/routes/admin/persoon.js) als het sjabloon
// (src/routes/admin/sjabloon.js) moeten hier hetzelfde in doen: enkel wat
// werkelijk verandert, zet de bijhorende bron op 'club'. Vandaar deze functie
// op één plaats — twee kopieën van deze logica zouden vroeg of laat
// uiteenlopen.

// Wat aangepast mag worden, en welke bron-vlag daarbij hoort. Velden die de
// bond levert en die de club niet hoort te wijzigen — de relatie-GUID, het
// lidnummer, de naam zoals de bond ze geeft — staan hier bewust niet in.
export const AANPASBAAR = {
  voornaam: { bron: 'naam_bron' },
  achternaam: { bron: 'naam_bron' },
  geboortedatum: { bron: 'geboortedatum_bron' },
  email: {},
  tel_vast: {},
  tel_gsm: {},
  gsm_delen: {},
  straat: {},
  nummer: {},
  bus: {},
  postcode: {},
  gemeente: {},
};

export function schoon(waarde) {
  if (waarde === null || waarde === undefined) return null;
  const tekst = String(waarde).trim();
  return tekst === '' ? null : tekst;
}

export function controleer(velden) {
  const fouten = [];

  if (Object.hasOwn(velden, 'geboortedatum') && velden.geboortedatum !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(velden.geboortedatum)) {
      fouten.push('geboortedatum moet jjjj-mm-dd zijn');
    } else {
      const d = new Date(`${velden.geboortedatum}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || !velden.geboortedatum.endsWith(String(d.getUTCDate()).padStart(2, '0'))) {
        fouten.push('die geboortedatum bestaat niet');
      }
    }
  }

  if (Object.hasOwn(velden, 'email') && velden.email !== null) {
    if (!velden.email.includes('@') || /\s/.test(velden.email)) {
      fouten.push('dat is geen e-mailadres');
    }
  }

  if (Object.hasOwn(velden, 'gsm_delen') && !['begeleiding', 'team'].includes(velden.gsm_delen)) {
    fouten.push("gsm_delen moet 'begeleiding' of 'team' zijn");
  }

  if (Object.hasOwn(velden, 'achternaam') && velden.achternaam === null) {
    fouten.push('een achternaam is verplicht');
  }

  return fouten;
}

/**
 * Berekent welke velden werkelijk veranderen ten opzichte van wat er staat,
 * en welke bron-vlaggen daarbij op 'club' moeten. Doet zelf niets aan de
 * databank — dat maakt deze functie zonder databank te testen, en laat de
 * aanroeper beslissen wat er met een droogloop gebeurt.
 *
 * @param {object} bestaand   de huidige rij uit personen
 * @param {object} velden     enkel de sleutels uit AANPASBAAR die aangeboden worden
 */
export function berekenWijziging(bestaand, velden) {
  const gewijzigd = Object.entries(velden).filter(
    ([veld, waarde]) => (bestaand[veld] ?? null) !== waarde
  );
  const bronnen = new Set();
  for (const [veld] of gewijzigd) {
    const bron = AANPASBAAR[veld]?.bron;
    if (bron) bronnen.add(bron);
  }
  return { gewijzigd, bronnen: [...bronnen] };
}

/**
 * Voert de wijziging effectief door. Enkel wat werkelijk verandert, komt in
 * de UPDATE terecht — een aanroeper die alle velden aanbiedt zonder dat ze
 * veranderen, zou anders elke bron-vlag op 'club' zetten en de synchronisatie
 * voor die persoon voorgoed uitschakelen.
 */
export async function pasPersoonAan(db, id, velden) {
  const bestaand = await db.prepare(`SELECT * FROM personen WHERE id = ?`).bind(id).first();
  if (!bestaand) return { fout: 'bestaat niet' };

  const fouten = controleer(velden);
  if (fouten.length) return { fout: fouten.join('; ') };

  const { gewijzigd, bronnen } = berekenWijziging(bestaand, velden);
  if (!gewijzigd.length) return { gewijzigd: [] };

  const stukken = gewijzigd.map(([veld]) => `${veld} = ?`);
  const waarden = gewijzigd.map(([, waarde]) => waarde);
  for (const bron of bronnen) stukken.push(`${bron} = 'club'`);
  stukken.push(`gewijzigd = datetime('now')`);

  try {
    await db
      .prepare(`UPDATE personen SET ${stukken.join(', ')} WHERE id = ?`)
      .bind(...waarden, id)
      .run();
  } catch (e) {
    if (String(e.message).toLowerCase().includes('unique')) {
      return { fout: 'dat e-mailadres staat al bij iemand anders' };
    }
    throw e;
  }

  return { gewijzigd: gewijzigd.map(([veld]) => veld), bronnen };
}
