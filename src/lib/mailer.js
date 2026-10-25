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

/**
 * Veel mails in één keer, via het batch-endpoint van Resend (honderd per
 * oproep). Voor een mededeling aan de hele club: elke mail apart versturen
 * zou per ontvanger een uitgaande oproep kosten, en een Worker mag er per
 * aanroep maar een beperkt aantal doen.
 *
 * @param {Array<{van, naar, onderwerp, tekst}>} mails  hoogstens honderd
 */
export async function verstuurMailBatch(mails, env, fetcher = fetch) {
  if (mails.length > 100) throw new Error('hoogstens honderd mails per batch');
  const antwoord = await fetcher('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(mails.map((m) => ({ from: m.van, to: m.naar, subject: m.onderwerp, text: m.tekst }))),
  });

  if (!antwoord.ok) {
    const body = await antwoord.text().catch(() => '');
    throw new Error(`Resend gaf status ${antwoord.status}${body ? `: ${body}` : ''}`);
  }
  return antwoord.json();
}
