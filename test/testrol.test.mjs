// De testrol.
//
// De belangrijkste eigenschap: de schakelaar kan enkel wegnemen. Zou hij ook
// kunnen toevoegen, dan bestaat er in de rechtenlaag een pad waarlangs iemand
// meer krijgt dan hem is toegekend — met gegevens van minderjarigen erachter.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bouwRechten, beperkTot, magTestrolGebruiken, RECHTEN } from '../src/lib/rechten.js';
import { INSTELBAAR } from '../src/routes/admin/instellingen.js';

const J16 = 'BVBL1125J16  2';
const G12 = 'BVBL1125G12  1';

const admin = bouwRechten({ rollen: [{ rol: 'ADMIN', team_guid: null }] });
const coachJ16 = bouwRechten({ rollen: [{ rol: 'COACH', team_guid: J16 }] });

test('een beheerder die als coach kijkt, verliest zijn beheerrechten', () => {
  const r = beperkTot(admin, 'COACH', J16);
  assert.equal(r.mag('systeem.beheren'), false);
  assert.equal(r.mag('personen.beheren'), false);
  assert.equal(r.mag('team.aanwezigheid.vaststellen', J16), true);
});

test('een gekozen ploegrol geldt enkel op de gekozen ploeg', () => {
  const r = beperkTot(admin, 'COACH', J16);
  assert.equal(r.mag('team.configureren', J16), true);
  assert.equal(r.mag('team.configureren', G12), false);
});

test('de schakelaar kan nooit iets toevoegen', () => {
  // Een coach die ADMIN nabootst, blijft coach. Dit is de kern van het geheel.
  const r = beperkTot(coachJ16, 'ADMIN', null);
  for (const recht of RECHTEN) {
    assert.equal(
      r.mag(recht, J16),
      coachJ16.mag(recht, J16) && r.mag(recht, J16),
      `${recht} zou nooit meer mogen opleveren dan de echte rol`
    );
  }
  assert.equal(r.mag('systeem.beheren'), false);
  assert.equal(r.mag('personen.beheren'), false);
});

test('geen enkel recht wordt breder dan de echte rol, voor elke combinatie', () => {
  for (const rol of ['ADMIN', 'FINADM', 'COORD', 'COACH', 'PLOEGV', 'SPELER', 'OUVO']) {
    const r = beperkTot(coachJ16, rol, J16);
    for (const recht of RECHTEN) {
      for (const team of [J16, G12, null]) {
        if (r.mag(recht, team)) {
          assert.ok(coachJ16.mag(recht, team), `${rol}/${recht}/${team} verbreedde de rechten`);
        }
      }
    }
  }
});

test('een beheerder die als speler kijkt, kan geen aanwezigheid opgeven', () => {
  // Gevolg van de doorsnede, en bewust zo: een beheerder vult niets in namens
  // een ander. Wat er met dat recht gebeurt zodra de aanwezigheden bestaan,
  // staat in de backlog.
  const r = beperkTot(admin, 'SPELER', J16);
  assert.equal(r.mag('aanwezigheid.opgeven.eigen', J16), false);
  assert.equal(r.mag('team.bekijken', J16), true, 'het scherm hoort hij wel te zien');
});

test('een onbekende rol levert niets op', () => {
  const r = beperkTot(admin, 'SUPERADMIN', J16);
  for (const recht of RECHTEN) assert.equal(r.mag(recht, J16), false);
});

test('een ploegrol zonder ploeg levert niets op', () => {
  const r = beperkTot(admin, 'COACH', null);
  assert.equal(r.mag('team.configureren', J16), false);
  assert.equal(r.mag('team.bekijken', J16), false);
});

test('de gekozen rol is af te lezen, zodat het scherm het kan tonen', () => {
  // Zonder zichtbare stand vergeet je dat je versmald kijkt en meld je een fout
  // die er niet is.
  const r = beperkTot(admin, 'PLOEGV', J16);
  assert.deepEqual(r.testrol, { rol: 'PLOEGV', team: J16 });
  assert.deepEqual(r.rollen, ['PLOEGV']);
});

test('ploegenMet blijft binnen wat de echte persoon mag', () => {
  const r = beperkTot(coachJ16, 'ADMIN', null);
  assert.deepEqual(r.ploegenMet('team.bekijken'), [J16]);
});

test('de instelling staat standaard uit', () => {
  assert.equal(INSTELBAAR.testrol_toegelaten.soort, 'vlag');
});

test('de berichtmodus kent enkel drie standen', () => {
  assert.deepEqual(INSTELBAAR.bericht_modus.keuzes, ['uit', 'omleiden', 'normaal']);
});

// --- Wie mag de schakelaar gebruiken -----------------------------------------

test('enkel een beheerder mag met een andere rol kijken', () => {
  // De kop meesturen als coach levert niets op: de schakelaar is er voor wie
  // het systeem beheert, en voor niemand anders.
  assert.equal(magTestrolGebruiken(admin, '1', 'COACH'), true);
  assert.equal(magTestrolGebruiken(coachJ16, '1', 'ADMIN'), false);
  assert.equal(magTestrolGebruiken(bouwRechten(), '1', 'ADMIN'), false);
});

test('een FINADM is geen beheerder', () => {
  const finadm = bouwRechten({ rollen: [{ rol: 'FINADM', team_guid: null }] });
  assert.equal(magTestrolGebruiken(finadm, '1', 'ADMIN'), false);
});

test('zonder de instelling gebeurt er niets, ook niet voor een beheerder', () => {
  for (const stand of ['0', '', null, undefined, 'ja', 'true']) {
    assert.equal(magTestrolGebruiken(admin, stand, 'COACH'), false, `stand ${stand}`);
  }
  assert.equal(magTestrolGebruiken(admin, '1', 'COACH'), true);
});

test('zonder gevraagde rol gebeurt er niets', () => {
  assert.equal(magTestrolGebruiken(admin, '1', null), false);
  assert.equal(magTestrolGebruiken(admin, '1', ''), false);
});

test('het beheerrecht wordt op de echte rechten gemeten', () => {
  // Anders kon een beheerder zich tot coach versmallen en daarna niet meer
  // terug, omdat de versmalde rechten het beheerrecht niet meer bevatten.
  const alsCoach = beperkTot(admin, 'COACH', J16);
  assert.equal(magTestrolGebruiken(alsCoach, '1', 'ADMIN'), false);
  assert.equal(magTestrolGebruiken(admin, '1', 'ADMIN'), true);
});
