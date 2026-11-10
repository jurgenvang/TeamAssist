// Mijn voorkeuren: dark mode, het communicatiekanaal en de tabbladen.
//
// Een voorkeur van de persoon zelf, geen beheerdersactie — elke aangemelde
// persoon mag zijn eigen rij aanpassen, zonder enig bijzonder recht. Dat is
// bewust anders dan persoon.js, waar enkel personen.beheren iemands gegevens
// mag wijzigen: hier wijzigt iemand nooit iemand anders dan zichzelf, de
// persoon komt uit ctx.persoon (het geverifieerde token), nooit uit de
// request body.

import { json, fout } from '../lib/http.js';
import { keurVerborgenGoed, leesVerborgen } from '../lib/tabbladen.js';

const GELDIGE_MODUS = ['systeem', 'licht', 'donker'];
const GELDIG_KANAAL = ['mail', 'push', 'beide'];

export async function voorkeurenBewaren(ctx) {
  const { db, persoon, request } = ctx;
  const body = await request.json().catch(() => null);
  const { donkere_modus, kanaal_voorkeur, verborgen_tabs } = body ?? {};

  if (donkere_modus !== undefined && !GELDIGE_MODUS.includes(donkere_modus)) {
    return fout(400, `donkere_modus moet een van ${GELDIGE_MODUS.join(', ')} zijn`);
  }
  if (kanaal_voorkeur !== undefined && !GELDIG_KANAAL.includes(kanaal_voorkeur)) {
    return fout(400, `kanaal_voorkeur moet een van ${GELDIG_KANAAL.join(', ')} zijn`);
  }
  const verborgen = verborgen_tabs === undefined ? undefined : keurVerborgenGoed(verborgen_tabs);
  if (verborgen === null) return fout(400, 'verborgen_tabs moet een lijst van tabbladen zijn');
  if (donkere_modus === undefined && kanaal_voorkeur === undefined && verborgen === undefined) {
    return fout(400, 'niets om te bewaren');
  }

  const nieuweModus = donkere_modus ?? persoon.donkere_modus;
  const nieuwKanaal = kanaal_voorkeur ?? persoon.kanaal_voorkeur;

  // Niet meegegeven: de tabbladen blijven zoals ze waren (ook NULL, de standaard).
  const nieuwVerborgen = verborgen === undefined ? persoon.verborgen_tabs ?? null : JSON.stringify(verborgen);

  await db
    .prepare(`UPDATE personen SET donkere_modus = ?, kanaal_voorkeur = ?, verborgen_tabs = ?, gewijzigd = datetime('now') WHERE id = ?`)
    .bind(nieuweModus, nieuwKanaal, nieuwVerborgen, persoon.id)
    .run();

  return json({ donkere_modus: nieuweModus, kanaal_voorkeur: nieuwKanaal, verborgen_tabs: leesVerborgen(nieuwVerborgen) });
}
