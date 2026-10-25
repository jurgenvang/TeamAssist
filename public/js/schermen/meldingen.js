// Meldingen op dit toestel, in Mijn voorkeuren (0.29.0, uit YOAssist).
//
// De bron van waarheid is het abonnement van dít toestel
// (pushManager.getSubscription()), niet de voorkeur in de databank. Die zegt
// enkel wat iemand wil; of het op dit toestel ooit gelukt is, weet enkel de
// browser. In YOAssist liepen die twee ooit uiteen: een schakelaar op 'aan'
// zonder abonnement, en geen manier om het alsnog in te stellen.

import { api, config } from '../api.js';
import { el, toon } from '../hulp.js';

function pushMogelijk() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function opIphone() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function alsApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

async function abonnementVanDitToestel() {
  if (!pushMogelijk()) return null;
  try {
    const registratie = await navigator.serviceWorker.getRegistration('/sw.js');
    return registratie ? await registratie.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

/** base64url naar de bytes die pushManager.subscribe verwacht. */
export function sleutelNaarBytes(b64url) {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function alsB64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function knoppen({ aan = false, uit = false }) {
  el('meldingenaan').hidden = !aan;
  el('meldingenuit').hidden = !uit;
  el('meldingentest').hidden = !uit;
}

export async function toonMeldingenstatus() {
  el('meldingenmelding').hidden = true;
  el('meldingeniphone').hidden = true;
  const status = el('meldingenstatus');

  if (!pushMogelijk()) {
    knoppen({});
    if (opIphone() && !alsApp()) {
      status.textContent = 'Op een iPhone kan dat enkel als TeamAssist op je beginscherm staat.';
      el('meldingeniphone').hidden = false;
    } else {
      status.textContent = 'Deze browser kan geen meldingen ontvangen. Je krijgt alles per mail.';
    }
    return;
  }
  if (!config?.vapid_publiek) {
    knoppen({});
    status.textContent = 'Meldingen zijn op deze installatie nog niet ingesteld. Je krijgt alles per mail.';
    return;
  }
  if (Notification.permission === 'denied') {
    knoppen({});
    status.textContent =
      'Je hebt meldingen voor deze site geblokkeerd. Zet ze terug aan in de instellingen van je browser, en kom dan hier terug.';
    return;
  }
  const abonnement = await abonnementVanDitToestel();
  status.textContent = abonnement
    ? 'Meldingen staan aan op dit toestel.'
    : 'Meldingen staan uit op dit toestel.';
  knoppen(abonnement ? { uit: true } : { aan: true });
}

/** De keuzelijst in Mijn voorkeuren volgen wat de server ervan maakte. */
function volgVoorkeur(kanaal) {
  if (kanaal) el('voorkeurkanaal').value = kanaal;
}

export async function zetMeldingenAan() {
  try {
    // Toestemming vragen moet rechtstreeks uit een klik komen: iOS weigert
    // het anders zonder te vragen.
    const toestemming = await Notification.requestPermission();
    if (toestemming !== 'granted') {
      toon('meldingenmelding', 'Zonder toestemming kunnen er geen meldingen komen.', true);
      return toonMeldingenstatus();
    }
    const registratie = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    // Een bestaand abonnement hergebruiken: opnieuw inschrijven met een andere
    // sleutel mislukt stil.
    const abonnement =
      (await registratie.pushManager.getSubscription()) ??
      (await registratie.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: sleutelNaarBytes(config.vapid_publiek),
      }));

    const uit = await api('/api/push/abonneer', 'POST', {
      endpoint: abonnement.endpoint,
      p256dh: alsB64url(abonnement.getKey('p256dh')),
      auth: alsB64url(abonnement.getKey('auth')),
      toestel: navigator.userAgent.slice(0, 100),
    });
    if (uit.status !== 200) throw new Error(uit.body?.fout ?? `status ${uit.status}`);
    volgVoorkeur(uit.body.kanaal_voorkeur);
    await toonMeldingenstatus();
    toon('meldingenmelding', 'Meldingen staan aan op dit toestel. Stuur een testmelding om het na te gaan.');
  } catch (fout) {
    toon('meldingenmelding', `Meldingen aanzetten lukte niet: ${fout.message}`, true);
  }
}

/**
 * Uitzetten: eerst bij de server afmelden, dan in de browser. Beide — anders
 * blijft de browser meldingen ontvangen terwijl de server denkt dat het toestel
 * weg is, of blijft de server iets aanroepen dat niet meer bestaat.
 */
export async function zetMeldingenUit() {
  try {
    const abonnement = await abonnementVanDitToestel();
    if (abonnement) {
      const uit = await api('/api/push/afmelden', 'POST', { endpoint: abonnement.endpoint });
      volgVoorkeur(uit.body?.kanaal_voorkeur);
      await abonnement.unsubscribe();
    }
    await toonMeldingenstatus();
    toon('meldingenmelding', 'Meldingen staan uit op dit toestel.');
  } catch (fout) {
    toon('meldingenmelding', `Uitzetten lukte niet: ${fout.message}`, true);
  }
}

export async function stuurTestmelding() {
  const uit = await api('/api/push/test', 'POST', {});
  if (uit.status !== 200) return toon('meldingenmelding', 'De testmelding lukte niet.', true);
  if (uit.body.reden === 'modus uit') {
    return toon('meldingenmelding', 'Er vertrekt niets: bericht_modus staat op uit.', true);
  }
  toon(
    'meldingenmelding',
    uit.body.verstuurd
      ? `Testmelding verstuurd naar ${uit.body.verstuurd} toestel${uit.body.verstuurd === 1 ? '' : 'len'}.`
      : 'Geen enkel toestel bereikbaar. Zet meldingen uit en opnieuw aan.',
    !uit.body.verstuurd
  );
}

/** Vanuit een melding: de service worker vraagt de pagina Mijn berichten te openen. */
export function luisterNaarServiceWorker({ openBerichten, nieuwBericht }) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open-berichten') openBerichten();
    else if (e.data?.type === 'nieuw-bericht') nieuwBericht();
  });
}
