// Het plan voor het trainingsuren-sjabloon.
//
// Het zwaartepunt: een onbekend team is nooit een fatale fout — dat is de
// verwachte, tijdelijke toestand voor een team dat de bond nog niet kent —
// maar wordt wel zichtbaar gerapporteerd, en de rest van het bestand gaat
// gewoon door.

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakReeksensjabloonplan } from '../src/lib/reeksensjabloonplan.js';

const GRENZEN = { van: '2026-08-01', tot: '2027-06-30' };

const rij = (over = {}) => ({
  team_naam: 'U14 A',
  zaal: 'Sportoase Heverlee',
  weekdag: '1',
  begin: '18:00',
  einde: '19:15',
  seizoen: '2026-27',
  van: '',
  tot: '',
  ...over,
});

const team = (over = {}) => ({ guid: 'T1', naam: 'U14 A', seizoen: '2026-27', ...over });
const zaal = (over = {}) => ({ id: 'z1', naam: 'Sportoase Heverlee', ...over });

test('een gekend team en een gekende zaal geven een nieuwe reeks', () => {
  const plan = maakReeksensjabloonplan([rij()], [team()], [zaal()], [], GRENZEN);
  assert.equal(plan.nieuweReeksen.length, 1);
  assert.equal(plan.nieuweReeksen[0].team_guid, 'T1');
  assert.equal(plan.status, 'ok');
});

test('een onbekend team laat de import niet mislukken, maar wordt gerapporteerd', () => {
  const plan = maakReeksensjabloonplan([rij({ team_naam: 'BB4FUN +14' })], [team()], [zaal()], [], GRENZEN);
  assert.equal(plan.nieuweReeksen.length, 0);
  assert.equal(plan.onbekendeTeams.length, 1);
  assert.equal(plan.onbekendeTeams[0].team_naam, 'BB4FUN +14');
  assert.notEqual(plan.status, undefined, 'er is een status, geen crash');
});

test('een onbekend team in één rij blokkeert de andere rijen niet', () => {
  const rijen = [rij({ team_naam: 'BB4FUN +14' }), rij({ team_naam: 'U14 A', weekdag: '2' })];
  const plan = maakReeksensjabloonplan(rijen, [team()], [zaal()], [], GRENZEN);
  assert.equal(plan.nieuweReeksen.length, 1);
  assert.equal(plan.onbekendeTeams.length, 1);
});

test('een onbekende zaal wordt apart gerapporteerd van een onbekend team', () => {
  const plan = maakReeksensjabloonplan([rij({ zaal: 'Onbestaande Zaal' })], [team()], [zaal()], [], GRENZEN);
  assert.equal(plan.onbekendeZalen.length, 1);
  assert.equal(plan.onbekendeZalen[0].zaal_naam, 'Onbestaande Zaal');
});

test('zonder van/tot in de rij vallen de seizoensgrenzen terug als standaard', () => {
  const plan = maakReeksensjabloonplan([rij()], [team()], [zaal()], [], GRENZEN);
  assert.equal(plan.nieuweReeksen[0].van, '2026-08-01');
  assert.equal(plan.nieuweReeksen[0].tot, '2027-06-30');
});

test('een eigen van/tot in de rij overschrijft de seizoensgrenzen', () => {
  const plan = maakReeksensjabloonplan([rij({ van: '2026-09-15', tot: '2027-04-30' })], [team()], [zaal()], [], GRENZEN);
  assert.equal(plan.nieuweReeksen[0].van, '2026-09-15');
  assert.equal(plan.nieuweReeksen[0].tot, '2027-04-30');
});

test('drie teams op hetzelfde tijdslot in dezelfde zaal geven drie aparte reeksen', () => {
  // Precies het geval van parallelle terreinen: dezelfde zaal, dezelfde
  // weekdag en hetzelfde uur, maar een ander team per rij.
  const teams = [team({ guid: 'T1', naam: 'U14 B' }), team({ guid: 'T2', naam: 'U14 C' }), team({ guid: 'T3', naam: 'U14 D' })];
  const rijen = [
    rij({ team_naam: 'U14 B' }),
    rij({ team_naam: 'U14 C' }),
    rij({ team_naam: 'U14 D' }),
  ];
  const plan = maakReeksensjabloonplan(rijen, teams, [zaal()], [], GRENZEN);
  assert.equal(plan.nieuweReeksen.length, 3);
  assert.deepEqual(plan.nieuweReeksen.map((r) => r.team_guid).sort(), ['T1', 'T2', 'T3']);
});

test('een reeks die niet meer in het bestand staat, wordt gesignaleerd, nooit stil verwijderd', () => {
  const bestaandeReeksen = [
    { id: 1, team_guid: 'T2', team_naam: 'Ander team', seizoen: '2026-27', weekdag: 3, begin: '18:00', einde: '19:00', zaal_id: 'z1', zaal_naam: 'Sportoase Heverlee', van: '2026-08-01', tot: '2027-06-30' },
  ];
  const plan = maakReeksensjabloonplan([rij()], [team()], [zaal()], bestaandeReeksen, GRENZEN);
  assert.equal(plan.verdwenenReeksen.length, 1);
  assert.ok(!('verwijderdeReeksen' in plan));
});

test('team matching gebeurt per seizoen: dezelfde naam in een ander seizoen matcht niet', () => {
  const plan = maakReeksensjabloonplan(
    [rij({ seizoen: '2027-28' })],
    [team({ seizoen: '2026-27' })],
    [zaal()],
    [],
    GRENZEN
  );
  assert.equal(plan.onbekendeTeams.length, 1, 'het team bestaat wel, maar niet in dat seizoen');
});

test('hoofdlettergebruik in team- of zaalnaam maakt voor het matchen niet uit', () => {
  const plan = maakReeksensjabloonplan([rij({ team_naam: 'u14 a', zaal: 'SPORTOASE HEVERLEE' })], [team()], [zaal()], [], GRENZEN);
  assert.equal(plan.onbekendeTeams.length, 0);
  assert.equal(plan.onbekendeZalen.length, 0);
});

test('status is deels zodra er onbekende teams zijn, ook zonder harde rijfouten', () => {
  const plan = maakReeksensjabloonplan([rij({ team_naam: 'Onbekend' })], [team()], [zaal()], [], GRENZEN);
  assert.equal(plan.status, 'deels');
});

// --- Matchen op de verkorte naam (naam_kort), zoals de bond ze niet levert ---

test('team_naam in het sjabloon matcht op naam_kort, niet op de volledige VBL-naam', () => {
  // Precies het echte scenario: de bond levert 'AB InBev Leuven Bears G12 A',
  // de club spreekt intern over 'U12 A', en dat laatste staat in het sjabloon.
  const teamMetVolledigeNaam = {
    guid: 'T1', naam: 'AB InBev Leuven Bears G12 A', naam_kort: 'U12 A', seizoen: '2026-27',
  };
  const plan = maakReeksensjabloonplan(
    [rij({ team_naam: 'U12 A' })],
    [teamMetVolledigeNaam],
    [zaal()],
    [],
    GRENZEN
  );
  assert.equal(plan.onbekendeTeams.length, 0);
  assert.equal(plan.nieuweReeksen[0].team_guid, 'T1');
});

test('de volledige VBL-naam werkt nog steeds als terugval', () => {
  const teamMetVolledigeNaam = {
    guid: 'T1', naam: 'AB InBev Leuven Bears G12 A', naam_kort: 'U12 A', seizoen: '2026-27',
  };
  const plan = maakReeksensjabloonplan(
    [rij({ team_naam: 'AB InBev Leuven Bears G12 A' })],
    [teamMetVolledigeNaam],
    [zaal()],
    [],
    GRENZEN
  );
  assert.equal(plan.onbekendeTeams.length, 0);
  assert.equal(plan.nieuweReeksen[0].team_guid, 'T1');
});

test('een team zonder naam_kort matcht enkel op de volledige naam', () => {
  const teamZonderKorteNaam = { guid: 'T1', naam: 'U14 A', naam_kort: null, seizoen: '2026-27' };
  const plan = maakReeksensjabloonplan([rij({ team_naam: 'U14 A' })], [teamZonderKorteNaam], [zaal()], [], GRENZEN);
  assert.equal(plan.onbekendeTeams.length, 0);
});

test('hoofdlettergebruik maakt ook bij naam_kort niet uit', () => {
  const team = { guid: 'T1', naam: 'AB InBev Leuven Bears G12 A', naam_kort: 'U12 A', seizoen: '2026-27' };
  const plan = maakReeksensjabloonplan([rij({ team_naam: 'u12 a' })], [team], [zaal()], [], GRENZEN);
  assert.equal(plan.onbekendeTeams.length, 0);
});

// --- Spaties die kunnen ontbreken bij het overtypen of kopiëren -----------

test('een ontbrekende spatie in het sjabloon (U21A) matcht nog op naam_kort (U21 A)', () => {
  const team = { guid: 'T1', naam: 'AB InBev Leuven Bears J21 A', naam_kort: 'U21 A', seizoen: '2026-27' };
  const plan = maakReeksensjabloonplan([rij({ team_naam: 'U21A' })], [team], [zaal()], [], GRENZEN);
  assert.equal(plan.onbekendeTeams.length, 0);
  assert.equal(plan.nieuweReeksen.length, 1);
});

test('een overtollige spatie in het sjabloon matcht ook, in beide richtingen', () => {
  const team = { guid: 'T1', naam: 'AB InBev Leuven Bears J21 A', naam_kort: 'U21A', seizoen: '2026-27' };
  const plan = maakReeksensjabloonplan([rij({ team_naam: 'U21   A' })], [team], [zaal()], [], GRENZEN);
  assert.equal(plan.onbekendeTeams.length, 0);
});

test('spatietolerantie geldt ook voor de volledige naam als terugval', () => {
  const team = { guid: 'T1', naam: 'AB InBev LeuvenBears J21 A', naam_kort: null, seizoen: '2026-27' };
  const plan = maakReeksensjabloonplan(
    [rij({ team_naam: 'AB InBev Leuven Bears J21A' })],
    [team],
    [zaal()],
    [],
    GRENZEN
  );
  assert.equal(plan.onbekendeTeams.length, 0);
});
