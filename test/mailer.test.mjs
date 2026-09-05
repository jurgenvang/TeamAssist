// De Resend-mailclient.
//
// Puur en zonder databank: dit bestand test enkel het versturen zelf, niet
// wat er rond gebeurt (dat is verwittigen.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { verstuurMail } from '../src/lib/mailer.js';

const env = { RESEND_API_KEY: 'test-sleutel' };

test('stuurt de juiste velden naar de Resend-API', async () => {
  let gevangen;
  const fetcher = async (url, opties) => {
    gevangen = { url, opties };
    return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 });
  };
  await verstuurMail({ van: 'Club <a@b.c>', naar: 'x@y.z', onderwerp: 'Test', tekst: 'Hallo' }, env, fetcher);

  assert.equal(gevangen.url, 'https://api.resend.com/emails');
  const body = JSON.parse(gevangen.opties.body);
  assert.equal(body.from, 'Club <a@b.c>');
  assert.equal(body.to, 'x@y.z');
  assert.equal(body.subject, 'Test');
  assert.equal(body.text, 'Hallo');
});

test('stuurt de API-sleutel mee in de Authorization-header', async () => {
  let gevangen;
  const fetcher = async (url, opties) => {
    gevangen = opties;
    return new Response('{}', { status: 200 });
  };
  await verstuurMail({ van: 'a@b.c', naar: 'x@y.z', onderwerp: 'T', tekst: 'H' }, env, fetcher);
  assert.equal(gevangen.headers.authorization, 'Bearer test-sleutel');
});

test('een foutstatus van Resend wordt een duidelijke fout, niet stil genegeerd', async () => {
  const fetcher = async () => new Response('ongeldig adres', { status: 422 });
  await assert.rejects(
    () => verstuurMail({ van: 'a@b.c', naar: 'x@y.z', onderwerp: 'T', tekst: 'H' }, env, fetcher),
    /422/
  );
});

test('het antwoord van Resend wordt teruggegeven bij succes', async () => {
  const fetcher = async () => new Response(JSON.stringify({ id: 'msg-42' }), { status: 200 });
  const uit = await verstuurMail({ van: 'a@b.c', naar: 'x@y.z', onderwerp: 'T', tekst: 'H' }, env, fetcher);
  assert.equal(uit.id, 'msg-42');
});
