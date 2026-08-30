// De rechtenlaag.
//
// Eén plaats waar bepaald wordt wat iemand mag. Geen enkele route mag zelf
// naar een rol kijken — `if (rol === 'COACH')` verspreid door de codebasis is
// precies hoe rechtenfouten ontstaan die niemand meer overziet.
//
// De functie is zuiver: ze krijgt rijen mee en geeft een antwoord terug. Alles
// wat met de databank praat, staat in rechten-db.js. Zo is elke combinatie van
// rollen te testen zonder databank.
//
// Rollen zijn geen niveaus maar verzamelingen: wie meerdere rollen heeft,
// krijgt de vereniging van de rechten, nooit de doorsnede.

// Alle rechten die de applicatie kent. Een route vraagt er precies één.
export const RECHTEN = [
  'systeem.beheren',
  'personen.beheren',
  'persoonsgegevens.bekijken',
  'financieel.bekijken',
  'team.bekijken',
  'team.spelers.namen',
  'team.spelers.bekijken',
  'team.configureren',
  'team.aanwezigheid.bekijken',
  'team.aanwezigheid.vaststellen',
  'team.selectie.beheren',
  'speler.uitsluiten',
  'aanwezigheid.opgeven.eigen',
  'aanwezigheid.opgeven.kind',
];

// Rechten die clubbreed gelden, los van een ploeg.
const ADMIN_RECHTEN = [
  'systeem.beheren',
  'personen.beheren',
  'persoonsgegevens.bekijken',
  'financieel.bekijken',
  'team.bekijken',
  'team.spelers.namen',
  'team.spelers.bekijken',
  'team.configureren',
  'team.aanwezigheid.bekijken',
  'team.aanwezigheid.vaststellen',
  'team.selectie.beheren',
  'speler.uitsluiten',
];

// Wat een coach mag, mag een coördinator ook: beiden staan aan het hoofd van de
// ploegwerking. Het onderscheid zit in het bereik, niet in de rechten.
const BEGELEIDING_RECHTEN = [
  'team.bekijken',
  'team.spelers.namen',
  'team.spelers.bekijken',
  'team.configureren',
  'team.aanwezigheid.bekijken',
  'team.aanwezigheid.vaststellen',
  'team.selectie.beheren',
  'speler.uitsluiten',
];

export const ROLRECHTEN = {
  // Clubbreed
  ADMIN: { bereik: 'globaal', rechten: ADMIN_RECHTEN },
  FINADM: { bereik: 'globaal', rechten: ['financieel.bekijken'] },

  // Per ploeg
  COORD: { bereik: 'team', rechten: BEGELEIDING_RECHTEN },
  COACH: { bereik: 'team', rechten: BEGELEIDING_RECHTEN },
  // Een ploegverantwoordelijke configureert mee, maar stelt geen aanwezigheden
  // vast en sluit niemand uit: dat zijn beslissingen over de ploegwerking.
  PLOEGV: {
    bereik: 'team',
    rechten: [
      'team.bekijken',
      'team.spelers.namen',
      'team.spelers.bekijken',
      'team.configureren',
      'team.aanwezigheid.bekijken',
    ],
  },

  // Afgeleide rollen. SPELER volgt uit team_spelers, OUVO uit ouder_kind; ze
  // staan niet in de rollen-tabel omdat twee bronnen van waarheid uit elkaar
  // lopen.
  SPELER: {
    bereik: 'team',
    rechten: ['team.bekijken', 'team.spelers.namen', 'aanwezigheid.opgeven.eigen'],
  },
  OUVO: {
    bereik: 'team',
    rechten: ['team.bekijken', 'team.spelers.namen', 'aanwezigheid.opgeven.kind'],
  },
};

/**
 * Bouwt het rechtenoverzicht van één persoon voor één seizoen.
 *
 * @param {object} bron
 * @param {Array<{rol: string, team_guid: string|null}>} bron.rollen
 *        Toegekende rollen: ADMIN, FINADM, COORD, COACH, PLOEGV.
 * @param {string[]} bron.ploegenAlsSpeler  ploeg-GUID's waar hij zelf speelt
 * @param {string[]} bron.ploegenViaKind    ploeg-GUID's waar een kind van hem speelt
 */
export function bouwRechten({ rollen = [], ploegenAlsSpeler = [], ploegenViaKind = [] } = {}) {
  const globaal = new Set();
  // recht -> Set van ploeg-GUID's
  const perTeam = new Map();
  const rolnamen = new Set();
  const teams = new Set();

  function geefTeamRecht(recht, teamGuid) {
    if (!perTeam.has(recht)) perTeam.set(recht, new Set());
    perTeam.get(recht).add(teamGuid);
    teams.add(teamGuid);
  }

  function ken(rol, teamGuid) {
    const definitie = ROLRECHTEN[rol];
    // Een onbekende rol geeft geen rechten. Stil negeren is hier juist: een rol
    // die uit een oudere versie in de databank staat, mag nooit per ongeluk
    // meer opleveren dan bedoeld.
    if (!definitie) return;
    rolnamen.add(rol);
    for (const recht of definitie.rechten) {
      if (definitie.bereik === 'globaal') globaal.add(recht);
      else if (teamGuid) geefTeamRecht(recht, teamGuid);
    }
  }

  for (const rij of rollen) ken(rij.rol, rij.team_guid);
  for (const guid of ploegenAlsSpeler) ken('SPELER', guid);
  for (const guid of ploegenViaKind) ken('OUVO', guid);

  return {
    /**
     * Mag deze persoon dit recht uitoefenen, en zo ja op deze ploeg?
     *
     * Een ploegrecht zonder ploeg opvragen levert altijd false op. Dat is
     * opzettelijk: een route die vergeet welke ploeg ze bedoelt, hoort te
     * weigeren en niet toevallig te slagen.
     */
    mag(recht, teamGuid = null) {
      if (globaal.has(recht)) return true;
      if (!teamGuid) return false;
      const ploegen = perTeam.get(recht);
      return Boolean(ploegen && ploegen.has(teamGuid));
    },

    /** Op welke ploegen mag dit recht uitgeoefend worden? */
    ploegenMet(recht) {
      if (globaal.has(recht)) return '*';
      return [...(perTeam.get(recht) ?? [])].sort();
    },

    heeftRol(rol) {
      return rolnamen.has(rol);
    },

    get rollen() {
      return [...rolnamen].sort();
    },

    get teams() {
      return [...teams].sort();
    },

    /** Alles in één object, voor het scherm en voor foutmeldingen. */
    overzicht() {
      const uit = {};
      for (const recht of RECHTEN) {
        const ploegen = this.ploegenMet(recht);
        if (ploegen === '*' || ploegen.length) uit[recht] = ploegen;
      }
      return uit;
    },
  };
}
