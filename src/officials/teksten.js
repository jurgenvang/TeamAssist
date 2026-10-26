// De berichten van de woensdagregel en de woensdaglijst (0.34.0).
//
// Overgenomen uit YOAssist (mailer.js daar), met 'YOAssist' vervangen door 'de
// app'. Zuivere functies: tekst in, tekst uit — apart te testen.

const wedRegel = (w) => `- ${w.datum} ${w.uur} ${w.thuis} - ${w.uit ?? '?'}`;

/** Aan de YO+'ers: er staan wedstrijden in de lijst die op hen wachten. */
export function tekstWoensdagregel({ wedstrijden, van, tot }) {
  const lijst = wedstrijden.map((w) => `${wedRegel(w)} (nog ${w.nogNodig} nodig)`).join('\n');
  return {
    kort: `${wedstrijden.length} wedstrijd(en) zonder scheidsrechter, ${van} tot ${tot}`,
    onderwerp: `${wedstrijden.length} wedstrijden zonder scheidsrechter dit weekend`,
    tekst:
      `Voor het weekend van ${van} tot ${tot} heeft Basketbal Vlaanderen nog geen ` +
      `twee scheidsrechters aangeduid bij:\n\n${lijst}\n\nZet je beschikbaar in de app als je kan.`,
  };
}

/** Aan de beheerders: wat de verwerking van de lijst opleverde, met elke afwijking. */
export function tekstWoensdaglijstBeheer(r) {
  const blok = (titel, items, regel = wedRegel) => (items.length ? `${titel}\n${items.map(regel).join('\n')}` : null);
  const delen = [
    `De lijst van Basketbal Vlaanderen voor ${r.van} tot ${r.tot} is verwerkt` +
      ` (${r.aantalRijen} wedstrijden in heel Vlaanderen, ${r.aantalEigen} thuiswedstrijden van de club).`,
    blok('In de aanduidingslijst gezet:', r.toegevoegd, (w) => `${wedRegel(w)} (nog ${w.nogNodig} nodig)`),
    blok('Uit de aanduidingslijst gehaald — de bond voorziet twee officials:', r.uitGehaald),
    blok(
      'Laten staan, want er is al iemand van de club op aangeduid — de bond voorziet twee officials:',
      r.blijftStaan
    ),
    blok('Volgens de bond voorzien, maar nog geen naam zichtbaar in de API:', r.afwijkingA),
    blok(
      'In de lijst van de bond, maar de API toont al een of twee scheidsrechters:',
      r.afwijkingB,
      (w) => `${wedRegel(w)} (API: ${w.api}, bond: ${w.bond})`
    ),
    blok('Eigen ploeg in de lijst, maar geen wedstrijd op die dag en dat uur gevonden:', r.nietGekoppeld),
    blok(
      'Gekoppeld, maar de reeks verschilt — even nakijken:',
      r.reeksAfwijking,
      (x) => `- ${x.datum} ${x.uur} ${x.thuis}: lijst '${x.lijst}', app '${x.app}'`
    ),
    r.regioInLijst > 0 ? `Regio: ${r.regioInLijst} wedstrijd(en) bij gevolgde clubs staan in de lijst.` : null,
    blok(
      'Regio: ploeg van een gevolgde club in de lijst, maar geen wedstrijd op die dag en dat uur gevonden:',
      r.regioNietGekoppeld ?? []
    ),
  ].filter(Boolean);

  return {
    kort: `${r.toegevoegd.length} toegevoegd, ${r.afwijkingA.length + r.afwijkingB.length} afwijking(en)`,
    onderwerp: `Woensdaglijst verwerkt: ${r.toegevoegd.length} wedstrijd(en) in de lijst gezet`,
    tekst: `Hallo,\n\n${delen.join('\n\n')}`,
  };
}

export function tekstLijstNietBinnen({ van, tot }) {
  return {
    kort: `De lijst voor ${van} tot ${tot} is nog niet binnen`,
    onderwerp: 'Woensdaglijst van Basketbal Vlaanderen nog niet binnen',
    tekst:
      `Hallo,\n\nHet is woensdag 14 uur en de lijst van Basketbal Vlaanderen met de ` +
      `wedstrijden zonder officials (${van} tot ${tot}) is nog niet binnen. ` +
      'De woensdagregel is dus nog niet uitgevoerd.\n\n' +
      'Komt de mail vóór 20 uur, dan wordt ze meteen verwerkt. Anders valt de app om 20 uur ' +
      'terug op de API van Basketbal Vlaanderen.',
  };
}

export function tekstTerugval({ van, tot, gescoopt }) {
  return {
    kort: `Terugval op de API: ${gescoopt} wedstrijd(en) in de lijst gezet`,
    onderwerp: 'Woensdaglijst niet ontvangen: woensdagregel uitgevoerd met de API',
    tekst:
      `Hallo,\n\nDe lijst van Basketbal Vlaanderen voor ${van} tot ${tot} is om 20 uur nog ` +
      `niet binnen. De woensdagregel is daarom uitgevoerd met de API: ${gescoopt} ` +
      'wedstrijd(en) in de aanduidingslijst gezet.\n\n' +
      'Let op: de API loopt soms achter op wat de bond werkelijk aanduidde. Komt de lijst ' +
      'later toch nog, dan wordt ze alsnog verwerkt en zet ze de aanduidingslijst recht.',
  };
}

export function tekstLijstFout({ reden, onderwerp }) {
  return {
    kort: `Woensdaglijst niet verwerkt: ${reden}`.slice(0, 200),
    onderwerp: 'Woensdaglijst van Basketbal Vlaanderen kon niet verwerkt worden',
    tekst:
      `Hallo,\n\nEr kwam een mail binnen die op de woensdaglijst lijkt ` +
      `("${onderwerp}"), maar ze kon niet verwerkt worden:\n\n${reden}\n\n` +
      'Misschien heeft de bond de vorm van de mail of van het Excel-bestand gewijzigd. ' +
      'Om 20 uur valt de app terug op de API als er dan nog geen bruikbare lijst is.',
  };
}

export function tekstAvondcontrole({ wedstrijden }) {
  const lijst = wedstrijden.map((w) => `- ${w.omschrijving}`).join('\n');
  return {
    kort: `${wedstrijden.length} wedstrijd(en) hebben nu twee scheidsrechters van de bond`,
    onderwerp: `${wedstrijden.length} wedstrijd(en) hebben nu een VBL-scheidsrechter`,
    tekst:
      `Basketbal Vlaanderen heeft intussen twee scheidsrechters aangeduid bij:\n\n${lijst}\n\n` +
      'Ze staan nog in de aanduidingslijst. Bekijk of ze eruit moeten.',
  };
}
