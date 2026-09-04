// Mail versturen via Resend.
//
// Wordt nooit rechtstreeks aangeroepen buiten verwittigen.js — dat legt
// bericht_modus, het loggen en het bewaren in `berichten` vast. Deze functie
// doet enkel het versturen zelf, zonder databanktoegang, zodat ze apart en
// zonder netwerk te testen is (met een eigen fetcher meegegeven, zoals overal
// elders in dit project waar een externe dienst wordt aangeroepen).

export async function verstuurMail({ van, naar, onderwerp, tekst }, env, fetcher = fetch) {
  const antwoord = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: van, to: naar, subject: onderwerp, text: tekst }),
  });

  if (!antwoord.ok) {
    const body = await antwoord.text().catch(() => '');
    throw new Error(`Resend gaf status ${antwoord.status}${body ? `: ${body}` : ''}`);
  }
  return antwoord.json();
}
