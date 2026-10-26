// De schil: aanmelden, navigatie, en de schermen aan elkaar knopen.

import { api, haalConfig, sessie, bewaarSessie, leesTokensUitUrl, vraagAanmeldlink, verifieerCode, testrol } from './api.js';
import { el, toon, veilig } from './hulp.js';
import { bouwNavigatie, menuTabbladen } from './navigatie.js';
import { laadPloegen, synchroniseerPloegen, synchroniseerLeden, downloadSjabloon, uploadSjabloon } from './schermen/ploegen.js';
import { bewaarSelectie, publiceerSelectie } from './schermen/aanwezigheid-beheer.js';
import { zoekPersonen } from './schermen/personen.js';
import { koppelPersoonscherm } from './schermen/persoon.js';
import { koppelMeelezen } from './schermen/meelezen.js';
import { laadInstellingen, haalBrandingvoorstel, downloadBackup } from './schermen/instellingen.js';
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
import { startTeller, ververTeller, toonBerichten, allesGelezen, toonMededeling, mededelingWegklikken } from './schermen/berichten.js';
import { laadMededelingBeheer, koppelMededelingBeheer } from './schermen/mededeling-beheer.js';
import { zetMeldingenAan, zetMeldingenUit, stuurTestmelding, luisterNaarServiceWorker } from './schermen/meldingen.js';

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
    }
    if (tab === 'dagelijksbeheer') {
      laadMededelingBeheer();
    }
    if (tab === 'zaalbeheer') {
      laadZalen();
      laadPeriodes();
    }
  });

  bouwBeheermenu(rechten, gegevens.testrol_mogelijk === true);

  startTeller();
  toonMededeling();

  // Aangekomen via een tik op een melding, terwijl de app nog niet openstond
  // (sw.js opent dan /?open=berichten). De URL daarna opkuisen, zodat een
  // herlaadbeurt niet opnieuw naar de berichten springt.
  if (new URLSearchParams(location.search).get('open') === 'berichten') {
    history.replaceState(null, '', location.pathname);
    toonBerichten();
  }
}

/**
 * Het deel Beheer bovenaan het naammenu.
 *
 * Welke schermen erin staan, volgt uit dezelfde rechten als de tabbalk
 * (navigatie.js) — geen eigen lijst hier. Gemak, geen beveiliging: elke route
 * achter deze schermen controleert het recht zelf opnieuw.
 */
function bouwBeheermenu(rechten, testrolMogelijk) {
  const schermen = menuTabbladen(rechten);
  const vak = el('naammenu-beheer');
  vak.innerHTML = schermen
    .map((t) => `<button type="button" role="menuitem" data-scherm="${t.id}">${veilig(t.naam)}</button>`)
    .join('');
  for (const knop of vak.querySelectorAll('button[data-scherm]')) {
    knop.addEventListener('click', () => {
      sluitNaammenu();
      if (huidigeKies) huidigeKies(knop.dataset.scherm);
    });
  }

  el('naammenu-testrol').hidden = !testrolMogelijk;
  const iets = schermen.length > 0 || testrolMogelijk;
  el('naammenu-beheer-kop').hidden = !iets;
  el('naammenu-scheiding').hidden = !iets;
  // De rol in de kopbalk in de accentkleur van de strook, zoals in YOAssist:
  // een beheerder ziet in één oogopslag dat hij meer mag dan een gewone
  // official — en een beheerder die als coach kijkt, ziet dat het niet zo is.
  el('topbalkrollen').classList.toggle('beheer', schermen.length > 0);
}

function sluitNaammenu() {
  el('naammenu').hidden = true;
  el('naammenuknop').setAttribute('aria-expanded', 'false');
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
  if (!ik.contains(e.target)) sluitNaammenu();
});

el('naammenu-berichten').addEventListener('click', () => {
  sluitNaammenu();
  toonBerichten();
});
// Het bolletje gaat rechtstreeks naar Mijn berichten, zonder het menu te
// openen: wie een rood bolletje ziet, wil de berichten, niet het menu.
el('berichtenbadge').addEventListener('click', (e) => {
  e.stopPropagation();
  sluitNaammenu();
  toonBerichten();
});
el('berichtenallesgelezen').addEventListener('click', allesGelezen);
el('berichtensluiten').addEventListener('click', () => {
  el('berichtenscherm').hidden = true;
});
el('mededelingweg').addEventListener('click', mededelingWegklikken);
el('meldingenaan').addEventListener('click', zetMeldingenAan);
el('meldingenuit').addEventListener('click', zetMeldingenUit);
el('meldingentest').addEventListener('click', stuurTestmelding);
// Stond de app al open toen er op een melding getikt werd, dan vraagt de
// service worker om Mijn berichten te openen — sneller dan een herlaadbeurt.
luisterNaarServiceWorker({ openBerichten: toonBerichten, nieuwBericht: ververTeller });
koppelMededelingBeheer();

el('naammenu-voorkeuren').addEventListener('click', () => {
  sluitNaammenu();
  if (huidigePersoon) toonVoorkeuren(huidigePersoon);
});

el('naammenu-afmelden').addEventListener('click', () => {
  bewaarSessie(null);
  location.reload();
});

el('naammenu-testrol').addEventListener('click', () => {
  sluitNaammenu();
  el('testrolscherm').hidden = false;
  vulTestrolkeuze();
  el('testrolscherm').scrollIntoView({ block: 'start' });
});
el('testrolsluiten').addEventListener('click', () => {
  el('testrolscherm').hidden = true;
});

el('voorkeurenbewaren').addEventListener('click', bewaarVoorkeuren);
el('voorkeurensluiten').addEventListener('click', () => {
  el('voorkeuren').hidden = true;
});

el('backupdownload').addEventListener('click', downloadBackup);

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
koppelMeelezen();
koppelTestrol();

start();
