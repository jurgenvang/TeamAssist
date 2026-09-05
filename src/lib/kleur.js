// Kleurcontrole voor de clubaccentkleur.
//
// Een club met een geel accent levert witte tekst op een gele knop op —
// onleesbaar. Deze functie rekent het contrast uit (WCAG-relatieve luminantie)
// en weigert een kleur die te licht is om als achtergrond onder witte tekst te
// dienen. Geen bibliotheek nodig: het is een klein, stabiel stukje wiskunde.

export function geldigeHex(waarde) {
  return typeof waarde === 'string' && /^#[0-9a-fA-F]{6}$/.test(waarde.trim());
}

function relatieveLuminantie(hex) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrastverhouding tussen twee willekeurige kleuren, volgens WCAG. */
export function contrastTussen(hexA, hexB) {
  const lA = relatieveLuminantie(hexA);
  const lB = relatieveLuminantie(hexB);
  const [licht, donker] = lA >= lB ? [lA, lB] : [lB, lA];
  return (licht + 0.05) / (donker + 0.05);
}

/** Contrastverhouding tussen een kleur en wit, volgens WCAG. */
export function contrastMetWit(hex) {
  return contrastTussen(hex, '#ffffff');
}

/**
 * Welke tekstkleur — zwart of wit — leest het best op deze achtergrond?
 * Voor een felle merkkleur (zoals clubroranje) is dat niet vanzelfsprekend
 * wit: oranje leest vaak beter met zwarte tekst erop.
 */
export function kiesLeesbareTekstkleur(hex) {
  const metZwart = contrastTussen(hex, '#000000');
  const metWit = contrastTussen(hex, '#ffffff');
  return metZwart >= metWit ? '#000000' : '#ffffff';
}

// WCAG AA voor gewone tekst is 4.5; voor een knop met vetgedrukte, grote tekst
// volstaat 3. We kiezen de strengere grens, want de accentkleur wordt ook voor
// gewone lopende tekst gebruikt (links, kopjes).
const MINIMUM_CONTRAST = 4.5;

/**
 * Keurt een voorgestelde accentkleur goed of af.
 *
 * Toetst enkel tegen wit — bewust niet ook tegen een donkere achtergrond.
 * Bij het invoeren van dark mode (T6) leek dat aanvankelijk de juiste
 * aanvulling, tot bleek dat de eigen, al lang actieve clubkleur
 * (`#a4232b`) de test tegen een donkere achtergrond niet haalt (contrast
 * 2,39, ook onder de lossere grens van 3 voor niet-tekstuele elementen). Een
 * strengere validatie hier zou die kleur met terugwerkende kracht afkeuren.
 * De juiste plek om dit op te lossen is de CSS zelf: in dark mode wordt de
 * accentkleur enkel als achtergrond gebruikt (met een apart berekende
 * leesbare tekstkleur, zie kiesLeesbareTekstkleur), nooit als tekst- of
 * randkleur op de donkere paginaverbrond. Zie stijl.css,
 * [data-modus="donker"].
 *
 * Geeft { ok, contrast, reden } terug — nooit een aangepaste kleur: een
 * afgekeurde kleur wordt geweigerd, niet stilzwijgend verdonkerd, want dat zou
 * een club een andere kleur geven dan ze koos zonder het te melden.
 */
export function keurAccentkleurGoed(hex) {
  if (!geldigeHex(hex)) return { ok: false, reden: 'geen geldige hexkleur (verwacht #rrggbb)' };
  const contrast = contrastMetWit(hex);
  if (contrast < MINIMUM_CONTRAST) {
    return {
      ok: false,
      contrast,
      reden: `te weinig contrast met witte tekst (${contrast.toFixed(2)}, minimum ${MINIMUM_CONTRAST})`,
    };
  }
  return { ok: true, contrast };
}

/**
 * Keurt een kleur goed als achtergrond — de topbalk, bijvoorbeeld — waar de
 * tekstkleur niet vastligt op wit. Een felle merkkleur zoals clubroranje faalt
 * vaak de eis van keurAccentkleurGoed (te weinig contrast met wit), maar
 * leest prima met zwarte tekst erop. Deze functie kiest zelf de leesbaarste
 * tekstkleur en toetst het contrast daartegen.
 *
 * Wiskundige eigenschap, geen toeval: met "de beste van zwart of wit" haalt
 * zelfs de slechtste mogelijke kleur (het middengrijs waar zwart en wit
 * precies gelijk scoren, rond #757575) nog altijd een contrast van 4,608 —
 * net boven de grens van 4,5. Er bestaat dus geen geldige hexkleur die deze
 * controle om reden van contrast weigert; de weigering hieronder vangt enkel
 * een ongeldige of ontbrekende waarde op. Dat is een garantie, geen dode tak:
 * het betekent dat elke geldige kleur veilig als topbalkachtergrond kan
 * dienen zolang de tekstkleur automatisch meekiest.
 *
 * Geeft, net als keurAccentkleurGoed, nooit een aangepaste kleur terug — een
 * afgekeurde kleur wordt geweigerd, niet verdonkerd.
 */
export function keurAchtergrondkleurGoed(hex) {
  if (!geldigeHex(hex)) return { ok: false, reden: 'geen geldige hexkleur (verwacht #rrggbb)' };
  const tekstkleur = kiesLeesbareTekstkleur(hex);
  const contrast = contrastTussen(hex, tekstkleur);
  if (contrast < MINIMUM_CONTRAST) {
    return {
      ok: false,
      contrast,
      tekstkleur,
      reden:
        `te weinig contrast, ook met de leesbaarste tekstkleur (${tekstkleur}): ` +
        `${contrast.toFixed(2)}, minimum ${MINIMUM_CONTRAST}`,
    };
  }
  return { ok: true, contrast, tekstkleur };
}
