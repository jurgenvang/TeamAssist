// De rechtenlaag.
//
// Voor elke rol en elk recht staat hier zowel het bewijs dat het mag als het
// bewijs dat het niet mag. Een rechtenfout weegt hier zwaarder dan elders: het
// gaat om gegevens van minderjarigen.
//
// De verwachte matrix staat opzettelijk voluit in deze test en wordt niet uit
// de broncode geïmporteerd. Anders zou de test de code herhalen in plaats van
// ze te controleren, en zou elke fout in ROLRECHTEN vanzelf meeschuiven.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bouwRechten, RECHTEN } from '../src/lib/rechten.js';

const TEAM = 'BVBL1125J16  2';
const ANDER_TEAM = 'BVBL1125G12  1';

// Wat elke rol hoort te mogen. Alles wat hier niet staat, hoort geweigerd te
// worden.
const VERWACHT = {
  ADMIN: [
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
  ],
  FINADM: ['financieel.bekijken'],
  COORD: [
    'team.bekijken',
    'team.spelers.namen',
    'team.spelers.bekijken',
    'team.configureren',
    'team.aanwezigheid.bekijken',
    'team.aanwezigheid.vaststellen',
    'team.selectie.beheren',
    'speler.uitsluiten',
  ],
  COACH: [
    'team.bekijken',
    'team.spelers.namen',
    'team.spelers.bekijken',
    'team.configureren',
    'team.aanwezigheid.bekijken',
    'team.aanwezigheid.vaststellen',
    'team.selectie.beheren',
    'speler.uitsluiten',
  ],
  PLOEGV: [
    'team.bekijken',
    'team.spelers.namen',
    'team.spelers.bekijken',
    'team.configureren',
    'team.aanwezigheid.bekijken',
  ],
  SPELER: ['team.bekijken', 'team.spelers.namen', 'aanwezigheid.opgeven.eigen'],
  OUVO: ['team.bekijken', 'team.spelers.namen', 'aanwezigheid.opgeven.kind'],
};

const GLOBALE_ROLLEN = ['ADMIN', 'FINADM'];

function metRol(rol) {
  if (GLOBALE_ROLLEN.includes(rol)) {
    return bouwRechten({ rollen: [{ rol, team_guid: null }] });
  }
  if (rol === 'SPELER') return bouwRechten({ ploegenAlsSpeler: [TEAM] });
  if (rol === 'OUVO') return bouwRechten({ ploegenViaKind: [TEAM] });
  return bouwRechten({ rollen: [{ rol, team_guid: TEAM }] });
}

for (const [rol, toegestaan] of Object.entries(VERWACHT)) {
  test(`${rol} krijgt precies de bedoelde rechten`, () => {
    const r = metRol(rol);
    for (const recht of RECHTEN) {
      const hoortTeMogen = toegestaan.includes(recht);
      assert.equal(
        r.mag(recht, TEAM),
        hoortTeMogen,
        `${rol} en ${recht}: verwacht ${hoortTeMogen}`
      );
    }
  });
}

test('een ploegrol geldt niet op een andere ploeg', () => {
  const coach = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: TEAM }] });
  assert.equal(coach.mag('team.aanwezigheid.vaststellen', TEAM), true);
  assert.equal(coach.mag('team.aanwezigheid.vaststellen', ANDER_TEAM), false);
  assert.equal(coach.mag('team.configureren', ANDER_TEAM), false);
});

test('een ploegrecht zonder ploeg opvragen levert nooit toegang op', () => {
  const coach = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: TEAM }] });
  assert.equal(coach.mag('team.configureren'), false);
  assert.equal(coach.mag('team.configureren', null), false);
  assert.equal(coach.mag('team.configureren', ''), false);
});

test('een clubbreed recht geldt ook zonder ploeg', () => {
  const admin = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] });
  assert.equal(admin.mag('systeem.beheren'), true);
  assert.equal(admin.mag('team.configureren', ANDER_TEAM), true);
});

test('wie geen enkele rol heeft, mag niets', () => {
  const niemand = bouwRechten();
  for (const recht of RECHTEN) {
    assert.equal(niemand.mag(recht, TEAM), false, `${recht} zou geweigerd moeten worden`);
    assert.equal(niemand.mag(recht), false);
  }
});

test('meerdere rollen geven de vereniging van de rechten, niet de doorsnede', () => {
  const beide = bouwRechten({
    rollen: [
      { rol: 'PLOEGV', team_guid: TEAM },
      { rol: 'COACH', team_guid: ANDER_TEAM },
    ],
  });
  // PLOEGV mag niet vaststellen, COACH wel — elk op zijn eigen ploeg.
  assert.equal(beide.mag('team.aanwezigheid.vaststellen', TEAM), false);
  assert.equal(beide.mag('team.aanwezigheid.vaststellen', ANDER_TEAM), true);
  assert.equal(beide.mag('team.configureren', TEAM), true);
  assert.equal(beide.mag('team.configureren', ANDER_TEAM), true);
});

test('een beheerder die zelf speelt, houdt zijn eigen opgaverecht', () => {
  const r = bouwRechten({
    rollen: [{ rol: 'ADMIN', team_guid: null }],
    ploegenAlsSpeler: [TEAM],
  });
  assert.equal(r.mag('aanwezigheid.opgeven.eigen', TEAM), true);
  assert.equal(r.mag('aanwezigheid.opgeven.eigen', ANDER_TEAM), false);
});

test('een beheerder geeft geen aanwezigheid op in naam van een ander', () => {
  const admin = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] });
  assert.equal(admin.mag('aanwezigheid.opgeven.eigen', TEAM), false);
  assert.equal(admin.mag('aanwezigheid.opgeven.kind', TEAM), false);
});

test('een ouder met kinderen in twee ploegen krijgt beide ploegen', () => {
  const ouder = bouwRechten({ ploegenViaKind: [TEAM, ANDER_TEAM] });
  assert.equal(ouder.mag('aanwezigheid.opgeven.kind', TEAM), true);
  assert.equal(ouder.mag('aanwezigheid.opgeven.kind', ANDER_TEAM), true);
  assert.deepEqual(ouder.teams, [ANDER_TEAM, TEAM].sort());
});

test('een ouder ziet de aanwezigheden van de ploeg niet', () => {
  const ouder = bouwRechten({ ploegenViaKind: [TEAM] });
  assert.equal(ouder.mag('team.aanwezigheid.bekijken', TEAM), false);
  assert.equal(ouder.mag('team.spelers.bekijken', TEAM), false);
});

test('een speler ziet de aanwezigheden van de ploeg niet', () => {
  const speler = bouwRechten({ ploegenAlsSpeler: [TEAM] });
  assert.equal(speler.mag('team.aanwezigheid.bekijken', TEAM), false);
  assert.equal(speler.mag('team.spelers.bekijken', TEAM), false);
  assert.equal(speler.mag('team.spelers.namen', TEAM), true);
});

test('een onbekende rol levert geen enkel recht op', () => {
  const r = bouwRechten({ rollen: [{ rol: 'SUPERADMIN', team_guid: TEAM }] });
  for (const recht of RECHTEN) assert.equal(r.mag(recht, TEAM), false);
  assert.deepEqual(r.rollen, []);
});

test('een ploegrol zonder ploeg levert niets op', () => {
  // Zou niet in de databank mogen staan — de CHECK verhindert het — maar als het
  // er ooit toch in belandt, mag het geen clubbreed recht worden.
  const r = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: null }] });
  assert.equal(r.mag('team.configureren', TEAM), false);
  assert.equal(r.mag('team.configureren'), false);
});

test('ploegenMet geeft een ster bij een clubbreed recht en anders de ploegen', () => {
  const admin = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] });
  assert.equal(admin.ploegenMet('team.bekijken'), '*');

  const coach = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: TEAM }] });
  assert.deepEqual(coach.ploegenMet('team.bekijken'), [TEAM]);
  assert.deepEqual(coach.ploegenMet('systeem.beheren'), []);
});

test('het overzicht bevat enkel rechten die iemand werkelijk heeft', () => {
  const ploegv = bouwRechten({ rollen: [{ rol: 'PLOEGV', team_guid: TEAM }] });
  const overzicht = ploegv.overzicht();
  assert.ok(!('team.aanwezigheid.vaststellen' in overzicht));
  assert.ok(!('systeem.beheren' in overzicht));
  assert.deepEqual(overzicht['team.configureren'], [TEAM]);
});
