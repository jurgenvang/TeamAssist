// Een nieuw VAPID-sleutelpaar voor pushmeldingen.
//
//   node tools/maak-vapid.mjs
//
// Eén keer uitvoeren bij de installatie. De twee waarden horen als secret bij
// de Worker, niet in wrangler.toml (dat wordt bij elke deploy overschreven):
//
//   npx wrangler secret put VAPID_PUBLIEK
//   npx wrangler secret put VAPID_PRIVE
//   npx wrangler secret put VAPID_CONTACT   (een mailadres, bv. beheer@clubassist.org)
//
// Een nieuw paar maken maakt elk bestaand abonnement ongeldig: de toestellen
// schreven zich in met de oude publieke sleutel. Dus enkel opnieuw doen als de
// private sleutel uitgelekt is.

import { maakVapidSleutels } from '../src/lib/push.js';

const { publiek, prive } = await maakVapidSleutels();
console.log(`VAPID_PUBLIEK = ${publiek}`);
console.log(`VAPID_PRIVE   = ${prive}`);
