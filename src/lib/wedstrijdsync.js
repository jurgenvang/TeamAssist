// Wedstrijden van de bond naast de club leggen.
//
// Zuivere functie, zoals bij de ploegen en de leden. Het bijzondere hier is de
// wijzigingshash: die dekt wat een official of een ouder moet weten (datum,
// uur, locatie, tegenstander) en bewust niet de uitslag — die komt vanzelf
// binnen en is geen wijziging die iemand moet worden gemeld.

import { vblDatumNaarIso, vblTijdNaarUur } from './datum.js';

export const VERDWIJNGRENS = 1 / 3;

// De twee vensters waarin de bond de kalender toch herschikt: het begin van
// een nieuw seizoen en de wissel naar de tweede ronde. Wijzigingen daarbinnen
// worden niet gemeld — dat zou de betrokkenen platspammen met iets dat de bond
// hoe dan ook doet. Dit zijn de standaardwaarden; de route laat ze instellen.
export const STANDAARD_STILLE_PERIODES = [
  { van_dag: '06-01', tot_dag: '08-15' },
  { van_dag: '12-28', tot_dag: '01-03' },
];

/** Valt een datum (jjjj-mm-dd) binnen een van de stille periodes? */
export function inStillePeriode(datumIso, periodes = STANDAARD_STILLE_PERIODES) {
  const dag = datumIso.slice(5); // 'mm-dd'
  return periodes.some((p) =>
    p.van_dag <= p.tot_dag
      ? dag >= p.van_dag && dag <= p.tot_dag
      : dag >= p.van_dag || dag <= p.tot_dag // periode die de jaargrens overspant
  );
}

/**
 * Hash over wat een official of ouder moet weten. De uitslag zit er bewust
 * niet in: die verandert een wedstrijd niet in iets dat gemeld moet worden.
 */
export function wijzigingshash(w) {
  const stukken = [w.datum ?? '', w.begin ?? '', w.locatie_tekst ?? '', w.tegenstander ?? '', w.thuis ? '1' : '0'];
  // Geen crypto nodig voor een vergelijkingssleutel; een simpele join volstaat
  // en blijft leesbaar in het logboek.
  return stukken.join('|');
}

function verwerkVblRij(ruw) {
  const datum = vblDatumNaarIso(ruw.datum_ruw);
  const begin = vblTijdNaarUur(ruw.begin_ruw);
  const rij = {
    wedstrijd_guid: ruw.wedstrijd_guid,
    datum,
    begin,
    thuis: ruw.thuis,
    tegenstander: ruw.tegenstander,
    locatie_tekst: ruw.locatie_tekst,
    vbl_acc_guid: ruw.vbl_acc_guid,
    uitslag: ruw.gespeeld ? ruw.uitslag : null,
  };
  return { ...rij, hash: wijzigingshash(rij), onleesbaar: Boolean(ruw.datum_ruw) && !datum };
}

/**
 * @param {Array} gevonden       ruwe rijen uit leesWedstrijden()
 * @param {Array} bestaand       rijen uit de tabel wedstrijden voor deze ploeg
 * @param {Array} periodes       stille periodes; standaard STANDAARD_STILLE_PERIODES
 */
export function maakWedstrijdplan(gevonden, bestaand, periodes = STANDAARD_STILLE_PERIODES) {
  const bestaandOpGuid = new Map(bestaand.map((r) => [r.wedstrijd_guid, r]));
  const gevondenGuids = new Set(gevonden.map((w) => w.wedstrijd_guid));

  const nieuw = [];
  const gewijzigd = [];
  const ongewijzigd = [];
  const uitslagBijgewerkt = [];
  const onleesbareDatums = [];

  for (const ruw of gevonden) {
    const w = verwerkVblRij(ruw);
    if (w.onleesbaar) onleesbareDatums.push({ guid: w.wedstrijd_guid, waarde: ruw.datum_ruw });

    const oud = bestaandOpGuid.get(w.wedstrijd_guid);
    if (!oud) {
      nieuw.push(w);
      continue;
    }

    if (oud.wijzigingshash === w.hash) {
      if ((oud.uitslag ?? null) !== (w.uitslag ?? null)) {
        // De uitslag verandert de hash niet, maar moet wel bijgewerkt worden.
        uitslagBijgewerkt.push(w);
      } else {
        ongewijzigd.push(w);
      }
      continue;
    }

    const meldbaar = w.datum ? !inStillePeriode(w.datum, periodes) : true;
    gewijzigd.push({ ...w, was: oud, meldbaar });
  }

  const verdwenen = bestaand.filter((r) => !gevondenGuids.has(r.wedstrijd_guid) && r.bij_bond !== 0);
  const teVeelWeg =
    bestaand.length > 0 &&
    (gevonden.length === 0 || verdwenen.length > bestaand.length * VERDWIJNGRENS);

  return {
    nieuw,
    gewijzigd,
    ongewijzigd,
    uitslag_bijgewerkt: uitslagBijgewerkt,
    verdwenen: teVeelWeg ? [] : verdwenen,
    genegeerd_verdwenen: teVeelWeg ? verdwenen : [],
    onleesbare_datums: onleesbareDatums,
    status: teVeelWeg ? 'deels' : 'ok',
    melding: teVeelWeg
      ? `${verdwenen.length} van ${bestaand.length} wedstrijden ontbraken; er is niets ` +
        'weggezet omdat dat eerder op een storing wijst'
      : null,
  };
}
