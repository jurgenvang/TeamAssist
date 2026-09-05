// Kernregels voor aanwezigheden, los van de databank.
//
// Zuivere functies, zodat de tijdsgebonden regels (mag iemand nog opgeven?)
// getest kunnen worden zonder de systeemklok na te bootsen op elke plek waar
// ze gebruikt worden.

/**
 * Wanneer sluit het opgeven voor een activiteit: het tijdstip waarop begin
 * en datum vallen, min de termijn van de ploeg.
 */
export function opgaveSluit(activiteit, termijnUren) {
  const start = new Date(`${activiteit.datum}T${activiteit.begin}:00`);
  return new Date(start.getTime() - termijnUren * 60 * 60 * 1000);
}

/**
 * Mag er nog opgegeven worden op dit moment?
 *
 * @param {object} activiteit    { datum, begin }
 * @param {object} teamInstelling  { opgave_toegelaten, opgave_termijn_uren } — al
 *        vooraf gekozen tussen de training- en wedstrijdvarianten door de
 *        aanroeper, zodat deze functie niet hoeft te weten welk soort het is.
 * @param {Date} nu
 */
export function magNogOpgeven(activiteit, teamInstelling, nu = new Date()) {
  if (!teamInstelling.opgave_toegelaten) {
    return { mag: false, reden: 'vooraf opgeven staat uit voor deze ploeg' };
  }
  const sluit = opgaveSluit(activiteit, teamInstelling.opgave_termijn_uren);
  if (nu >= sluit) {
    return { mag: false, reden: 'de opgavetermijn is verstreken', sluit };
  }
  return { mag: true, sluit };
}

/**
 * Een opgave zetten. Weigert wat de architectuur uitsluit: iemand die is
 * uitgesloten kan zichzelf niet meer op aanwezig zetten, en de termijn geldt
 * onverbiddelijk — ook voor een beheerder die namens iemand invult.
 */
export function magOpgaveZetten({ huidigeRij, activiteit, teamInstelling, nu = new Date() }) {
  if (huidigeRij?.uitgesloten) {
    return {
      mag: false,
      reden: huidigeRij.uitgesloten_reden
        ? `je bent door de coach uitgesloten: ${huidigeRij.uitgesloten_reden}`
        : 'je bent door de coach uitgesloten',
    };
  }
  const termijn = magNogOpgeven(activiteit, teamInstelling, nu);
  if (!termijn.mag) return termijn;
  return { mag: true };
}

// Standaardtermijn: één uur, of 48 uur zodra een ploeg selecteert (8.5). Dit
// is een suggestie voor het scherm bij het aanzetten van selectie, geen
// databankregel — een beheerder kan elke waarde kiezen.
export function voorgesteldeWedstrijdtermijn(selectieAan) {
  return selectieAan ? 48 : 1;
}

/**
 * Bouwt de rij die weggeschreven wordt bij een opgave. Geen databanktoegang:
 * dat maakt de validatie hierboven en deze opbouw apart en zonder databank
 * te testen.
 */
export function bouwOpgave({ status, reden, toelichting, doorPersoonId }) {
  if (status !== 'aanwezig' && status !== 'afwezig') {
    throw new Error("status moet 'aanwezig' of 'afwezig' zijn");
  }
  if (status === 'afwezig' && !['ziek', 'gekwetst', 'ander'].includes(reden)) {
    throw new Error("bij afwezig is een reden verplicht: 'ziek', 'gekwetst' of 'ander'");
  }
  return {
    opgave_status: status,
    opgave_reden: status === 'afwezig' ? reden : null,
    opgave_toelichting: status === 'afwezig' && reden === 'ander' ? (toelichting || null) : null,
    opgave_door: doorPersoonId,
  };
}
