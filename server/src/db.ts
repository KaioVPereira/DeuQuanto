import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Banco do servidor de sincronização (SQLite, um arquivo só). Fica num volume do Docker
 * fora da pasta do repositório — backup é copiar o arquivo.
 *
 *   lists        uma por lista compartilhada (código de convite + contador de seq)
 *   members      cada celular que entrou na lista (token guardado só como hash)
 *   entities     cabeçalho, itens e setores da lista; `fields` é JSON
 *   aliases      item duplicado (criado offline nos dois celulares) → id que sobreviveu
 *   applied_ops  alterações já aplicadas — reenvio da mesma op não aplica de novo
 *   app_releases versões do APK para download (mesmo esquema do Finanças/Games Trackers)
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS lists (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  seq         INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  closed_at   TEXT
);

CREATE TABLE IF NOT EXISTS members (
  id           TEXT PRIMARY KEY,
  list_id      TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  device_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  is_owner     INTEGER NOT NULL DEFAULT 0,
  token_hash   TEXT NOT NULL UNIQUE,
  joined_at    TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  removed_at   TEXT
);
CREATE INDEX IF NOT EXISTS ix_members_list ON members(list_id);

CREATE TABLE IF NOT EXISTS entities (
  list_id     TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  id          TEXT NOT NULL,
  fields      TEXT NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0,
  seq         INTEGER NOT NULL,
  created_by  TEXT,
  updated_by  TEXT,
  PRIMARY KEY (list_id, kind, id)
);
CREATE INDEX IF NOT EXISTS ix_entities_seq ON entities(list_id, seq);

CREATE TABLE IF NOT EXISTS aliases (
  list_id  TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  from_id  TEXT NOT NULL,
  to_id    TEXT NOT NULL,
  PRIMARY KEY (list_id, from_id)
);

CREATE TABLE IF NOT EXISTS applied_ops (
  op_id    TEXT NOT NULL,
  list_id  TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  at       TEXT NOT NULL,
  PRIMARY KEY (list_id, op_id)
);

CREATE TABLE IF NOT EXISTS app_releases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  version       TEXT NOT NULL,
  version_code  INTEGER NOT NULL UNIQUE,
  file_name     TEXT NOT NULL,
  notes         TEXT,
  published_at  TEXT NOT NULL
);
`

export type Db = DatabaseSync

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA)
  return db
}

/** Roda `fn` numa transação (o node:sqlite não tem helper próprio). */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
