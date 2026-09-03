// Het trainingsuren-sjabloon inlezen: welk team op welk moment in welke zaal
// traint, per seizoen.
//
// Kernvereiste: een team dat nog niet bestaat (bijvoorbeeld een nieuwe
// categorie zoals BB4FUN, die nog niet via de bond is gesynchroniseerd) mag de
// import nooit laten mislukken. Die rij wordt gerapporteerd — zichtbaar in de
// droogloop én na uitvoeren — en overgeslagen, terwijl de andere rijen gewoon
// doorgaan. Dat is expliciet anders dan bij het personensjabloon, waar een
// onbekende id een harde fout is: hier is 'nog niet bestaan' een verwachte,
// tijdelijke toestand, geen vergissing.

function sleutel(teamGuid, weekdag, begin, einde) {
  return `${teamGuid}|${weekdag}|${begin}|${einde}`;
}

/**
 * @param {Array<object>} csvRijen          kolommen team_naam, zaal, weekdag, begin, einde, seizoen, van, tot
 * @param {Array<object>} bestaandeTeams     [{ guid, naam, seizoen }]
 * @param {Array<object>} bestaandeZalen     [{ id, naam }]
 * @param {Array<object>} bestaandeReeksen   [{ id, team_guid, team_naam, seizoen, weekdag, begin, einde, zaal_id, zaal_naam, van, tot }]
 * @param {object} seizoensgrenzen           { van, tot } — terugval wanneer een rij geen van/tot meegeeft
 */
export function maakReeksensjabloonplan(csvRijen, bestaandeTeams, bestaandeZalen, bestaandeReeksen, seizoensgrenzen) {
  const teamOpNaamEnSeizoen = new Map(
    bestaandeTeams.map((t) => [`${t.naam.trim().toLowerCase()}|${t.seizoen}`, t])
  );
  const zaalOpNaam = new Map(bestaandeZalen.map((z) => [z.naam.trim().toLowerCase(), z]));
  const reeksOpSleutel = new Map(
    bestaandeReeksen.map((r) => [sleutel(r.team_guid, r.weekdag, r.begin, r.einde), r])
  );
  const geziene = new Set();

  const rijfouten = [];
  const onbekendeTeams = [];
  const onbekendeZalen = [];
  const nieuweReeksen = [];
  const ongewijzigd = [];
  const verdwenenReeksen = [];

  csvRijen.forEach((rij, index) => {
    const regelnr = index + 2;
    const teamNaam = rij.team_naam?.trim();
    const zaalNaam = rij.zaal?.trim();
    const weekdag = Number(rij.weekdag);
    const begin = rij.begin?.trim();
    const einde = rij.einde?.trim();
    const seizoen = rij.seizoen?.trim();

    if (!teamNaam || !zaalNaam || !weekdag || !begin || !einde || !seizoen) {
      rijfouten.push({ regel: regelnr, reden: 'team_naam, zaal, weekdag, begin, einde en seizoen zijn verplicht' });
      return;
    }
    if (weekdag < 1 || weekdag > 7) {
      rijfouten.push({ regel: regelnr, reden: 'weekdag moet 1 (maandag) tot 7 (zondag) zijn' });
      return;
    }
    if (einde <= begin) {
      rijfouten.push({ regel: regelnr, reden: `${teamNaam}: einde moet na begin liggen` });
      return;
    }

    const team = teamOpNaamEnSeizoen.get(`${teamNaam.toLowerCase()}|${seizoen}`);
    if (!team) {
      // Geen fout: dit is de verwachte, tijdelijke toestand voor een team dat
      // de bond nog niet kent (bv. een recreatieve reeks als BB4FUN). De rij
      // wordt overgeslagen maar de import gaat gewoon door.
      onbekendeTeams.push({ regel: regelnr, team_naam: teamNaam });
      return;
    }

    const zaal = zaalOpNaam.get(zaalNaam.toLowerCase());
    if (!zaal) {
      onbekendeZalen.push({ regel: regelnr, zaal_naam: zaalNaam, team_naam: teamNaam });
      return;
    }

    const van = rij.van?.trim() || seizoensgrenzen.van;
    const tot = rij.tot?.trim() || seizoensgrenzen.tot;

    const sl = sleutel(team.guid, weekdag, begin, einde);
    geziene.add(sl);
    const bestaand = reeksOpSleutel.get(sl);
    if (bestaand) {
      ongewijzigd.push(bestaand);
    } else {
      nieuweReeksen.push({
        team_guid: team.guid,
        team_naam: teamNaam,
        zaal_id: zaal.id,
        zaal_naam: zaalNaam,
        weekdag,
        begin,
        einde,
        seizoen,
        van,
        tot,
      });
    }
  });

  for (const r of bestaandeReeksen) {
    const sl = sleutel(r.team_guid, r.weekdag, r.begin, r.einde);
    if (!geziene.has(sl)) verdwenenReeksen.push(r);
  }

  return {
    nieuweReeksen,
    ongewijzigd,
    verdwenenReeksen,
    onbekendeTeams,
    onbekendeZalen,
    rijfouten,
    status: rijfouten.length || onbekendeTeams.length || onbekendeZalen.length ? 'deels' : 'ok',
  };
}
