// Een trainingsreeks uitschrijven naar concrete trainingen.
//
// Zuivere functie: ze krijgt een reeks en de omstandigheden (vakanties,
// sluitingen, wat er al bestaat) en geeft een plan terug. Dat maakt de
// droogloop gratis en elke uitzondering te testen zonder databank.
//
// Wat hier bewust niet gebeurt: een training die een beheerder handmatig
// verzette, wordt nooit teruggeschreven. handmatig_gewijzigd is daarvoor het
// signaal, net als de bron-vlag bij personen.

const DAGNAMEN = ['', 'ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

function* datums(van, tot) {
  let d = new Date(`${van}T00:00:00Z`);
  const eind = new Date(`${tot}T00:00:00Z`);
  while (d <= eind) {
    yield d.toISOString().slice(0, 10);
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
}

function isoWeekdag(datumTekst) {
  // getUTCDay(): 0 = zondag. Omgezet naar 1 = maandag ... 7 = zondag, dezelfde
  // telling als de rest van de app.
  const dag = new Date(`${datumTekst}T00:00:00Z`).getUTCDay();
  return dag === 0 ? 7 : dag;
}

function valtBinnen(datumTekst, periode) {
  return datumTekst >= periode.van && datumTekst <= periode.tot;
}

/**
 * Welke periodes op deze reeks van toepassing zijn: 'iedereen' geldt altijd,
 * de rest enkel wanneer de onderwijsgroep van de ploeg overeenkomt.
 */
function periodesVoorPloeg(periodes, onderwijsgroep) {
  return periodes.filter(
    (p) => p.doelgroep === 'iedereen' || p.doelgroep === onderwijsgroep
  );
}

/**
 * @param {object} reeks             rij uit trainingsreeksen
 * @param {string} onderwijsgroep    van de ploeg, bepaalt welke examens gelden
 * @param {Array} periodes           vakanties, examens en feestdagen van het seizoen
 * @param {Array} sluitingen         zaal_sluitingen van de zaal in deze reeks
 * @param {Array} bestaandeTrainingen  rijen die al bij reeks_id horen
 * @param {boolean} zaalOpenOpFeestdagen  of de zaal van deze reeks op
 *        feestdagen open is — een eigenschap van de zaal, los van
 *        reeks.vakantie_doorlopen (dat is een keuze van het team, dit is een
 *        fysieke beperking van de locatie)
 */
export function genereerTrainingen({
  reeks,
  onderwijsgroep,
  periodes = [],
  sluitingen = [],
  bestaandeTrainingen = [],
  zaalOpenOpFeestdagen = false,
}) {
  const relevantePeriodes = periodesVoorPloeg(periodes, onderwijsgroep);
  const bestaandOpDatum = new Map(bestaandeTrainingen.map((t) => [t.datum, t]));

  const nieuw = [];
  const overgeslagenVakantie = [];
  const overgeslagenFeestdag = [];
  const overgeslagenSluiting = [];
  const ongewijzigd = [];
  const behouden = [];

  for (const datumTekst of datums(reeks.van, reeks.tot)) {
    if (isoWeekdag(datumTekst) !== reeks.weekdag) continue;

    const bestaand = bestaandOpDatum.get(datumTekst);
    if (bestaand?.handmatig_gewijzigd) {
      // Een beheerder heeft deze training zelf aangepast. Nooit overschrijven,
      // net zoals een correctie met bron 'club' bij personen blijft staan.
      behouden.push(bestaand);
      continue;
    }

    // Een feestdag wordt vóór de vakantiecontrole getoetst: het is een
    // fysieke beperking van de zaal, geen keuze van het team. Een reeks die
    // vakanties doorloopt, doorloopt daarom een feestdag niet automatisch mee
    // — dat vraagt een zaal die zelf open is op feestdagen.
    const feestdag = relevantePeriodes.find(
      (p) => p.soort === 'feestdag' && valtBinnen(datumTekst, p)
    );
    if (feestdag && !zaalOpenOpFeestdagen) {
      if (bestaand) overgeslagenFeestdag.push({ datum: datumTekst, id: bestaand.id, reden: feestdag.naam });
      continue;
    }

    const vakantie = relevantePeriodes.find(
      (p) => p.soort === 'vakantie' && valtBinnen(datumTekst, p)
    );
    if (vakantie && !reeks.vakantie_doorlopen) {
      if (bestaand) overgeslagenVakantie.push({ datum: datumTekst, id: bestaand.id, reden: vakantie.naam });
      continue;
    }

    const sluiting = sluitingen.find((s) => valtBinnen(datumTekst, s));
    if (sluiting) {
      overgeslagenSluiting.push({ datum: datumTekst, reden: sluiting.reden });
      // Een training in een gesloten zaal verdwijnt niet: de betrokkenen horen
      // te weten dat er iets mis is, niet dat er niets gepland stond.
      nieuw.push({
        datum: datumTekst,
        begin: reeks.begin,
        einde: reeks.einde,
        status: 'zaal_niet_beschikbaar',
        bestaand_id: bestaand?.id ?? null,
      });
      continue;
    }

    const rij = { datum: datumTekst, begin: reeks.begin, einde: reeks.einde, status: 'gepland' };
    if (!bestaand) {
      nieuw.push(rij);
    } else if (bestaand.begin !== reeks.begin || bestaand.einde !== reeks.einde || bestaand.status !== 'gepland') {
      nieuw.push({ ...rij, bestaand_id: bestaand.id });
    } else {
      ongewijzigd.push(bestaand);
    }
  }

  return {
    nieuw,
    ongewijzigd,
    behouden,
    overgeslagen_vakantie: overgeslagenVakantie,
    overgeslagen_feestdag: overgeslagenFeestdag,
    overgeslagen_sluiting: overgeslagenSluiting,
  };
}

export { isoWeekdag, DAGNAMEN };
