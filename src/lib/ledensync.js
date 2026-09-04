// Spelers en staf van een ploeg naast de club leggen.
//
// Zuivere functie, net als bij de ploegen: ze krijgt wat de bond geeft en wat de
// club heeft, en geeft een plan terug. De droogloop is daardoor gratis.
//
// Drie dingen die hier bewust níét gebeuren:
//
//   - Er wordt nooit iemand weggehaald uit een ploeg wanneer de lijst leeg of
//     sterk geslonken is. Aan het begin van een seizoen loopt de bond weken
//     achter op de werkelijkheid; dat is de normale toestand, geen storing.
//   - Er wordt nooit automatisch samengevoegd bij twijfel. Twee personen
//     verkeerd tot één maken is niet terug te draaien.
//   - Wat de club zelf heeft ingevuld, wordt niet overschreven. Dat is de
//     bron-vlag: staat er 'club', dan blijft het staan.

import { vblDatumNaarIso } from './datum.js';
import { splitsNaam, normaliseerNaam } from './naam.js';

export const VERDWIJNGRENS = 1 / 3;

/**
 * Zoekt de persoon die bij een lid van de bond hoort.
 *
 * Volgorde: de relatie-GUID is de harde sleutel. Bestaat die nog niet in de
 * club, dan wordt er op naam en geboortedatum gezocht — maar enkel wanneer dat
 * precies één persoon oplevert. Twee kandidaten is een twijfelgeval en gaat naar
 * de beheerder.
 */
export function zoekPersoon(lid, personen) {
  if (lid.relGuid) {
    const opGuid = personen.find((p) => p.rel_guid === lid.relGuid);
    if (opGuid) return { persoon: opGuid, hoe: 'relguid' };
  }

  const naam = normaliseerNaam(lid.naam);
  const geboorte = vblDatumNaarIso(lid.sGebDat);

  // Iemand met een relatie-GUID die van een ander lid is, mag nooit gekoppeld
  // worden: dan zijn het twee verschillende leden van de bond.
  const kandidaten = personen.filter(
    (p) => !p.rel_guid && normaliseerNaam(`${p.voornaam} ${p.achternaam}`) === naam
  );

  if (geboorte) {
    const metDatum = kandidaten.filter((p) => p.geboortedatum === geboorte);
    if (metDatum.length === 1) return { persoon: metDatum[0], hoe: 'naam en geboortedatum' };
    if (metDatum.length > 1) return { twijfel: metDatum, hoe: 'meerdere met dezelfde naam' };
    // Naam gelijk maar geboortedatum niet: dat is vermoedelijk iemand anders,
    // of een verkeerd ingevulde datum. Niet raden.
    if (kandidaten.some((p) => p.geboortedatum && p.geboortedatum !== geboorte)) {
      return { twijfel: kandidaten, hoe: 'zelfde naam, andere geboortedatum' };
    }
  }

  if (kandidaten.length === 1) return { persoon: kandidaten[0], hoe: 'naam' };
  if (kandidaten.length > 1) return { twijfel: kandidaten, hoe: 'meerdere met dezelfde naam' };
  return { persoon: null, hoe: 'nieuw' };
}

/** Wat er van een lid van de bond in `personen` terechtkomt. */
export function velden(lid) {
  const { voornaam, achternaam } = splitsNaam(lid.naam);
  return {
    rel_guid: lid.relGuid ?? null,
    lid_nr: lid.lidNr ?? null,
    naam_vbl: lid.naam ?? null,
    voornaam,
    achternaam,
    geboortedatum: vblDatumNaarIso(lid.sGebDat),
    // sGebDat stond er wel maar was niet te lezen: dat hoort opgemerkt te
    // worden in plaats van stil als 'geen geboortedatum' door te gaan.
    datum_onleesbaar: Boolean(lid.sGebDat) && vblDatumNaarIso(lid.sGebDat) === null,
  };
}

function wijzigingenVoor(persoon, nieuw) {
  const uit = [];
  // De bron-vlag beslist. Heeft iemand de naam handmatig rechtgezet — een
  // dubbele voornaam met een spatie bijvoorbeeld — dan blijft die staan.
  if (persoon.naam_bron !== 'club') {
    if ((persoon.naam_vbl ?? '') !== (nieuw.naam_vbl ?? '')) uit.push('naam');
  }
  if (persoon.geboortedatum_bron !== 'club' && nieuw.geboortedatum) {
    if ((persoon.geboortedatum ?? null) !== nieuw.geboortedatum) uit.push('geboortedatum');
  }
  if (!persoon.rel_guid && nieuw.rel_guid) uit.push('relatie-GUID');
  if ((persoon.lid_nr ?? null) !== (nieuw.lid_nr ?? null) && nieuw.lid_nr) uit.push('lidnummer');
  return uit;
}

/**
 * @param {object} bron
 * @param {Array} bron.spelers   `spelers[]` uit TeamDetailByGuid
 * @param {Array} bron.staf      `tvlijst[]` uit TeamDetailByGuid
 * @param {Array} bron.personen  alle personen van de club
 * @param {Array} bron.inPloeg   rijen uit team_spelers voor deze ploeg en dit seizoen
 * @param {Array} bron.rollen    COACH-rollen op deze ploeg in dit seizoen
 */
export function maakLedenplan({ spelers = [], staf = [], personen = [], inPloeg = [], rollen = [] }) {
  const nieuw = [];
  const koppelen = [];
  const bijwerken = [];
  const ongewijzigd = [];
  const twijfel = [];
  const onleesbareDatums = [];

  const gezienePersonen = new Set();

  const verwerk = (lid, soort) => {
    const nieuweVelden = velden(lid);
    if (nieuweVelden.datum_onleesbaar) {
      onleesbareDatums.push({ naam: lid.naam, waarde: lid.sGebDat });
    }

    const gevonden = zoekPersoon(lid, personen);
    if (gevonden.twijfel) {
      twijfel.push({
        soort,
        lid: nieuweVelden,
        reden: gevonden.hoe,
        kandidaten: gevonden.twijfel.map((p) => p.id),
      });
      return;
    }

    if (!gevonden.persoon) {
      nieuw.push({ soort, ...nieuweVelden });
      return;
    }

    gezienePersonen.add(gevonden.persoon.id);
    const verschillen = wijzigingenVoor(gevonden.persoon, nieuweVelden);
    if (gevonden.hoe !== 'relguid') {
      koppelen.push({ soort, persoon_id: gevonden.persoon.id, hoe: gevonden.hoe, ...nieuweVelden });
    } else if (verschillen.length) {
      bijwerken.push({ soort, persoon_id: gevonden.persoon.id, verschillen, ...nieuweVelden });
    } else {
      ongewijzigd.push({ soort, persoon_id: gevonden.persoon.id });
    }
  };

  for (const s of spelers) verwerk(s, 'speler');
  for (const s of staf) verwerk(s, 'staf');

  // Wie in de ploeg staat maar niet meer in de lijst van de bond. Enkel spelers:
  // een coach die uit tvlijst verdwijnt, wordt apart behandeld. En enkel bron
  // 'vbl': een handmatig gekoppelde speler (bron 'club') wordt nooit
  // weggesynchroniseerd, net zoals een handmatig toegevoegde coach dat niet
  // wordt — zie rollenWeg hieronder.
  const guidsVanSpelers = new Set(spelers.map((s) => s.relGuid).filter(Boolean));
  const uitPloeg = inPloeg.filter(
    (r) => r.bron === 'vbl' && r.bij_bond !== 0 && !guidsVanSpelers.has(r.rel_guid) && !gezienePersonen.has(r.persoon_id)
  );

  const teVeelWeg =
    inPloeg.length > 0 &&
    (spelers.length === 0 || uitPloeg.length > inPloeg.length * VERDWIJNGRENS);

  // Een coach met bron 'club' is handmatig toegevoegd en wordt nooit
  // weggesynchroniseerd.
  const stafGuids = new Set(staf.map((s) => s.relGuid).filter(Boolean));
  const rollenWeg = rollen.filter(
    (r) => r.bron === 'vbl' && !stafGuids.has(r.rel_guid) && staf.length > 0
  );

  return {
    nieuw,
    koppelen,
    bijwerken,
    ongewijzigd,
    twijfel,
    onleesbare_datums: onleesbareDatums,
    uit_ploeg: teVeelWeg ? [] : uitPloeg,
    genegeerd_uit_ploeg: teVeelWeg ? uitPloeg : [],
    rollen_weg: rollenWeg,
    status: teVeelWeg || twijfel.length ? 'deels' : 'ok',
    melding: teVeelWeg
      ? `${uitPloeg.length} van ${inPloeg.length} spelers ontbraken; er is niemand ` +
        'uit de ploeg gehaald omdat de bond aan het begin van een seizoen achterloopt'
      : null,
  };
}
