// De frontend, gelezen als tekst.
//
// Er draait hier geen browser, dus dit vangt geen gedragsfouten. Wat het wel
// vangt: het weglekken van gegevens die in de HTML horen te blijven, en het
// terugsluipen van patronen die in dit project bewust vermeden worden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('er staat geen sleutel of projectadres hard in de pagina', () => {
  // Ze komen van /api/config, zodat er maar één plaats is waar ze staan.
  assert.ok(!/supabase\.co/.test(html), 'geen vast Supabase-adres in de HTML');
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(html), 'geen ingebakken JWT of sleutel');
});

test('de frontend haalt geen code van een derde partij', () => {
  // Geen buildstap betekent hier niet: nog een partij erbij. Iemand vult op dit
  // scherm zijn e-mailadres in.
  //
  // Gezocht wordt naar echte verwijzingen, niet naar het woord in een
  // commentaarregel: die eerste versie viel over haar eigen uitleg.
  assert.ok(!/<script[^>]+\ssrc\s*=/i.test(html), 'geen extern script');
  assert.ok(!/<link[^>]+href\s*=\s*["']https?:/i.test(html), 'geen externe stylesheet');
  assert.ok(!/["'(]https?:\/\//.test(html), 'geen vast adres van buitenaf');
});

test('de tokens worden uit de URL gehaald na aanmelden', () => {
  assert.ok(html.includes('history.replaceState'), 'het fragment hoort opgeruimd te worden');
});

test('toetsenbordfocus blijft zichtbaar', () => {
  assert.ok(html.includes(':focus-visible'), 'focus mag nooit onzichtbaar worden gemaakt');
});

test('de knoppen zeggen wat er gebeurt', () => {
  assert.ok(html.includes('Stuur me een link'));
  assert.ok(!/>\s*(Submit|Verzenden)\s*</.test(html));
});

test('de aanmeldlink wordt via de eigen route gevraagd', () => {
  // Rechtstreeks bij Supabase aankloppen zou iedereen laten mailen naar
  // willekeurige adressen, op ons quota. De controle op het adres zit in de
  // Worker; die is hier getest in aanmeldlink.test.mjs.
  assert.ok(html.includes("'/api/aanmeldlink'"), 'de eigen route hoort gebruikt te worden');
  assert.ok(!html.includes('/auth/v1/otp'), 'de frontend praat niet meer rechtstreeks met Auth');
});

test('een mislukte aanmeldlink wordt getoond in plaats van genegeerd', () => {
  assert.ok(html.includes('error_description'), 'de fout uit het fragment hoort gelezen te worden');
});
