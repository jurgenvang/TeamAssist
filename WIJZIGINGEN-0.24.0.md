# TeamAssist 0.24.0 — T16 en T17

Vorige versie: 0.23.0

## Databank

Niets.

## Configuratie

Niets.

## T16 — `verwittigen.js` gebruikt `kanaal_voorkeur` nu wel

**`verwittig()` heeft geen `kanaal`-parameter meer.** De aanroeper zegt enkel
wie iets moet weten en wat — de functie zelf bepaalt hoe, aan de hand van
`personen.kanaal_voorkeur` (mail/push/beide, Mijn voorkeuren sinds 0.19.0).
Vóór deze versie werd die kolom nergens gelezen: iedereen kreeg mail, ongeacht
wat hij instelde.

**Zolang er geen push-kanaal bestaat, blijft mail het enige werkelijke
kanaal.** Wie 'push' koos, krijgt voorlopig toch mail — dat is beter dan
niets — maar met een aparte, niet-alarmerende logregel ("bericht via mail,
terwijl de voorkeur push is"). Zo blijft zichtbaar wie een keuze maakte die
nog niet gehonoreerd kan worden, in plaats van dat stilzwijgend te negeren tot
push ooit gebouwd wordt. `berichten.kanaal` registreert altijd het kanaal dat
écht gebruikt is, niet de voorkeur die niet gehaald werd.

Geen enkele bestaande aanroeper (`wedstrijden.js`, `aanwezigheid-beheer.js`)
gaf ooit een expliciete `kanaal`-parameter mee, dus dit raakt niets buiten
`verwittigen.js` zelf.

## T17 — blokken bij Zaalbeheer als nette blokjes

Bij Zaalbeheer → Zalen stonden de blokken van een zaal als één regel
doorlopende, komma-gescheiden tekst. Bij een zaal met meerdere terreinen
(UCLL, HHH, Sportoase Heverlee — tot drie teams op hetzelfde tijdslot) werd
die regel lang en moeilijk in één oogopslag te lezen.

**Gegroepeerd per weekdag**, elk blok als een los, afgebakend blokje met het
bestaande verwijderkruisje. Bewust neutrale kleuren (`--vlak`/`--lijn`), geen
accentkleur — dit is roosterinformatie, geen rolbadge, en die twee variabelen
zijn al zonder extra werk donker-veilig, in tegenstelling tot `.rollen li`
(0.19.0) dat wél de accentkleur gebruikt en daarom een aparte donkere-modus-
regel nodig had.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/lib/verwittigen.js` | geen `kanaal`-parameter meer; leest `kanaal_voorkeur` |
| `test/verwittigen.test.mjs` | een verouderde test vervangen, twee nieuwe |
| `public/js/schermen/trainingen.js` | `blokkenPerDag()`: groepering per weekdag, losse blokjes |
| `public/stijl.css` | `.dagblokken`, `.dagblokken-label`, `.blokjes` |
| `test/frontend.test.mjs` | drie nieuwe tests |
| `src/versie.js` | 0.23.0 → 0.24.0 |

## Tests

674, allemaal groen. Twee fouten ingebouwd ter controle: de push-logregel
niet schrijven (1 rood), de groepering per weekdag weghalen (1 rood).

Onderweg ook een eigen kopieerfout gevonden en meteen hersteld: een dubbele
`const DAGNAMEN`-declaratie in `trainingen.js`.
