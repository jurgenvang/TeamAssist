// De schil: aanmelden, navigatie, en de schermen aan elkaar knopen.

import { api, haalConfig, sessie, bewaarSessie, leesTokensUitUrl, vraagAanmeldlink, testrol } from './api.js';
import { el, toon, veilig } from './hulp.js';
import { bouwNavigatie } from './navigatie.js';
import { laadPloegen, synchroniseerPloegen, synchroniseerLeden } from './schermen/ploegen.js';
import { zoekPersonen } from './schermen/personen.js';
import { koppelPersoonscherm } from './schermen/persoon.js';
import { laadInstellingen } from './schermen/instellingen.js';
import { toonDiagnose } from './schermen/diagnose.js';
import { toonTestbalk, vulTestrolkeuze, koppelTestrol } from './schermen/testrol.js';

function toonAanmelden() {
  el('aanmelden').hidden = false;
  el('app').hidden = true;
}

function toonApp(gegevens) {
  el('aanmelden').hidden = true;
  el('app').hidden = false;

  el('volledigenaam').textContent =
    `${gegevens.persoon.voornaam} ${gegevens.persoon.achternaam}`.trim() || gegevens.persoon.email;
  el('emailadres').textContent = gegevens.persoon.email || '';
  el('clubregel').textContent = `AB InBev Leuven Bears — seizoen ${gegevens.seizoen.naam}`;

  const rollen = gegevens.rollen ?? [];
  el('rollenlijst').innerHTML = rollen.map((r) => `<li>${veilig(r)}</li>`).join('');
  el('geenrollen').hidden = rollen.length > 0;

  const ploegen = gegevens.ploegen ?? [];
  el('mijnploegenlijf').innerHTML = ploegen
    .map((p) => `<tr><td>${veilig(p.categorie ?? '')}</td><td>${veilig(p.naam)}</td></tr>`)
    .join('');
  el('geenploegen').hidden = ploegen.length > 0;

  toonTestbalk(gegevens);

  const rechten = gegevens.rechten ?? {};
  el('rechtenlijf').innerHTML = Object.entries(rechten)
    .map(([recht, waar]) => {
      const bereik = waar === '*' ? 'de hele club' : `${waar.length} ploeg${waar.length === 1 ? '' : 'en'}`;
      return `<tr><td>${veilig(recht)}</td><td class="ploegen">${bereik}</td></tr>`;
    })
    .join('');

  // Elk tabblad laadt pas wanneer het geopend wordt: dat scheelt oproepen voor
  // schermen die iemand nooit bekijkt.
  bouwNavigatie(rechten, (tab) => {
    if (tab === 'ploegen') laadPloegen();
    if (tab === 'beheer') {
      laadInstellingen();
      vulTestrolkeuze();
    }
  });
}

async function start() {
  const config = await haalConfig();
  el('versieregel').textContent = `TeamAssist ${config.versie ?? ''}`;

  if (!config.supabase_url) {
    toonAanmelden();
    toon('aanmeldmelding', 'Het aanmeldsysteem is nog niet ingesteld op deze installatie.', true);
    return;
  }

  const uitUrl = leesTokensUitUrl();
  if (uitUrl?.fout) {
    toonAanmelden();
    toon('aanmeldmelding', `Aanmelden lukte niet: ${uitUrl.fout}`, true);
    return;
  }
  if (uitUrl) bewaarSessie(uitUrl);
  if (!sessie()) return toonAanmelden();

  const uitkomst = await api('/api/mij');
  if (uitkomst.status === 200) return toonApp(uitkomst.body);

  toonAanmelden();

  if (uitkomst.status === 403) {
    toon(
      'aanmeldmelding',
      'Je bent aangemeld, maar dit adres is nog niet gekoppeld aan iemand in TeamAssist. ' +
        'Een beheerder moet je toevoegen.',
      true
    );
    return;
  }
  if (uitkomst.status === 409) {
    toon(
      'aanmeldmelding',
      'Je bent aangemeld, maar er is nog geen actief seizoen ingesteld. ' +
        'Zolang dat ontbreekt, kan de app niets tonen.',
      true
    );
    return;
  }
  if (uitkomst.status === 401) {
    // Enkel hier de sessie weggooien: het token deugt niet meer. Bij een 409
    // zou opnieuw aanmelden niets oplossen.
    bewaarSessie(null);
    toon('aanmeldmelding', 'Je aanmelding is verlopen. Vraag een nieuwe link aan.', true);
    return;
  }
  toon(
    'aanmeldmelding',
    `Je bent aangemeld, maar de app antwoordde met ${uitkomst.status}: ${uitkomst.body?.fout ?? 'geen uitleg'}.`,
    true
  );
}

// --- knoppen ---------------------------------------------------------------

el('aanmeldform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = el('email').value.trim();
  try {
    toon('aanmeldmelding', await vraagAanmeldlink(email));
  } catch (fout) {
    toon('aanmeldmelding', `Versturen lukte niet: ${fout.message}`, true);
  }
});

el('afmelden').addEventListener('click', () => {
  bewaarSessie(null);
  location.reload();
});

el('ploegenladen').addEventListener('click', laadPloegen);
el('ploegensync').addEventListener('click', synchroniseerPloegen);
el('ledensync').addEventListener('click', synchroniseerLeden);
el('zoekknop').addEventListener('click', zoekPersonen);
el('zoekterm').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    zoekPersonen();
  }
});
el('diagnoseknop').addEventListener('click', () => toonDiagnose(false));
el('diagnoseruw').addEventListener('click', () => toonDiagnose(true));
koppelPersoonscherm();
koppelTestrol();

start();
