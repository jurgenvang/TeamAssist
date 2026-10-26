// Een volledige backup van de databank, als één JSON-bestand.
//
// YOAssist leerde hier een harde les: een backup met een met de hand
// bijgehouden tabellenlijst bleef jarenlang achter zodra er een nieuwe tabel
// bijkwam, zonder dat iemand het merkte, tot een test het schema naast die
// lijst legde.
//
// Hier bestaat die lijst niet. De tabellen komen rechtstreeks uit
// sqlite_master van de echte databank, op het moment van de backup zelf — er
// is dus geen lijst die kán achterblijven. Een nieuwe tabel zit er de dag dat
// ze aangemaakt wordt automatisch bij, zonder dat deze route ooit aangepast
// hoeft te worden.

import { fout } from '../../lib/http.js';

// D1 zet zelf een tabel `_cf_KV` in sqlite_master, maar weigert elke lezing
// ervan ('not authorized'). Tot 0.30.1 liet die ene tabel de hele backup
// mislukken met een 500. Ze hoort niet bij onze gegevens.
export async function alleTabellen(db) {
  const rijen = await db
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_' AND substr(name, 1, 4) <> '_cf_'`
    )
    .all();
  return (rijen.results ?? []).map((r) => r.name);
}

export async function backupExporteren(ctx) {
  const { db } = ctx;
  const tabellen = await alleTabellen(db);
  if (!tabellen.length) return fout(500, 'geen enkele tabel gevonden — dit hoort niet te gebeuren');

  const backup = {};
  // Eén onleesbare tabel mag de rest niet tegenhouden: een backup met een gat
  // dat erin vermeld staat, is beter dan geen backup. Zoals in YOAssist.
  const problemen = [];
  for (const naam of tabellen) {
    // Tabelnamen kunnen niet als gebonden parameter meegegeven worden in SQL;
    // ze komen hier rechtstreeks uit sqlite_master, nooit van een aanroeper,
    // dus dat is veilig — het is altijd een naam die de databank zelf net gaf.
    try {
      const rijen = await db.prepare(`SELECT * FROM "${naam}"`).all();
      backup[naam] = rijen.results ?? [];
    } catch (e) {
      problemen.push({ tabel: naam, reden: String(e?.message || e) });
    }
  }

  const datum = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify({ gemaakt: new Date().toISOString(), problemen, tabellen: backup }, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="teamassist-backup-${datum}.json"`,
    },
  });
}
