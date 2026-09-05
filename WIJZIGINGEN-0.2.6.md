# TeamAssist 0.2.6 — proxy met aanmelding

Vorige versie: 0.2.5

## Databank

Niets. `schema-controle.sql` wijzigt enkel door het versienummer in de kopregel.

## Configuratie

Niets.

## Wat er wijzigt

Enkel `tools/vbl-veldonderzoek.py`, dat nu door een proxy kan die een aanmelding
vraagt.

```
python tools/vbl-veldonderzoek.py --proxy proxy-t2-lu.welcome.ec.europa.eu:8012 --proxy-user geijsju
```

Het wachtwoord wordt gevraagd bij het draaien. Het staat bewust niet als
argument: wat op de opdrachtregel komt, belandt in de geschiedenis van de shell
en in de logs van sommige systemen. Wie het toch in een omgevingsvariabele wil
zetten, kan `PROXY_WACHTWOORD` gebruiken.

Bijzondere tekens in het wachtwoord worden geëncodeerd, zodat een `@` of een `:`
de proxy-URL niet breekt. In de uitvoer staat het wachtwoord altijd als `***`.

**De proxy-adressen staan niet in het script.** Het zijn interne
infrastructuurnamen van een werkgever; die horen niet in een repo die op GitHub
staat. Vandaar dat ze telkens meegegeven worden.

Komt er een 407 terug terwijl het wachtwoord klopt, dan wil de proxy geen gewone
aanmelding maar NTLM of Kerberos. Dat handelt Python niet zelf af; een lokale
tussenproxy zoals `px` of `cntlm` doet dat wel. De foutuitleg van het script
vermeldt dat.

## Gewijzigde bestanden

| Bestand | Wat |
|---|---|
| `tools/vbl-veldonderzoek.py` | `--proxy-user` met wachtwoordvraag, encodering van bijzondere tekens, gemaskeerde uitvoer, uitleg bij een 407 |
| `src/versie.js` | 0.2.5 → 0.2.6 |
| `schema-controle.sql` | enkel het versienummer in de kop |
| `README.md` | versienummer |

## Tests

103, allemaal groen. De hulproutines van het script zijn apart nagekeken: de
opbouw van de proxy-URL met bijzondere tekens, en het maskeren van het
wachtwoord.
