// Voert de taken uit die takenVoorUur() aanwijst.
//
// Dezelfde bescherming als bij de bestaande supabase-ping: elke run komt in
// taak_runs, en twee opeenvolgende mislukkingen geven een onafgehandelde
// logboekregel. Een automatische synchronisatie is bewust dezelfde functie
// als een handmatige (wedstrijdenSync, teamsSync, ledenSync, vakantiesSync,
// feestdagenSync) — geen tweede kopie van die logica, enkel een andere
// aanroeper. Dat betekent ook dat een automatische wedstrijdwijziging
// dezelfde weg naar verwittig() aflegt als een handmatige (sinds 0.18.0):
// een echt bericht vertrekt zodra bericht_modus dat toelaat, zonder dat een
// beheerder ernaar hoefde te klikken.

import { logSchrijf } from './logboek.js';
import { actiefSeizoen } from './seizoen.js';
import { teamsSync } from '../routes/admin/teams.js';
import { ledenSync } from '../routes/admin/leden.js';
import { wedstrijdenSync } from '../routes/admin/wedstrijden.js';
import { vakantiesSync, feestdagenSync } from '../routes/admin/periodes.js';
import { kuisLogboekOp, kuisTaakRunsOp, kuisBerichtenOp, verwijderInactievePersonenOp } from './opkuis.js';

// wie = null: het systeem, niet een aangemelde persoon (schema.sql, logboek.wie).
const SYSTEEM_PERSOON = { id: null };

function verzoek() {
  return new Request('https://systeem/taak?uitvoeren=1', { method: 'POST' });
}

/**
 * Een enkele reden om een 400 niet als mislukking te behandelen: nog geen
 * enkele gevolgde ploeg. Dat is voor een verse installatie een normale
 * beginstand, geen storing — twee keer na elkaar 'niets gevolgd' hoeft
 * niemand te alarmeren.
 */
function isLegeUitgangspositie(status, body) {
  return status === 400 && typeof body?.fout === 'string' && body.fout.includes('gevolgde ploeg');
}

/**
 * wedstrijdenSync vangt een mislukking per ploeg intern op (zodat één
 * ploeg met een probleem de andere niet blokkeert) en geeft toch status 200
 * terug, met de mislukte ploeg gemarkeerd in het antwoord zelf
 * (`ploegen: [{ status: 'fout', ... }]`). Enkel op HTTP-status controleren
 * zou zo'n mislukking dus nooit opmerken.
 */
function heeftMislukteploeg(body) {
  return Array.isArray(body?.ploegen) && body.ploegen.some((p) => p?.status === 'fout');
}

async function voerTaakUit(db, taaknaam, fn) {
  let uitslag;
  try {
    const res = await fn();
    const body = await res.json().catch(() => null);
    if (res.status === 200 && !heeftMislukteploeg(body)) {
      uitslag = { ok: true, melding: JSON.stringify(body ?? {}).slice(0, 500) };
    } else if (isLegeUitgangspositie(res.status, body)) {
      uitslag = { ok: true, melding: 'niets gevolgd, niets te doen' };
    } else if (res.status === 200) {
      const mislukt = body.ploegen.filter((p) => p.status === 'fout');
      uitslag = { ok: false, melding: `${mislukt.length} ploeg(en) mislukt: ${mislukt.map((p) => p.melding).join('; ')}` };
    } else {
      uitslag = { ok: false, melding: `status ${res.status}: ${body?.fout ?? ''}` };
    }
  } catch (e) {
    uitslag = { ok: false, melding: String(e?.message || e) };
  }

  return registreerUitslag(db, taaknaam, uitslag);
}

/**
 * Voor de opkuisfuncties (opkuis.js): geen Response-object, gewoon een
 * functie die het aantal geraakte rijen teruggeeft. Zelfde registratie als
 * hierboven, andere vorm van aanroep.
 */
async function voerOpkuisFunctieUit(db, taaknaam, fn) {
  let uitslag;
  try {
    const aantal = await fn(db);
    uitslag = { ok: true, melding: `${aantal} rij(en)` };
  } catch (e) {
    uitslag = { ok: false, melding: String(e?.message || e) };
  }
  return registreerUitslag(db, taaknaam, uitslag);
}

async function registreerUitslag(db, taaknaam, uitslag) {
  await db
    .prepare(`INSERT INTO taak_runs (taak, geeindigd, status, melding) VALUES (?, datetime('now'), ?, ?)`)
    .bind(taaknaam, uitslag.ok ? 'ok' : 'fout', uitslag.melding)
    .run();

  if (!uitslag.ok) {
    const vorige = await db
      .prepare(`SELECT status FROM taak_runs WHERE taak = ? ORDER BY id DESC LIMIT 2`)
      .bind(taaknaam)
      .all();
    const rijen = vorige.results ?? [];
    const tweeKeerFout = rijen.length >= 2 && rijen.every((r) => r.status === 'fout');

    await logSchrijf(db, {
      soort: 'taak',
      wat: tweeKeerFout ? `${taaknaam} twee keer na elkaar mislukt` : `${taaknaam} mislukt`,
      details: uitslag.melding,
      afgehandeld: tweeKeerFout ? 0 : 1,
    });
  }

  return uitslag;
}

/**
 * @param {string[]} taken   uit takenVoorUur() — 'wedstrijden', 'teams', 'leden', 'periodes', 'opkuis'
 *                           ('ping' zit hier bewust niet in, dat blijft voerPingUit())
 */
export async function voerGeplandeTakenUit(taken, db, env) {
  if (!taken.length) return;

  // Opruiming hangt niet af van een actief seizoen — dit loopt ook door
  // vóór een club haar eerste seizoen heeft ingesteld.
  if (taken.includes('opkuis')) {
    await voerOpkuisFunctieUit(db, 'opkuis-logboek', kuisLogboekOp);
    await voerOpkuisFunctieUit(db, 'opkuis-taak_runs', kuisTaakRunsOp);
    await voerOpkuisFunctieUit(db, 'opkuis-berichten', kuisBerichtenOp);
    await voerOpkuisFunctieUit(db, 'opkuis-personen', verwijderInactievePersonenOp);
  }

  const overige = taken.filter((t) => t !== 'opkuis');
  if (!overige.length) return;

  const seizoen = await actiefSeizoen(db);
  if (!seizoen) return; // geen actief seizoen: nog niets om te synchroniseren

  const ctx = { db, env, persoon: SYSTEEM_PERSOON, seizoen, request: verzoek() };

  for (const taak of overige) {
    if (taak === 'wedstrijden') await voerTaakUit(db, 'wedstrijden-sync', () => wedstrijdenSync(ctx));
    if (taak === 'teams') await voerTaakUit(db, 'teams-sync', () => teamsSync(ctx));
    if (taak === 'leden') await voerTaakUit(db, 'leden-sync', () => ledenSync(ctx));
    if (taak === 'periodes') {
      await voerTaakUit(db, 'vakanties-sync', () => vakantiesSync(ctx));
      await voerTaakUit(db, 'feestdagen-sync', () => feestdagenSync(ctx));
    }
  }
}
