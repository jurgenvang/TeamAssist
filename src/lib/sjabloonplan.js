// Het sjabloon inlezen: wat er zou gebeuren, vóór er iets gebeurt.
//
// Zuivere functie, zoals bij ploegen, leden en wedstrijden. Ze krijgt de
// ingelezen rijen en de huidige staat mee, en geeft een plan terug dat de
// route dan uitvoert of enkel toont.
//
// Bewuste grens: dit sjabloon vult aan wat de bond niet levert voor spelers
// die al via de VBL-synchronisatie in de club staan. Het maakt geen nieuwe
// spelers aan — een rij met een onbekende of ontbrekende id is een fout, geen
// aanleiding om te raden wie ermee bedoeld wordt.

import { schoon, controleer } from './persoonwijzigen.js';

const PERSOONSVELDEN = [
  'voornaam',
  'achternaam',
  'geboortedatum',
  'tel_vast',
  'tel_gsm',
  'straat',
  'nummer',
  'bus',
  'postcode',
  'gemeente',
];

function ontledOuderadressen(tekst) {
  return String(tekst ?? '')
    .split(';')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {Array<object>} csvRijen        uit csvLezen(), met de sjabloonkoppen
 * @param {Array<object>} huidigePersonen personen van het team, met hun id en huidige velden
 * @param {Array<object>} huidigeOuders   bestaande ouder_kind-koppelingen (kind_id, ouder_id, ouder_email)
 * @param {Array<object>} alleActievePersonen  om een ouder op e-mailadres te herkennen
 */
export function maakSjabloonplan(csvRijen, huidigePersonen, huidigeOuders, alleActievePersonen) {
  const personenOpId = new Map(huidigePersonen.map((p) => [p.id, p]));
  const personenOpEmail = new Map(
    alleActievePersonen.filter((p) => p.email).map((p) => [p.email.toLowerCase(), p])
  );
  const ouderKoppelingenPerKind = new Map();
  for (const k of huidigeOuders) {
    if (!ouderKoppelingenPerKind.has(k.kind_id)) ouderKoppelingenPerKind.set(k.kind_id, new Set());
    ouderKoppelingenPerKind.get(k.kind_id).add(k.ouder_email.toLowerCase());
  }

  const rijfouten = [];
  const spelerwijzigingen = [];
  const nieuweOuderkoppelingen = [];
  const overgeslagenOuders = [];
  const gezieneIds = new Set();

  csvRijen.forEach((rij, index) => {
    const regelnr = index + 2; // rij 1 is de koptekst
    const id = rij.id?.trim();

    if (!id) {
      rijfouten.push({ regel: regelnr, reden: 'geen id — deze rij wordt overgeslagen' });
      return;
    }
    const bestaand = personenOpId.get(id);
    if (!bestaand) {
      rijfouten.push({
        regel: regelnr,
        reden: `id '${id}' hoort bij geen enkele speler van dit team — mogelijk de id-kolom aangepast?`,
      });
      return;
    }
    if (gezieneIds.has(id)) {
      rijfouten.push({ regel: regelnr, reden: `id '${id}' staat dubbel in het bestand` });
      return;
    }
    gezieneIds.add(id);

    // De speler-eigen velden, inclusief het eigen e-mailadres.
    const velden = {};
    for (const veld of PERSOONSVELDEN) {
      if (Object.hasOwn(rij, veld)) velden[veld] = schoon(rij[veld]);
    }
    if (Object.hasOwn(rij, 'email_speler')) velden.email = schoon(rij.email_speler);

    const fouten = controleer(velden);
    if (fouten.length) {
      rijfouten.push({ regel: regelnr, reden: `${bestaand.voornaam} ${bestaand.achternaam}: ${fouten.join('; ')}` });
    } else {
      const gewijzigd = Object.entries(velden).filter(
        ([veld, waarde]) => (bestaand[veld] ?? null) !== waarde
      );
      if (gewijzigd.length) {
        spelerwijzigingen.push({
          id,
          naam: `${bestaand.voornaam} ${bestaand.achternaam}`,
          velden,
          gewijzigde_velden: gewijzigd.map(([v]) => v),
        });
      }
    }

    // Ouderadressen: enkel toevoegen, nooit stilzwijgend ontkoppelen. Wie een
    // koppeling echt wil verwijderen, doet dat op het persoonsscherm zelf.
    const emails = ontledOuderadressen(rij.email_ouder);
    const bestaandeVoorKind = ouderKoppelingenPerKind.get(id) ?? new Set();
    for (const email of emails) {
      if (bestaandeVoorKind.has(email)) continue; // al gekoppeld, niets te doen
      const ouder = personenOpEmail.get(email);
      nieuweOuderkoppelingen.push({
        kind_id: id,
        kind_naam: `${bestaand.voornaam} ${bestaand.achternaam}`,
        email,
        // Bestaat er al iemand met dit adres, dan koppelen we; anders wordt
        // er een nieuwe persoon aangemaakt met enkel dat adres — de naam is
        // dan leeg tot een beheerder ze aanvult op het persoonsscherm.
        bestaande_persoon_id: ouder?.id ?? null,
        nieuwe_persoon: !ouder,
      });
    }

    // Wat er in de databank aan koppelingen staat maar niet meer in het
    // bestand voorkomt: nooit stil verwijderen, enkel signaleren.
    for (const bestaandeEmail of bestaandeVoorKind) {
      if (!emails.includes(bestaandeEmail)) {
        overgeslagenOuders.push({
          kind_id: id,
          kind_naam: `${bestaand.voornaam} ${bestaand.achternaam}`,
          email: bestaandeEmail,
        });
      }
    }
  });

  return {
    spelerwijzigingen,
    nieuweOuderkoppelingen,
    overgeslagenOuders,
    rijfouten,
    status: rijfouten.length ? 'deels' : 'ok',
  };
}
