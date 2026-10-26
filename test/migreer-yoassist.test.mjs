// tools/migreer-yoassist.mjs: een YOAssist-backup naar SQL voor TeamAssist.
//
// Getoetst met nagemaakte backups — de echte bevatten persoonsgegevens en
// horen niet in de repo. De echte zijn bij het bouwen van 0.31.0 wel door
// hetzelfde script gegaan (zie WIJZIGINGEN-0.31.0.md).

import test from 'node:test';
import assert from 'node:assert/strict';
import { maakDb } from './d1.mjs';
import {
  maakMigratie, deelOp, koppelPersonen, kanaalVoorkeur, mogelijkOuderadres,
  nieuweId, q, seizoenNaarTeamAssist,
} from '../tools/migreer-yoassist.mjs';

const SEIZOEN = '2026-27';
const PLOEG = 'BVBL1125G12  1';
const ANDERE_PLOEG = 'BVBL1125G10  2';

function gebruiker(over = {}) {
  return {
    email: 'anna@example.org', voornaam: 'Anna', achternaam: 'Peeters', is_admin: 0, profiel: 'YO',
    club_guid: 'BVBL1125', gsm: '+32470000000', actief: 1, kanaal_mail: 1, kanaal_push: 0,
    herinner_avond: 1, herinner_ochtend: 0, verborgen_tabs: '', gsm_delen: 1, agenda_sleutel: null,
    ...over,
  };
}

function wedstrijd(guid, thuis = PLOEG, over = {}) {
  return {
    guid, wed_id: guid, seizoen: '2627', club_guid: 'BVBL1125', thuis_guid: thuis, thuis_naam: 'Bears G12 A',
    uit_guid: 'BVBL1053G12  1', uit_naam: 'Gast G12', datum: '2026-11-14', uur: '10:00', locatie: 'Sporthal',
    acc_guid: 'ACC1', poule_naam: 'Poule', cat_code: 'G12', off_namen: '[]', off_aantal: 0, off_gewist: 0,
    scope: 1, scope_reden: 'auto', scope_op: '2026-09-01', scope_uit: 0, bron: 'vbl', hash: 'h', status: 'actief',
    laatst_gezien: '2026-10-25', aangemaakt: '2026-09-01', refs_bevestigd: 0, refs_bevestigd_door: null,
    refs_bevestigd_op: null, uitslag: null, forfait: null, bond_officials: null, ...over,
  };
}

function yoBackup(over = {}) {
  return {
    yoassist: { versie: '1.17.0', gemaaktOp: '2026-10-26T06:00:00Z', problemen: [] },
    gegevens: {
      settings: [
        { sleutel: 'facturatie_ontvangers', waarde: 'kas@example.org' },
        { sleutel: 'mail_afzender', waarde: 'oud@yoassist.org' },
      ],
      users: [
        gebruiker(),
        gebruiker({ email: 'Beheer@Example.org', voornaam: 'Bert', achternaam: 'Beheer', is_admin: 1, profiel: 'YO+', kanaal_push: 1, agenda_sleutel: 'sleutel-bert' }),
        gebruiker({ email: 'nieuw@example.org', voornaam: 'Nina', achternaam: 'Nieuw', profiel: 'YO+' }),
      ],
      teams: [
        { guid: PLOEG, naam: 'Bears G12 A', cat_code: 'G12', volgen: 1 },
        { guid: ANDERE_PLOEG, naam: 'Bears G10 B', cat_code: 'G10', volgen: 0 },
      ],
      matches: [wedstrijd('W1'), wedstrijd('W2', ANDERE_PLOEG, { cat_code: 'G10' })],
      availability: [
        { user_email: 'anna@example.org', match_guid: 'W1', status: 'ja', updated_at: '2026-10-01' },
        { user_email: 'nieuw@example.org', match_guid: 'W2', status: 'nee', updated_at: '2026-10-02' },
      ],
      assignments: [
        { match_guid: 'W1', user_email: 'anna@example.org', status: 'toegewezen', toegewezen_door: 'beheer@example.org', toegewezen_op: '2026-10-03', gewijzigd_op: null },
      ],
      problemen: [{ id: 1, match_guid: 'W1', user_email: 'anna@example.org', bericht: 'Te laat', gemeld_op: '2026-10-04', afgehandeld: 0 }],
      afgesloten_maanden: [{ maand: '2026-09', seizoen: '2627', afgesloten_op: '2026-10-06', afgesloten_door: 'beheer@example.org', totaal_cent: 3000, aantal_officials: 2, verstuurd_op: null, verstuurd_naar: null }],
      vergoeding_regels: [
        { id: 1, maand: '2026-09', user_email: 'anna@example.org', naam: 'Anna Peeters', soort: 'wedstrijd', betreft_maand: null, cat_code: 'G12', cat_label: 'U12', aantal: 1, tarief_cent: 1500, bedrag_cent: 1500 },
        { id: 2, maand: '2026-09', user_email: 'vertrokken@example.org', naam: 'Victor Weg', soort: 'wedstrijd', betreft_maand: null, cat_code: 'G12', cat_label: 'U12', aantal: 1, tarief_cent: 1500, bedrag_cent: 1500 },
      ],
      vergoeding_verwerkt: [{ match_guid: 'W0', user_email: 'anna@example.org', maand: '2026-09', cat_code: 'G12', tarief_cent: 1500, aantal: 1 }],
      volg_clubs: [{ guid: 'BVBL1053', naam: 'Tienen', toegevoegd_door: 'beheer@example.org', toegevoegd: '2026-08-28' }],
      volg_wedstrijden: [{ guid: 'V1', club_guid: 'BVBL1053', club_naam: 'Tienen', thuis_naam: 'A', uit_naam: 'B', datum: '2026-11-14', uur: '10:30', cat_code: 'J18', vbl_aantal: 0, laatst_gezien: '2026-10-26', vbl_naam: null, bond_officials: null }],
      vbl_lijsten: [{ id: 1, ontvangen: '2026-10-07 13:40:00', onderwerp: 'Lijst', bestand: 'x.xlsx', weekend_van: '2026-10-10', weekend_tot: '2026-10-11', aantal_rijen: 3, eigen: '[]', meldingen: null, status: 'verwerkt', fout: null, verwerkt_op: '2026-10-07 14:00', volg: null }],
      berichten: [
        // Een regel die op ';' eindigt, midden in de tekst: mag het opdelen niet breken.
        { id: 1, user_email: 'anna@example.org', soort: 'aanduiding', titel: "Je fluit zaterdag — d'Bears", tekst: 'Je fluit zaterdag.', match_guid: 'W1', verstuurd: '2026-10-03 10:00:00', kanalen: 'mail,push', gelezen_op: null, volledig: 'Dag Anna;\nJe fluit zaterdag;\nTot dan.' },
        { id: 2, user_email: 'vertrokken@example.org', soort: 'bericht', titel: 'x', tekst: 'x', match_guid: null, verstuurd: '2026-10-03', kanalen: 'mail', gelezen_op: null, volledig: null },
      ],
      logboek: [
        { id: 1, categorie: 'wedstrijd', soort: 'nieuw', match_guid: 'W1', wie: 'synchronisatie', veld: null, oud: null, nieuw: '2026-11-14 10:00', vastgesteld: '2026-08-26 13:31:17', afgehandeld: 0 },
        { id: 2, categorie: 'beheer', soort: 'club', match_guid: null, wie: 'beheer@example.org', veld: 'club toegevoegd', oud: null, nieuw: 'x', vastgesteld: '2026-08-26', afgehandeld: 1 },
      ],
      sync_runs: [{ id: 1 }],
      push_abonnementen: [{ id: 1 }],
      ...over,
    },
  };
}

// Een TeamAssist met Anna (op naam, zonder e-mail), Bert (op e-mail), één
// gevolgde ploeg met W1 al gesynchroniseerd. ANDERE_PLOEG en W2 ontbreken.
const TA_PERSONEN = [
  { id: 'p-anna', voornaam: 'Anna', achternaam: 'Peeters', email: null },
  { id: 'p-bert', voornaam: 'Bert', achternaam: 'Beheer', email: 'beheer@example.org' },
];

function taDb() {
  const db = maakDb();
  db._sqlite.exec(`
    INSERT INTO seizoenen (code, naam, actief) VALUES ('${SEIZOEN}', '2026-2027', 1);
    INSERT INTO teams (guid, seizoen, naam, categorie, gevolgd) VALUES ('${PLOEG}', '${SEIZOEN}', 'Bears G12 A', 'G12', 1);
    INSERT INTO personen (id, voornaam, achternaam) VALUES ('p-anna', 'Anna', 'Peeters');
    INSERT INTO personen (id, voornaam, achternaam, email) VALUES ('p-bert', 'Bert', 'Beheer', 'beheer@example.org');
    INSERT INTO wedstrijden (wedstrijd_guid, team_guid, seizoen, datum, begin, thuis) VALUES ('W1', '${PLOEG}', '${SEIZOEN}', '2026-11-14', '10:00', 1);
  `);
  const tabel = (n) => db._sqlite.prepare(`SELECT * FROM ${n}`).all().map((r) => ({ ...r }));
  const ta = {
    gemaakt: '2026-10-26T07:00:00Z',
    tabellen: { seizoenen: tabel('seizoenen'), teams: tabel('teams'), personen: tabel('personen'), wedstrijden: tabel('wedstrijden') },
  };
  return { db, ta, q: db._sqlite };
}

const tel = (q, sql) => q.prepare(sql).get().n;

// --- de bouwstenen ------------------------------------------------------------

test('een SQL-waarde verdubbelt een apostrof en kent NULL', () => {
  assert.equal(q("d'Bears"), "'d''Bears'");
  assert.equal(q(null), 'NULL');
  assert.equal(q(undefined), 'NULL');
  assert.equal(q(15), '15');
});

test('seizoenscode, kanaal en id', () => {
  assert.equal(seizoenNaarTeamAssist('2627'), '2026-27');
  assert.equal(seizoenNaarTeamAssist('x'), null);
  assert.equal(kanaalVoorkeur({ kanaal_mail: 1, kanaal_push: 1 }), 'beide');
  assert.equal(kanaalVoorkeur({ kanaal_mail: 0, kanaal_push: 1 }), 'push');
  assert.equal(kanaalVoorkeur({ kanaal_mail: 0, kanaal_push: 0 }), 'mail', 'nooit niets');
  assert.equal(nieuweId('A@b.c'), nieuweId('a@b.c'), 'hetzelfde adres, dezelfde id');
});

test('een adres dat niet bij de naam past, is mogelijk dat van een ouder', () => {
  assert.equal(mogelijkOuderadres('ruudcuyvers@gmail.com', 'Max', 'Cuyvers'), true);
  assert.equal(mogelijkOuderadres('tlauwers@hotmail.com', 'Tim', 'Lauwers'), false);
  assert.equal(mogelijkOuderadres('jonas.boeykens@hotmail.com', 'Jonas', 'Boeykens'), false);
});

test('koppelen: e-mail, dan naam zonder e-mail; een naamgenoot met een ander adres of twee naamgenoten is twijfel', () => {
  const personen = [
    ...TA_PERSONEN,
    { id: 'p-carl', voornaam: 'Carl', achternaam: 'Claes', email: 'carl@elders.org' },
    { id: 'p-dirk1', voornaam: 'Dirk', achternaam: 'Dubbel', email: null },
    { id: 'p-dirk2', voornaam: 'Dirk', achternaam: 'Dubbel', email: null },
  ];
  const uit = koppelPersonen(
    [
      gebruiker(),
      gebruiker({ email: 'BEHEER@example.org', voornaam: 'Iemand', achternaam: 'Anders' }),
      gebruiker({ email: 'carl@hier.org', voornaam: 'Carl', achternaam: 'Claes' }),
      gebruiker({ email: 'dirk@hier.org', voornaam: 'Dirk', achternaam: 'Dubbel' }),
    ],
    personen
  );
  assert.deepEqual(uit.map((k) => [k.persoon_id, k.hoe]), [
    ['p-anna', 'naam'],
    ['p-bert', 'email'],
    [nieuweId('carl@hier.org'), 'nieuw'],
    [nieuweId('dirk@hier.org'), 'nieuw'],
  ]);
  assert.match(uit[2].twijfel, /ander e-mailadres/);
  assert.match(uit[3].twijfel, /2 personen/);
});

// --- het geheel ------------------------------------------------------------------

test('na het script hangt alles aan de juiste persoon en wedstrijd', () => {
  const { ta, q: db } = taDb();
  const { sql } = maakMigratie(yoBackup(), ta);
  db.exec(sql);

  // Personen: Anna kreeg haar adres, Nina is nieuw, Bert behield zijn rij.
  assert.equal(db.prepare(`SELECT email FROM personen WHERE id = 'p-anna'`).get().email, 'anna@example.org');
  const nina = db.prepare(`SELECT * FROM personen WHERE email = 'nieuw@example.org'`).get();
  assert.equal(nina.id, nieuweId('nieuw@example.org'));
  const bert = db.prepare(`SELECT * FROM personen WHERE id = 'p-bert'`).get();
  assert.equal(bert.kanaal_voorkeur, 'beide');
  assert.equal(bert.agenda_sleutel, 'sleutel-bert', 'het agenda-abonnement blijft werken');

  const rollen = db.prepare(`SELECT persoon_id, rol FROM rollen ORDER BY persoon_id, rol`).all().map((r) => `${r.persoon_id}:${r.rol}`);
  assert.deepEqual(rollen, ['p-anna:YO', 'p-bert:YOADM', 'p-bert:YOPLUS', `${nina.id}:YOPLUS`]);
  assert.equal(db.prepare(`SELECT herinner_ochtend FROM officials_voorkeuren WHERE persoon_id = 'p-anna'`).get().herinner_ochtend, 0);

  // De ontbrekende ploeg komt erbij, niet gevolgd, zonder officials (volgen = 0).
  const ander = db.prepare(`SELECT gevolgd, officials FROM teams WHERE guid = ?`).get(ANDERE_PLOEG);
  assert.deepEqual({ ...ander }, { gevolgd: 0, officials: 0 });

  // W2 ontbrak en komt erbij, als thuiswedstrijd van die ploeg.
  const w2 = db.prepare(`SELECT * FROM wedstrijden WHERE wedstrijd_guid = 'W2'`).get();
  assert.equal(w2.team_guid, ANDERE_PLOEG);
  assert.equal(w2.thuis, 1);
  assert.equal(w2.tegenstander, 'Gast G12');
  assert.equal(tel(db, `SELECT count(*) AS n FROM officials_wedstrijd`), 2);

  const aanduiding = db.prepare(`
    SELECT a.persoon_id, a.toegewezen_door, w.wedstrijd_guid FROM officials_aanduidingen a
      JOIN wedstrijden w ON w.id = a.wedstrijd_id`).get();
  assert.deepEqual({ ...aanduiding }, { persoon_id: 'p-anna', toegewezen_door: 'p-bert', wedstrijd_guid: 'W1' });
  assert.equal(tel(db, `SELECT count(*) AS n FROM officials_beschikbaarheid`), 2);
  assert.equal(tel(db, `SELECT count(*) AS n FROM officials_problemen`), 1);

  // Facturatie: een vertrokken official blijft staan, met zijn adres als spoor.
  const regels = db.prepare(`SELECT persoon_id FROM officials_vergoeding_regels ORDER BY id`).all().map((r) => r.persoon_id);
  assert.deepEqual(regels, ['p-anna', 'yoassist:vertrokken@example.org']);
  assert.equal(db.prepare(`SELECT seizoen, afgesloten_door FROM officials_maanden`).get().seizoen, '2026-27');

  // Berichten: enkel van wie meekomt, met de volledige tekst als inhoud.
  const bericht = db.prepare(`SELECT * FROM berichten`).all();
  assert.equal(bericht.length, 1);
  assert.equal(bericht[0].kanaal, 'mail');
  assert.equal(bericht[0].kort, 'Je fluit zaterdag.');
  assert.match(bericht[0].inhoud, /Tot dan/);

  // Logboek: enkel wat openstond.
  assert.equal(tel(db, `SELECT count(*) AS n FROM logboek WHERE soort = 'officials'`), 1);

  // Instellingen: facturatie_ontvangers mee, de afzender niet.
  assert.equal(db.prepare(`SELECT waarde FROM instellingen WHERE sleutel = 'facturatie_ontvangers'`).get().waarde, 'kas@example.org');
  assert.notEqual(db.prepare(`SELECT waarde FROM instellingen WHERE sleutel = 'mail_afzender'`).get().waarde, 'oud@yoassist.org');

  assert.deepEqual(db.prepare(`PRAGMA foreign_key_check`).all(), []);
});

test('twee keer uitvoeren maakt geen enkele dubbele rij', () => {
  const { ta, q: db } = taDb();
  const { sql } = maakMigratie(yoBackup(), ta);
  db.exec(sql);
  const tabellen = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => r.name);
  const stand = () => Object.fromEntries(tabellen.map((t) => [t, tel(db, `SELECT count(*) AS n FROM "${t}"`)]));
  const na1 = stand();
  db.exec(sql);
  assert.deepEqual(stand(), na1);
});

test('in delen uitgevoerd geeft hetzelfde als in één keer, ook met een bericht vol puntkomma\'s', () => {
  const geheel = taDb();
  const migratie = maakMigratie(yoBackup(), geheel.ta);
  geheel.q.exec(migratie.sql);

  const gedeeld = taDb();
  const delen = deelOp(maakMigratie(yoBackup(), gedeeld.ta), 2000);
  assert.ok(delen.length > 3, 'klein genoeg om echt te delen');
  for (const d of delen) gedeeld.q.exec(d);

  const inhoud = (q) => q.prepare(`SELECT persoon_id, inhoud FROM berichten`).all().map((r) => ({ ...r }));
  assert.deepEqual(inhoud(gedeeld.q), inhoud(geheel.q));
  for (const t of ['personen', 'rollen', 'officials_wedstrijd', 'officials_aanduidingen', 'logboek']) {
    assert.equal(tel(gedeeld.q, `SELECT count(*) AS n FROM ${t}`), tel(geheel.q, `SELECT count(*) AS n FROM ${t}`), t);
  }
});

test('het rapport noemt elke gebruiker, wat niet meekomt en waarom', () => {
  const { ta } = taDb();
  const { rapport, telling } = maakMigratie(yoBackup(), ta);
  assert.match(rapport, /Anna Peeters .*op naam/);
  assert.match(rapport, /Bert Beheer .*op e-mailadres/);
  assert.match(rapport, /Nina Nieuw .*nieuwe persoon/);
  assert.deepEqual(telling.berichten, { bron: 2, mee: 1, niet: 1 });
  assert.equal(telling.logboek.niet, 1);
  assert.match(telling.push_abonnementen.reden, /oude domein/);
  assert.match(rapport, /1 ploeg\(en\) kwamen nog niet voor/);
});

test('een wedstrijd uit een ander seizoen gaat niet mee en staat in het rapport', () => {
  const { ta } = taDb();
  const yo = yoBackup();
  yo.gegevens.matches.push(wedstrijd('W-OUD', PLOEG, { seizoen: '2526' }));
  const { telling, rapport } = maakMigratie(yo, ta);
  assert.equal(telling.matches.niet, 1);
  assert.match(rapport, /W-OUD: seizoen 2526/);
});

test('een deel breekt nooit midden in een tekst, ook niet bij een heel kleine grens', () => {
  // Met een grens van 1 teken wordt elke opdracht een eigen deel. Werd er per
  // regel gedeeld, dan viel het bericht met regeleinden in stukken, elk met
  // een onpaar aantal apostrofs — en elk stuk apart faalt in de D1-console.
  const { ta } = taDb();
  const delen = deelOp(maakMigratie(yoBackup(), ta), 1);
  for (const d of delen) {
    assert.equal((d.match(/'/g) ?? []).length % 2, 0, `een deel met een open tekst:\n${d.slice(0, 200)}`);
  }
  assert.ok(delen.some((d) => d.includes('Dag Anna;\nJe fluit zaterdag;')), 'het bericht staat heel in één deel');
});
