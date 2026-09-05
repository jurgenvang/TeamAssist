// Een dunne schil die node:sqlite laat doorgaan voor D1.
//
// Zo draaien de tests tegen echt SQL en tegen het echte schema.sql, zonder
// netwerk en zonder dependencies. Dat laatste is bewust: in YOAssist vraagt
// better-sqlite3 een native build die niet overal lukt, waardoor `npm test`
// soms al bij het installeren strandt.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));

class Statement {
  constructor(sqlite, sql) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  #stmt() {
    return this.sqlite.prepare(this.sql);
  }

  async all() {
    const results = this.#stmt().all(...this.args);
    return { results, success: true, meta: {} };
  }

  async first(kolom) {
    const rij = this.#stmt().get(...this.args);
    if (!rij) return null;
    return kolom === undefined ? rij : rij[kolom];
  }

  async run() {
    const uit = this.#stmt().run(...this.args);
    return { success: true, meta: { changes: uit.changes, last_row_id: uit.lastInsertRowid } };
  }
}

export function maakDb({ metSchema = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  if (metSchema) {
    sqlite.exec(readFileSync(join(hier, '..', 'schema.sql'), 'utf8'));
  }
  return {
    prepare: (sql) => new Statement(sqlite, sql),
    exec: async (sql) => sqlite.exec(sql),
    _sqlite: sqlite,
  };
}
