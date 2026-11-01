// Panelen: wat het naammenu opent (zoals in YOAssist).
//
// Een scherm uit het naammenu is een paneel over de pagina heen, niet een
// sectie eronder: tot 0.40.0 hing Mijn voorkeuren onderaan het tabblad dat
// openstond, en bleef het staan als je daarna Mijn berichten opende — het
// leek alsof er niets gebeurde. Nu staat er altijd hoogstens één paneel open,
// met een × om te sluiten; Escape of een tik ernaast sluit ook.

import { el } from './hulp.js';

let open = null;
const bijSluiten = new Map();

/** Opent het paneel met dit id en sluit wat er openstond. */
export function openPaneel(id) {
  if (open && open !== id) sluitPaneel();
  const paneel = el(id);
  paneel.hidden = false;
  paneel.scrollTop = 0;
  el('paneelachtergrond').hidden = false;
  document.body.classList.add('paneel-open');
  open = id;
}

export function sluitPaneel() {
  if (!open) return;
  const id = open;
  el(id).hidden = true;
  el('paneelachtergrond').hidden = true;
  document.body.classList.remove('paneel-open');
  open = null;
  bijSluiten.get(id)?.();
}

export function paneelOpen() {
  return open;
}

/** Iets dat moet gebeuren als dit paneel sluit (bv. de lijst eronder verversen). */
export function bijSluitenVan(id, doe) {
  bijSluiten.set(id, doe);
}

/** Eén keer, bij het starten: de ×-knoppen, Escape en de achtergrond. */
export function koppelPanelen() {
  for (const knop of document.querySelectorAll('.paneel [data-sluit]')) {
    knop.addEventListener('click', sluitPaneel);
  }
  el('paneelachtergrond').addEventListener('click', sluitPaneel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') sluitPaneel();
  });
}
