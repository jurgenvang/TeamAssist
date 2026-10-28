// Hulp voor de tests van de woensdaglijst (0.34.0): een Excel en een mail
// nabouwen in de vorm van het echte voorbeeld (Mailchimp, quoted-printable,
// gecodeerd onderwerp, grijze cellen) — niet het echte bestand zelf: dat
// bevat persoonsgegevens en hoort niet in de repo. Overgenomen uit YOAssist
// (test/woensdaglijst.test.mjs).
//
// Alle datums rekenen vanaf de eerstvolgende woensdag. Een vaste datum zou
// ooit voorbij zijn, en dan faalt de test zonder dat er iets veranderde.

import { deflateRawSync, crc32 } from 'node:zlib';

// ---- Datums: de eerstvolgende woensdag en haar weekend ---------------------
export const vandaagUtc = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
export const totWoensdag = ((3 - vandaagUtc.getUTCDay() + 7) % 7) || 7;
export const WOENSDAG = new Date(vandaagUtc.getTime() + totWoensdag * 86400000);
export const isoDag = (d, n = 0) => new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);
export const ZA = isoDag(WOENSDAG, 3);
export const ZO = isoDag(WOENSDAG, 4);
export const alsLijst = (iso) => { const [j, m, d] = iso.split('-').map(Number); return `${d}/${m}/${j}`; };
// 10:00 UTC is in Brussel 11 of 12 uur; 13:00 UTC is 14 of 15 uur.
export const VOOR_14 = new Date(`${isoDag(WOENSDAG)}T10:00:00Z`);
export const NA_14 = new Date(`${isoDag(WOENSDAG)}T13:00:00Z`);

export const CLUB = 'BVBL1125';

export const LINK = 'https://mcusercontent.com/f68d849bc654ee744db427f33/files/abc-123/Weekend_test.xlsx';

// ---- Een xlsx bouwen -------------------------------------------------------
function zip(bestanden, { opgeslagen = false } = {}) {
  const lokaal = [];
  const centraal = [];
  let offset = 0;
  for (const [naam, inhoud] of Object.entries(bestanden)) {
    const data = Buffer.from(inhoud, 'utf8');
    const gecomprimeerd = opgeslagen ? data : deflateRawSync(data);
    const naamBuf = Buffer.from(naam, 'utf8');
    const kop = Buffer.alloc(30);
    kop.writeUInt32LE(0x04034b50, 0); kop.writeUInt16LE(20, 4); kop.writeUInt16LE(opgeslagen ? 0 : 8, 8);
    kop.writeUInt32LE(crc32(data), 14); kop.writeUInt32LE(gecomprimeerd.length, 18);
    kop.writeUInt32LE(data.length, 22); kop.writeUInt16LE(naamBuf.length, 26);
    lokaal.push(kop, naamBuf, gecomprimeerd);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
    c.writeUInt16LE(opgeslagen ? 0 : 8, 10); c.writeUInt32LE(crc32(data), 16);
    c.writeUInt32LE(gecomprimeerd.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(naamBuf.length, 28); c.writeUInt32LE(offset, 42);
    centraal.push(c, naamBuf);
    offset += 30 + naamBuf.length + gecomprimeerd.length;
  }
  const cd = Buffer.concat(centraal);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(bestanden).length, 8);
  eocd.writeUInt16LE(Object.keys(bestanden).length, 10); eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...lokaal, cd, eocd]);
}

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const KOP = ['Code', 'Datum', 'Tijd', 'Niveau/Subniveau', 'Divisie', 'Reeks', 'Thuis ploeg', 'Uit ploeg',
  'Accommodatie', 'Official 1', 'Official 2'];

/**
 * Rijen als { datum, tijd, reeks, thuis, uit, o1, o2 } met o1/o2 = 'grijs' of ''.
 * Stijlen: 0 geen, 1 blauw (kop), 2 wit, 3 grijs, 4 rood (Code-kolom, zoals echt).
 */
export function bouwXlsx(rijen, { kop = KOP, rijKleur = 2, opgeslagen = false } = {}) {
  const gedeeld = [];
  const s = (tekst) => { let i = gedeeld.indexOf(tekst); if (i < 0) { i = gedeeld.length; gedeeld.push(tekst); } return i; };
  const kolom = (i) => String.fromCharCode(65 + i);
  const cel = (r, i, waarde, stijl) => (waarde === ''
    ? `<c r="${kolom(i)}${r}" s="${stijl}"/>`
    : `<c r="${kolom(i)}${r}" s="${stijl}" t="s"><v>${s(waarde)}</v></c>`);

  const xmlRijen = [`<row r="1">${kop.map((k, i) => cel(1, i, k, 1)).join('')}</row>`];
  rijen.forEach((w, n) => {
    const r = n + 2;
    const waarden = ['', w.datum, w.tijd, 'Vlaanderen', 'U16 3/4', w.reeks ?? '', w.thuis, w.uit ?? 'Gast', 'Zaal', '', ''];
    const stijlen = waarden.map((_, i) => (i === 0 ? 4 : rijKleur));
    if (w.o1 === 'grijs') stijlen[9] = 3;
    if (w.o2 === 'grijs') stijlen[10] = 3;
    xmlRijen.push(`<row r="${r}">${waarden.map((v, i) => cel(r, i, v, stijlen[i])).join('')}</row>`);
  });

  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'xl/workbook.xml': `<?xml version="1.0"?><workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Aanduidingen" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst ${ns}>${gedeeld.map((g) => `<si><t>${xmlEsc(g)}</t></si>`).join('')}</sst>`,
    'xl/styles.xml': `<?xml version="1.0"?><styleSheet ${ns}><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF578EBE"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFCCCCCC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7505A"/></patternFill></fill></fills><cellXfs count="5"><xf fillId="0"/><xf fillId="2"/><xf fillId="3"/><xf fillId="4"/><xf fillId="5"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet ${ns}><sheetData>${xmlRijen.join('')}</sheetData></worksheet>`,
  }, { opgeslagen });
}

// ---- Een mail bouwen, zoals Mailchimp ze stuurt ----------------------------
function qp(tekst) {
  // Lange regels afbreken met een zachte regelbreuk, net als het origineel.
  return tekst.replace(/=/g, '=3D').split('\n')
    .map((r) => (r.match(/.{1,70}/g) ?? ['']).join('=\n')).join('\n');
}
export function bouwMail({ van = 'Basketbal Vlaanderen <info@basketbal.vlaanderen>',
  onderwerp = '=?utf-8?Q?Wedstrijden=20zonder=20officials=20komend=20weekend=20&=20nieuws?=',
  link = LINK, inhoud = null, htmlInhoud = null } = {}) {
  const tekst = inhoud ?? `** Beste official\n\nOverzicht wedstrijden zonder officials (${link ?? 'geen link'})\n\nTot volgende week.`;
  const html = htmlInhoud ?? `<p><a href="https://vlaanderen.us3.list-manage.com/track/click?u=1&amp;id=2">Overzicht</a></p>`;
  return [
    `From: ${van}`, 'To: vbl@yoassist.org', `Subject: ${onderwerp}`, 'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="_----------=_MCPart_1"', '',
    'This is a multi-part message in MIME format', '',
    '--_----------=_MCPart_1', 'Content-Type: text/plain; charset="utf-8"; format="fixed"',
    'Content-Transfer-Encoding: quoted-printable', '', qp(tekst), '',
    '--_----------=_MCPart_1', 'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable', '', qp(html), '',
    '--_----------=_MCPart_1--', '',
  ].join('\r\n');
}
