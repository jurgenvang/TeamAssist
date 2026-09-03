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

/** Contrastverhouding tussen een kleur en wit, volgens WCAG. */
export function contrastMetWit(hex) {
  const l = relatieveLuminantie(hex);
  return (1.05) / (l + 0.05);
}

// WCAG AA voor gewone tekst is 4.5; voor een knop met vetgedrukte, grote tekst
// volstaat 3. We kiezen de strengere grens, want de accentkleur wordt ook voor
// gewone lopende tekst gebruikt (links, kopjes).
const MINIMUM_CONTRAST = 4.5;

/**
 * Keurt een voorgestelde accentkleur goed of af.
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
