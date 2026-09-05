# TeamAssist 0.3.1 — het onderzoeksscript eruit

Vorige versie: 0.3.0

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

`tools/vbl-veldonderzoek.py` is verwijderd. Sinds 0.3.0 doet
`GET /api/admin/vbl-diagnose` hetzelfde vanuit de Worker, en beter: Cloudflare
bereikt `vblcb.wisseq.eu` wel, waar een kantoornetwerk achter een proxy en de
ontwikkelomgeving dat niet doen. Het script laten staan zou een tweede weg naar
dezelfde gegevens betekenen die niemand gebruikt en die stil veroudert zodra de
veldnamen wijzigen.

Wat daarmee ook verdwijnt: de proxyconfiguratie met aanmelding uit 0.2.6. Die
was er enkel voor dit script.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `tools/vbl-veldonderzoek.py` | verwijderd — **haal dit bestand ook uit je lokale repo en uit GitHub**, een delta uitpakken verwijdert niets |
| `src/versie.js` | 0.3.0 → 0.3.1 |
| `schema-controle.sql` | enkel het versienummer in de kop |
| `README.md` | versienummer |

## Tests

123, allemaal groen, met `cd test && npm test`.
