// Service worker voor TeamAssist (0.29.0, uit YOAssist).
//
// Doet één ding: pushmeldingen tonen en de app openen als erop getikt wordt.
// Bewust geen caching — een lijst die uit een cache komt, is erger dan een
// lijst die even niet laadt.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let gegevens = { titel: 'TeamAssist', tekst: '' };
  try {
    if (event.data) gegevens = { ...gegevens, ...event.data.json() };
  } catch {
    // Geen leesbare inhoud: toch iets tonen. De browser eist een melding na
    // een push; zwijgen kost op termijn het abonnement.
    gegevens.tekst = 'Er is een nieuw bericht in TeamAssist.';
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(gegevens.titel, {
        body: gegevens.tekst,
        tag: 'teamassist',
        icon: '/icoon/icoon-192.png',
      }),
      // Staat de app al open, dan hoeft het bolletje niet te wachten tot de
      // volgende verversing.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((vensters) => {
        for (const venster of vensters) venster.postMessage({ type: 'nieuw-bericht' });
      }),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Een melding opent altijd Mijn berichten, niet het onderwerp zelf: zo land
  // je altijd op hetzelfde vertrouwde scherm, wat het bericht ook was.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((vensters) => {
      for (const venster of vensters) {
        if ('focus' in venster) {
          venster.postMessage({ type: 'open-berichten' });
          return venster.focus();
        }
      }
      return self.clients.openWindow('/?open=berichten');
    })
  );
});
