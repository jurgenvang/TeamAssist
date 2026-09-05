// De schil: aanmelden, navigatie, en de schermen aan elkaar knopen.

import { api, haalConfig, sessie, bewaarSessie, leesTokensUitUrl, vraagAanmeldlink, verifieerCode, testrol } from './api.js';
import { el, toon, veilig } from './hulp.js';
import { bouwNavigatie } from './navigatie.js';
import { laadPloegen, synchroniseerPloegen, synchroniseerLeden, downloadSjabloon, uploadSjabloon } from './schermen/ploegen.js';
import { bewaarSelectie, publiceerSelectie } from './schermen/aanwezigheid-beheer.js';
import { zoekPersonen } from './schermen/personen.js';
import { koppelPersoonscherm } from './schermen/persoon.js';
import { laadInstellingen, haalBrandingvoorstel } from './schermen/instellingen.js';
import { toonVoorkeuren, bewaarVoorkeuren, pasDonkereModusToe } from './schermen/voorkeuren.js';
import { laadMijnOpgaven } from './schermen/mijn-opgaven.js';
import { toonDiagnose } from './schermen/diagnose.js';
import { pasHuisstijlToe } from './huisstijl.js';
import {
  laadZalen, maakZaal, maakBlok, maakSluiting, laadPeriodes, maakPeriode, synchroniseerVakanties, synchroniseerFeestdagen, maakReeks,
  synchroniseerWedstrijden, getHuidigWedstrijdenTeam,
  downloadZaalsjabloon, uploadZaalsjabloon, downloadReeksensjabloon, uploadReeksensjabloon,
} from './schermen/trainingen.js';
import { toonTestbalk, vulTestrolkeuze, koppelTestrol } from './schermen/testrol.js';

function toonAanmelden() {
  el('aanmelden').hidden = false;
  el('app').hidden = true;
}

let huidigeKies = null;
let huidigePersoon = null;

function toonApp(gegevens) {
  el('aanmelden').hidden = true;
  el('app').hidden = false;

  huidigePersoon = gegevens.persoon;
  // De databank is de bron van waarheid voor de donkere modus, niet
  // localStorage — dat laatste is enkel een snel eerste beeld vóór dit
  // antwoord er is. Bij een verschil (bijvoorbeeld een ander toestel) wint
  // dit hier.
  pasDonkereModusToe(gegevens.persoon.donkere_modus);

  const naam = `${gegevens.persoon.voornaam} ${gegevens.persoon.achternaam}`.trim() || gegevens.persoon.email;

  // De topbalk: naam met de rol(len) eronder, zoals bij YOAssist. Compact, dus
  // een korte opsomming — de volledige lijst met rechten staat verderop bij
  // Overzicht voor wie meer wil zien.
  el('topbalkik').hidden = false;
  el('topbalknaam').textContent = naam;
  el('topbalkrollen').textContent = (gegevens.rollen ?? []).join(', ') || 'geen rol';

  el('emailadres').textContent = gegevens.persoon.email || '';
  el('seizoenregel').textContent = `Seizoen ${gegevens.seizoen.naam}`;

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

  // Enkel tonen voor wie iets kan opgeven: SPELER of OUVO. Voor ADMIN zonder
  // eigen ploeg zou een lege sectie hier enkel verwarrend zijn.
  if ('aanwezigheid.opgeven.eigen' in rechten || 'aanwezigheid.opgeven.kind' in rechten) {
    laadMijnOpgaven();
  }

  // Elk tabblad laadt pas wanneer het geopend wordt: dat scheelt oproepen voor
  // schermen die iemand nooit bekijkt.
  huidigeKies = bouwNavigatie(rechten, (tab) => {
    if (tab === 'ploegen') {
      laadPloegen();
      laadZalen(); // vult de zaalkeuze voor het reeksformulier
    }
    if (tab === 'configuratie') {
      laadInstellingen();
      vulTestrolkeuze();
    }
    if (tab === 'zaalbeheer') {
      laadZalen();
      laadPeriodes();
    }
  });

  // 'Algemeen' in het naammenu: enkel zichtbaar voor wie systeem.beheren
  // heeft. Gemak, geen beveiliging — elke route achter deze snelkoppelingen
  // controleert het recht zelf sowieso opnieuw.
  const isAdmin = 'systeem.beheren' in rechten;
  el('naammenu-algemeen-kop').hidden = !isAdmin;
  el('naammenu-zaalbeheer').hidden = !isAdmin;
  el('naammenu-configuratie').hidden = !isAdmin;
  el('naammenu-dagelijksbeheer').hidden = !isAdmin;
}

async function start() {
  // Vóór het aanmelden al de clubkleur en het logo tonen: het is de eerste
  // pagina die iemand ziet, en de huisstijl hoort daar al te kloppen.
  // Vóór /api/mij ooit geantwoord heeft, meteen het laatst gekende
  // kleurenschema toepassen (uit localStorage) — anders flitst de pagina even
  // in het verkeerde schema bij het laden.
  pasDonkereModusToe();
  pasHuisstijlToe();

  const config = await haalConfig();
  el('versieregel').textContent = `TeamAssist ${config.versie ?? ''}`;
  el('topbalkversie').textContent = config.versie ? `v${config.versie}` : '';

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
  await voltooiAanmelding();
}

/**
 * Alles ná het binnenkrijgen van tokens — of ze nu uit het URL-fragment komen
 * (na een klik op de link) of uit verifieerCode() (na een ingetypte code).
 * Beide wegen komen hier samen, zodat er geen tweede kopie van deze logica
 * kan gaan afwijken.
 */
async function voltooiAanmelding() {
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
    // De code hoort bij hetzelfde adres — bewaren tot het codeformulier het
    // nodig heeft, nooit in de URL of iets dat langer blijft hangen dan dit
    // tabblad.
    el('codesectie').dataset.email = email;
    el('codesectie').hidden = false;
  } catch (fout) {
    toon('aanmeldmelding', `Versturen lukte niet: ${fout.message}`, true);
  }
});

el('codeform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = el('codesectie').dataset.email || el('email').value.trim();
  const code = el('code').value.trim();
  if (!email || !code) return;
  try {
    bewaarSessie(await verifieerCode(email, code));
    await voltooiAanmelding();
  } catch (fout) {
    toon('aanmeldmelding', `De code klopt niet (meer): ${fout.message}`, true);
  }
});

el('naammenuknop').addEventListener('click', () => {
  const menu = el('naammenu');
  const open = menu.hidden;
  menu.hidden = !open;
  el('naammenuknop').setAttribute('aria-expanded', String(open));
});

// Ergens anders klikken sluit het menu — anders blijft het openstaan tot
// iemand toevallig opnieuw op de knop klikt.
document.addEventListener('click', (e) => {
  const ik = el('topbalkik');
  if (!ik.contains(e.target)) el('naammenu').hidden = true;
});

el('naammenu-voorkeuren').addEventListener('click', () => {
  el('naammenu').hidden = true;
  if (huidigePersoon) toonVoorkeuren(huidigePersoon);
});

el('naammenu-afmelden').addEventListener('click', () => {
  bewaarSessie(null);
  location.reload();
});

el('naammenu-zaalbeheer').addEventListener('click', () => {
  el('naammenu').hidden = true;
  if (huidigeKies) huidigeKies('zaalbeheer');
});
el('naammenu-configuratie').addEventListener('click', () => {
  el('naammenu').hidden = true;
  if (huidigeKies) huidigeKies('configuratie');
});
el('naammenu-dagelijksbeheer').addEventListener('click', () => {
  el('naammenu').hidden = true;
  if (huidigeKies) huidigeKies('dagelijksbeheer');
});

el('voorkeurenbewaren').addEventListener('click', bewaarVoorkeuren);
el('voorkeurensluiten').addEventListener('click', () => {
  el('voorkeuren').hidden = true;
});

el('ploegenladen').addEventListener('click', laadPloegen);
el('ploegensync').addEventListener('click', synchroniseerPloegen);
el('ledensync').addEventListener('click', synchroniseerLeden);
el('sjabloondownload').addEventListener('click', downloadSjabloon);
el('sjabloonupload').addEventListener('click', uploadSjabloon);
el('zoekknop').addEventListener('click', zoekPersonen);
el('zoekterm').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    zoekPersonen();
  }
});
el('zaalmaken').addEventListener('click', maakZaal);
el('blokmaken').addEventListener('click', maakBlok);
el('sluitingmaken').addEventListener('click', maakSluiting);
el('periodemaken').addEventListener('click', maakPeriode);
el('zaalsjabloondownload').addEventListener('click', downloadZaalsjabloon);
el('zaalsjabloonupload').addEventListener('click', uploadZaalsjabloon);
el('reeksensjabloondownload').addEventListener('click', downloadReeksensjabloon);
el('reeksensjabloonupload').addEventListener('click', uploadReeksensjabloon);
el('vakantiesync').addEventListener('click', synchroniseerVakanties);
el('feestdagensync').addEventListener('click', synchroniseerFeestdagen);
el('reeksmaken').addEventListener('click', maakReeks);
el('wedstrijdensync').addEventListener('click', () => synchroniseerWedstrijden(getHuidigWedstrijdenTeam()));
el('selectiebewaren').addEventListener('click', bewaarSelectie);
el('selectiepubliceren').addEventListener('click', publiceerSelectie);

el('diagnoseknop').addEventListener('click', () => toonDiagnose(false));
el('diagnoseruw').addEventListener('click', () => toonDiagnose(true));
el('brandingvoorstelknop').addEventListener('click', haalBrandingvoorstel);
koppelPersoonscherm();
koppelTestrol();

start();
