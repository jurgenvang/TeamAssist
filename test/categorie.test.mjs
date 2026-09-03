// Categorieën van ploegen: GUID-ontleding, onderwijsgroep, en de verkorte
// interne naam.
//
// Dit bestand had tot nu toe geen enkel testbestand, ondanks dat het centrale
// logica bevat die overal in de app gebruikt wordt. Deze testfile dekt het
// geheel, niet enkel de nieuwe naamverkorting.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ontleedPloegGuid, onderwijsgroepVoor, isBekendeCategorie,
  verkortCategorie, verkorteTeamnaam, BEKENDE_CATEGORIEEN,
} from '../src/lib/categorie.js';

const CLUB = 'BVBL1125';

test('ontleedPloegGuid haalt categorie en volgnummer uit een geldige GUID', () => {
  const uit = ontleedPloegGuid('BVBL1125J16  2', CLUB);
  assert.equal(uit.categorie, 'J16');
  assert.equal(uit.volgnummer, 2);
});

test('ontleedPloegGuid geeft null bij een GUID van een andere club', () => {
  assert.equal(ontleedPloegGuid('BVBL9999J16  2', CLUB), null);
});

test('ontleedPloegGuid geeft null bij een onverwachte vorm', () => {
  assert.equal(ontleedPloegGuid('BVBL1125J16', CLUB), null);
  assert.equal(ontleedPloegGuid('BVBL1125J16-2', CLUB), null);
  assert.equal(ontleedPloegGuid('', CLUB), null);
  assert.equal(ontleedPloegGuid(null, CLUB), null);
});

test('onderwijsgroepVoor kent elke bekende categorie een groep toe', () => {
  assert.equal(onderwijsgroepVoor('G10'), 'geen');
  assert.equal(onderwijsgroepVoor('J16'), 'secundair');
  assert.equal(onderwijsgroepVoor('J21'), 'hoger');
  assert.equal(onderwijsgroepVoor('HSE'), 'hoger');
});

test('onderwijsgroepVoor geeft geen terug bij een onbekende categorie', () => {
  // Bewust de voorzichtige kant: geen examenperiode toepassen op een ploeg
  // waarvan we het niet weten, in plaats van trainingen te schrappen die wel
  // doorgingen.
  assert.equal(onderwijsgroepVoor('ONBEKEND'), 'geen');
  assert.equal(onderwijsgroepVoor(null), 'geen');
});

test('isBekendeCategorie klopt voor elke categorie in de lijst', () => {
  for (const c of BEKENDE_CATEGORIEEN) assert.equal(isBekendeCategorie(c), true);
  assert.equal(isBekendeCategorie('BB4FUN'), false);
  assert.equal(isBekendeCategorie(null), false);
});

// --- verkortCategorie --------------------------------------------------

test('G en J worden U, met het cijfer ongewijzigd', () => {
  assert.equal(verkortCategorie('G10'), 'U10');
  assert.equal(verkortCategorie('G12'), 'U12');
  assert.equal(verkortCategorie('J16'), 'U16');
  assert.equal(verkortCategorie('J18'), 'U18');
  assert.equal(verkortCategorie('J21'), 'U21');
});

test('M blijft M', () => {
  assert.equal(verkortCategorie('M12'), 'M12');
  assert.equal(verkortCategorie('M14'), 'M14');
  assert.equal(verkortCategorie('M16'), 'M16');
  assert.equal(verkortCategorie('M19'), 'M19');
});

test('een code zonder cijfers blijft ongewijzigd', () => {
  assert.equal(verkortCategorie('HSE'), 'HSE');
  assert.equal(verkortCategorie('DSE'), 'DSE');
});

test('een onverwachte vorm komt ongewijzigd terug, niet foutief omgezet', () => {
  assert.equal(verkortCategorie(null), null);
  assert.equal(verkortCategorie(''), '');
  assert.equal(verkortCategorie('12G'), '12G');
});

// --- verkorteTeamnaam ----------------------------------------------------

const CLUBNAAM = 'AB InBev Leuven Bears';

test('de clubnaam en de oorspronkelijke categorie vallen weg, de letter blijft', () => {
  assert.equal(verkorteTeamnaam('AB InBev Leuven Bears G12 A', 'G12', CLUBNAAM), 'U12 A');
  assert.equal(verkorteTeamnaam('AB InBev Leuven Bears J16 B', 'J16', CLUBNAAM), 'U16 B');
});

test('M-categorieën houden hun letter in de verkorte naam', () => {
  assert.equal(verkorteTeamnaam('AB InBev Leuven Bears M19 A', 'M19', CLUBNAAM), 'M19 A');
});

test('HSE/DSE blijven ongewijzigd, enkel de clubnaam valt weg', () => {
  assert.equal(verkorteTeamnaam('AB InBev Leuven Bears HSE B', 'HSE', CLUBNAAM), 'HSE B');
  assert.equal(verkorteTeamnaam('AB InBev Leuven Bears DSE A', 'DSE', CLUBNAAM), 'DSE A');
});

test('hoofdlettergebruik in de volledige naam maakt voor het knippen niet uit', () => {
  assert.equal(verkorteTeamnaam('ab inbev leuven bears g12 a', 'G12', CLUBNAAM), 'U12 a');
});

test('een naam die niet met de clubnaam begint, komt ongewijzigd terug', () => {
  // Liever de volledige naam tonen dan een fout stuk eraf knippen.
  const vreemd = 'Een heel andere ploegnaam G12 A';
  assert.equal(verkorteTeamnaam(vreemd, 'G12', CLUBNAAM), vreemd);
});

test('een naam waar de categorie niet op de verwachte plek staat, komt ongewijzigd terug', () => {
  const vreemd = 'AB InBev Leuven Bears iets vreemds A';
  assert.equal(verkorteTeamnaam(vreemd, 'G12', CLUBNAAM), vreemd);
});

test('geen clubnaam meegeven slaat enkel het knippen van de clubnaam over', () => {
  assert.equal(verkorteTeamnaam('G12 A', 'G12', null), 'U12 A');
});

test('een lege rest na de categorie geeft enkel de verkorte categorie terug', () => {
  assert.equal(verkorteTeamnaam('AB InBev Leuven Bears G12', 'G12', CLUBNAAM), 'U12');
});
