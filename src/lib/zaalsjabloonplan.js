// Het zaaluren-sjabloon inlezen: wat er zou gebeuren, vóór er iets gebeurt.
//
// Zuivere functie, zelfde patroon als sjabloonplan.js voor personen. Een
// onbekende zaalnaam wordt als 'nieuwe zaal' behandeld — net als bij het
// matchen van personen op naam is een tikfout in principe niet te
// onderscheiden van een echt nieuwe zaal, dus toont de droogloop het als
// zodanig en beslist de beheerder.

function sleutel(zaalNaam, weekdag, begin, einde) {
  return `${zaalNaam.trim().toLowerCase()}|${weekdag}|${begin}|${einde}`;
}

/**
 * @param {Array<object>} csvRijen        uit csvLezen(), kolommen zaal, weekdag, begin, einde, seizoen
 * @param {Array<object>} bestaandeZalen   [{ id, naam }]
 * @param {Array<object>} bestaandeBlokken [{ id, zaal_id, zaal_naam, seizoen, weekdag, begin, einde }]
 */
export function maakZaalsjabloonplan(csvRijen, bestaandeZalen, bestaandeBlokken) {
  const zaalOpNaam = new Map(bestaandeZalen.map((z) => [z.naam.trim().toLowerCase(), z]));
  const blokOpSleutel = new Map(
    bestaandeBlokken.map((b) => [sleutel(b.zaal_naam, b.weekdag, b.begin, b.einde), b])
  );
  const geziene = new Set();

  const rijfouten = [];
  const nieuweZalen = new Set();
  const nieuweBlokken = [];
  const ongewijzigd = [];
  const verdwenenBlokken = [];

  csvRijen.forEach((rij, index) => {
    const regelnr = index + 2;
    const zaalNaam = rij.zaal?.trim();
    const weekdag = Number(rij.weekdag);
    const begin = rij.begin?.trim();
    const einde = rij.einde?.trim();
    const seizoen = rij.seizoen?.trim();

    if (!zaalNaam || !weekdag || !begin || !einde || !seizoen) {
      rijfouten.push({ regel: regelnr, reden: 'zaal, weekdag, begin, einde en seizoen zijn verplicht' });
      return;
    }
    if (weekdag < 1 || weekdag > 7) {
      rijfouten.push({ regel: regelnr, reden: 'weekdag moet 1 (maandag) tot 7 (zondag) zijn' });
      return;
    }
    if (einde <= begin) {
      rijfouten.push({ regel: regelnr, reden: `${zaalNaam}: einde moet na begin liggen` });
      return;
    }

    const zaal = zaalOpNaam.get(zaalNaam.toLowerCase());
    if (!zaal) nieuweZalen.add(zaalNaam);

    const sl = sleutel(zaalNaam, weekdag, begin, einde);
    geziene.add(sl);
    const bestaand = blokOpSleutel.get(sl);
    if (bestaand) {
      ongewijzigd.push(bestaand);
    } else {
      nieuweBlokken.push({ zaal_naam: zaalNaam, zaal_id: zaal?.id ?? null, weekdag, begin, einde, seizoen });
    }
  });

  for (const b of bestaandeBlokken) {
    const sl = sleutel(b.zaal_naam, b.weekdag, b.begin, b.einde);
    if (!geziene.has(sl)) verdwenenBlokken.push(b);
  }

  return {
    nieuweZalen: [...nieuweZalen],
    nieuweBlokken,
    ongewijzigd,
    verdwenenBlokken,
    rijfouten,
    status: rijfouten.length ? 'deels' : 'ok',
  };
}
