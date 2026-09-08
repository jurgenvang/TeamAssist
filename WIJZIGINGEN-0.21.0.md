# TeamAssist 0.21.0 — fase 5, tweede trigger: selectie gepubliceerd

Vorige versie: 0.20.0

## Databank

Niets.

## Configuratie

Niets.

## Aanleiding

Tweede trigger voor `verwittig()`, na de wedstrijdwijziging uit 0.18.0.
Architectuur 8.4 beschreef al "vanaf hier ziet de hele ploeg de namen" bij het
publiceren van een selectie — de publicatie zelf gebeurde al sinds 0.13.0,
maar niemand kreeg er bericht van. `selectiePubliceren()` had daar zelf al een
commentaarregel over staan: "Er is nog geen verstuurkanaal (fase 5)".

## Wat er wijzigt

Bij het publiceren van een selectie krijgt nu elke speler van de ploeg een
mail — niet enkel wie geselecteerd is. De boodschap verschilt: wie
geselecteerd is, hoort dat; wie niet geselecteerd is, hoort dat evengoed
("Je staat er deze keer niet bij") in plaats van niets te horen en zelf in de
app te moeten gaan kijken.

**Enkel spelers (`team_spelers`), geen begeleiding** — een coach of
coördinator stelde de selectie net zelf op en weet al wat erin staat.

Geen aanpassing aan `verwittig()` zelf nodig: dezelfde functie, dezelfde drie
modi, dezelfde `berichten`-tabel bij succes. Dit bevestigt precies waarom
fase 5 zo opgebouwd is — een nieuwe trigger toevoegen vraagt geen nieuwe
infrastructuur.

## Getest, niet enkel gebouwd

De bestaande tests voor `selectiePubliceren` slaagden aanvankelijk zonder dat
de nieuwe verstuurlogica ooit echt aangesproken werd — de testfixture had
personen zonder e-mailadres, dus `verwittig()` stopte meteen bij de
e-mailcontrole, vóór `env` ooit nodig was. Drie nieuwe, volwaardige
end-to-end tests met echte e-mailadressen en een mock die Resend- en
VBL-aanroepen uit elkaar houdt: het onderscheid tussen wel/niet geselecteerd,
dat enkel spelers verwittigd worden (niet de coach), en dat een ploeg zonder
`team_spelers` niemand verwittigt zonder te mislukken.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `src/routes/admin/aanwezigheid-beheer.js` | `meldSelectiePublicatie()`; `selectiePubliceren()` roept ze aan |
| `test/aanwezigheid-beheer.test.mjs` | drie nieuwe end-to-end tests |
| `src/versie.js` | 0.20.0 → 0.21.0 |

## Tests

642, allemaal groen. Twee fouten ingebouwd ter controle: geen onderscheid
tussen wel/niet geselecteerd in de boodschap (1 rood), de meldfunctie niet
aanroepen bij het publiceren (2 rood).

## Daarna

Volgende triggers voor dezelfde `verwittig()`-functie: een welkomstmail voor
een nieuw aangemaakte persoon, herinneringen aan wie nog niet invulde.
