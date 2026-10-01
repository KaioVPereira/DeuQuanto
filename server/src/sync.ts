import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { tx, type Db } from './db.ts'
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  LIST_ENTITY_ID,
  type Alias,
  type Entity,
  type EntityKind,
  type JoinResponse,
  type Member,
  type Op,
  type ShareRequest,
  type ShareResponse,
  type SyncRequest,
  type SyncResponse,
} from '../../shared/protocol.ts'

/** Teto por lista: protege o servidor de um cliente com defeito mandando lixo sem fim. */
export const MAX_ITEMS_PER_LIST = 1000
export const MAX_OPS_PER_REQUEST = 2000

export class SyncError extends Error {
  status: number
  code: 'closed' | 'removed' | 'unauthorized' | 'not_found' | 'invalid' | 'forbidden'
  constructor(status: number, code: SyncError['code'], message?: string) {
    super(message ?? code)
    this.status = status
    this.code = code
  }
}

export interface MemberRow {
  id: string
  list_id: string
  device_id: string
  name: string
  is_owner: number
  removed_at: string | null
}

interface EntityRow {
  kind: EntityKind
  id: string
  fields: string
  deleted: number
  seq: number
  created_by: string | null
  updated_by: string | null
}

const now = () => new Date().toISOString()
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const newToken = () => randomBytes(32).toString('base64url')

function newCode(db: Db): string {
  const taken = db.prepare('SELECT 1 FROM lists WHERE code = ?')
  for (;;) {
    let code = ''
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    if (!taken.get(code)) return code
  }
}

// ---------- Validação de campos ----------
// O que vem do celular passa por aqui: campo desconhecido ou com tipo errado é descartado
// (não derruba a requisição — um app mais novo pode mandar campo que este servidor não conhece).

const str = (max: number) => (v: unknown) => (typeof v === 'string' ? v.slice(0, max) : undefined)
const strOrNull = (max: number) => (v: unknown) => (v === null ? null : str(max)(v))
const num = (min: number, max: number) => (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined)
const numOrNull = (min: number, max: number) => (v: unknown) => (v === null ? null : num(min, max)(v))
const int = (min: number, max: number) => (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined)
const intOrNull = (min: number, max: number) => (v: unknown) => (v === null ? null : int(min, max)(v))
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
const httpUrlOrNull = (v: unknown) => (v === null ? null : typeof v === 'string' && /^https?:\/\//i.test(v) && v.length <= 600 ? v : undefined)
const market = (v: unknown) => {
  if (v === null) return null
  if (!v || typeof v !== 'object') return undefined
  const m = v as Record<string, unknown>
  const name = str(80)(m.name)
  if (!name) return undefined
  const out: Record<string, string> = { name }
  const address = str(160)(m.address)
  const osmId = str(40)(m.osmId)
  if (address) out.address = address
  if (osmId) out.osmId = osmId
  return out
}

const FIELD_RULES: Record<EntityKind, Record<string, (v: unknown) => unknown>> = {
  list: { name: str(80), date, finishedAt: strOrNull(40), market },
  item: {
    productKey: str(120),
    name: str(120),
    sectorId: str(64),
    unit: str(8),
    qty: num(0, 1_000_000),
    expectedPrice: intOrNull(0, 1_000_000_000),
    checked: bool,
    actualQty: numOrNull(0, 1_000_000),
    actualPrice: intOrNull(0, 1_000_000_000),
    checkedAt: strOrNull(40),
    image: httpUrlOrNull,
  },
  sector: { name: str(40), emoji: str(16) },
}

export function sanitize(kind: EntityKind, input: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!input || typeof input !== 'object') return out
  const rules = FIELD_RULES[kind]
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const rule = rules[key]
    if (!rule) continue
    const clean = rule(value)
    if (clean !== undefined) out[key] = clean
  }
  return out
}

const ITEM_DEFAULTS = {
  sectorId: 'outros',
  unit: 'un',
  qty: 1,
  expectedPrice: null,
  checked: false,
  actualQty: null,
  actualPrice: null,
  checkedAt: null,
  image: null,
}

/** Item só nasce com nome; o resto ganha padrão. */
function completeNew(kind: EntityKind, fields: Record<string, unknown>): Record<string, unknown> | null {
  if (kind === 'item') {
    if (!fields.name || !fields.productKey) return null
    return { ...ITEM_DEFAULTS, ...fields }
  }
  if (kind === 'sector') return fields.name ? { emoji: '📦', ...fields } : null
  return fields
}

const isKind = (k: unknown): k is EntityKind => k === 'list' || k === 'item' || k === 'sector'

// ---------- Leitura ----------

function toEntity(row: EntityRow): Entity {
  return {
    kind: row.kind,
    id: row.id,
    fields: JSON.parse(row.fields) as Record<string, unknown>,
    deleted: row.deleted === 1,
    seq: row.seq,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  }
}

export function membersOf(db: Db, listId: string): Member[] {
  const rows = db
    .prepare('SELECT id, name, is_owner FROM members WHERE list_id = ? AND removed_at IS NULL ORDER BY is_owner DESC, joined_at')
    .all(listId) as { id: string; name: string; is_owner: number }[]
  return rows.map((r) => ({ id: r.id, name: r.name, isOwner: r.is_owner === 1 }))
}

function changesSince(db: Db, listId: string, since: number): Entity[] {
  // Primeira carga não precisa das lápides (itens removidos).
  const sql =
    since > 0
      ? 'SELECT kind, id, fields, deleted, seq, created_by, updated_by FROM entities WHERE list_id = ? AND seq > ? ORDER BY seq'
      : 'SELECT kind, id, fields, deleted, seq, created_by, updated_by FROM entities WHERE list_id = ? AND seq > ? AND deleted = 0 ORDER BY seq'
  return (db.prepare(sql).all(listId, since) as unknown as EntityRow[]).map(toEntity)
}

const currentSeq = (db: Db, listId: string) => (db.prepare('SELECT seq FROM lists WHERE id = ?').get(listId) as { seq: number }).seq

function nextSeq(db: Db, listId: string): number {
  const row = db.prepare('UPDATE lists SET seq = seq + 1, updated_at = ? WHERE id = ? RETURNING seq').get(now(), listId) as { seq: number }
  return row.seq
}

// ---------- Escrita ----------

function insertEntity(db: Db, listId: string, kind: EntityKind, id: string, fields: Record<string, unknown>, memberId: string) {
  db.prepare('INSERT INTO entities (list_id, kind, id, fields, deleted, seq, created_by, updated_by) VALUES (?, ?, ?, ?, 0, ?, ?, ?)').run(
    listId,
    kind,
    id,
    JSON.stringify(fields),
    nextSeq(db, listId),
    memberId,
    memberId,
  )
}

function getEntity(db: Db, listId: string, kind: EntityKind, id: string): EntityRow | undefined {
  return db.prepare('SELECT kind, id, fields, deleted, seq, created_by, updated_by FROM entities WHERE list_id = ? AND kind = ? AND id = ?').get(listId, kind, id) as
    | EntityRow
    | undefined
}

function writeFields(db: Db, listId: string, row: EntityRow, fields: Record<string, unknown>, memberId: string) {
  db.prepare('UPDATE entities SET fields = ?, seq = ?, updated_by = ? WHERE list_id = ? AND kind = ? AND id = ?').run(
    JSON.stringify(fields),
    nextSeq(db, listId),
    memberId,
    listId,
    row.kind,
    row.id,
  )
}

const resolveAlias = (db: Db, listId: string, id: string) =>
  (db.prepare('SELECT to_id FROM aliases WHERE list_id = ? AND from_id = ?').get(listId, id) as { to_id: string } | undefined)?.to_id

/**
 * Aplica uma alteração. Regras:
 *  - campo a campo: só os campos enviados mudam; no mesmo campo, ganha quem chegou por último;
 *  - removido é definitivo: `set` num item removido é ignorado;
 *  - item novo com o mesmo produto de um item que já está na lista (os dois adicionaram
 *    "Leite" sem internet) vira o mesmo item, com a MAIOR quantidade — somar quase sempre
 *    estaria errado, porque os dois lembraram da mesma coisa.
 */
function applyOp(db: Db, listId: string, memberId: string, op: Op, aliases: Map<string, string>) {
  if (!isKind(op.kind) || typeof op.id !== 'string' || !op.id || op.id.length > 64) return
  const kind = op.kind
  let id = kind === 'list' ? LIST_ENTITY_ID : op.id
  if (kind === 'item') {
    const target = resolveAlias(db, listId, id)
    if (target) {
      aliases.set(id, target)
      id = target
    }
  }
  const row = getEntity(db, listId, kind, id)

  if (op.del) {
    // Só item se remove; cabeçalho e setores ficam.
    if (kind !== 'item' || !row || row.deleted) return
    db.prepare('UPDATE entities SET deleted = 1, seq = ?, updated_by = ? WHERE list_id = ? AND kind = ? AND id = ?').run(nextSeq(db, listId), memberId, listId, kind, id)
    return
  }

  const set = sanitize(kind, op.set)
  if (Object.keys(set).length === 0) return

  if (row) {
    if (row.deleted) return
    const current = JSON.parse(row.fields) as Record<string, unknown>
    const merged = { ...current, ...set }
    if (JSON.stringify(merged) === row.fields) return
    writeFields(db, listId, row, merged, memberId)
    return
  }

  const fresh = completeNew(kind, set)
  if (!fresh) return

  if (kind === 'item') {
    const twin = db
      .prepare("SELECT kind, id, fields, deleted, seq, created_by, updated_by FROM entities WHERE list_id = ? AND kind = 'item' AND deleted = 0 AND json_extract(fields, '$.productKey') = ?")
      .get(listId, fresh.productKey as string) as EntityRow | undefined
    if (twin) {
      const current = JSON.parse(twin.fields) as Record<string, unknown>
      const merged = {
        ...current,
        qty: Math.max(Number(current.qty) || 0, Number(fresh.qty) || 0),
        expectedPrice: current.expectedPrice ?? fresh.expectedPrice ?? null,
        image: current.image ?? fresh.image ?? null,
      }
      db.prepare('INSERT OR REPLACE INTO aliases (list_id, from_id, to_id) VALUES (?, ?, ?)').run(listId, id, twin.id)
      aliases.set(id, twin.id)
      // Sobe o seq mesmo sem mudar nada: quem mandou o duplicado precisa receber o item que ficou.
      writeFields(db, listId, twin, merged, memberId)
      return
    }
    const count = (db.prepare("SELECT COUNT(*) AS n FROM entities WHERE list_id = ? AND kind = 'item' AND deleted = 0").get(listId) as { n: number }).n
    if (count >= MAX_ITEMS_PER_LIST) return
  }

  insertEntity(db, listId, kind, id, fresh, memberId)
}

function applyOps(db: Db, listId: string, memberId: string, ops: Op[]): Alias[] {
  const aliases = new Map<string, string>()
  const seen = db.prepare('SELECT 1 FROM applied_ops WHERE list_id = ? AND op_id = ?')
  const mark = db.prepare('INSERT INTO applied_ops (list_id, op_id, at) VALUES (?, ?, ?)')
  for (const op of ops.slice(0, MAX_OPS_PER_REQUEST)) {
    if (!op || typeof op.opId !== 'string' || !op.opId || op.opId.length > 64) continue
    if (seen.get(listId, op.opId)) {
      // Reenvio (a resposta anterior se perdeu): não aplica de novo, mas o celular ainda
      // precisa saber se aquele item virou outro.
      if (op.kind === 'item' && typeof op.id === 'string') {
        const target = resolveAlias(db, listId, op.id)
        if (target) aliases.set(op.id, target)
      }
      continue
    }
    applyOp(db, listId, memberId, op, aliases)
    mark.run(listId, op.opId, now())
  }
  return [...aliases].map(([from, to]) => ({ from, to }))
}

// ---------- Operações da API ----------

export function shareList(db: Db, req: ShareRequest): ShareResponse {
  const name = str(40)(req?.name)?.trim()
  const deviceId = str(64)(req?.deviceId)
  if (!name || !deviceId || !Array.isArray(req.entities)) throw new SyncError(400, 'invalid', 'Faltam nome, aparelho ou itens.')
  return tx(db, () => {
    const listId = randomUUID()
    const memberId = randomUUID()
    const token = newToken()
    const code = newCode(db)
    const at = now()
    db.prepare('INSERT INTO lists (id, code, seq, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(listId, code, at, at)
    db.prepare('INSERT INTO members (id, list_id, device_id, name, is_owner, token_hash, joined_at, last_seen_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)').run(
      memberId,
      listId,
      deviceId,
      name,
      hashToken(token),
      at,
      at,
    )
    // A lista que já existia no celular entra inteira, como se fossem alterações da dona.
    const ops: Op[] = req.entities.slice(0, MAX_OPS_PER_REQUEST).map((e, i) => ({ opId: `share-${i}`, kind: e?.kind, id: e?.id, set: e?.fields }))
    applyOps(db, listId, memberId, ops)
    // O que já estava na lista não foi "adicionado por" ninguém: o selo de quem adicionou
    // só aparece no que entrar depois de compartilhar (senão quem entra vê o selo em tudo).
    db.prepare('UPDATE entities SET created_by = NULL, updated_by = NULL WHERE list_id = ?').run(listId)
    return { listId, code, token, memberId, seq: currentSeq(db, listId), members: membersOf(db, listId) }
  })
}

export function joinList(db: Db, rawCode: string, rawDeviceId: unknown, rawName: unknown): JoinResponse | null {
  const name = str(40)(rawName)?.trim()
  const deviceId = str(64)(rawDeviceId)
  if (!name || !deviceId) throw new SyncError(400, 'invalid', 'Faltam nome ou aparelho.')
  return tx(db, () => {
    const list = db.prepare('SELECT id, code FROM lists WHERE code = ? AND closed_at IS NULL').get(rawCode) as { id: string; code: string } | undefined
    if (!list) return null
    const token = newToken()
    const at = now()
    // Mesmo celular entrando de novo (abriu o link duas vezes, reinstalou): reaproveita o membro.
    const existing = db.prepare('SELECT id FROM members WHERE list_id = ? AND device_id = ?').get(list.id, deviceId) as { id: string } | undefined
    let memberId: string
    if (existing) {
      memberId = existing.id
      db.prepare('UPDATE members SET token_hash = ?, name = ?, removed_at = NULL, last_seen_at = ? WHERE id = ?').run(hashToken(token), name, at, memberId)
    } else {
      memberId = randomUUID()
      db.prepare('INSERT INTO members (id, list_id, device_id, name, is_owner, token_hash, joined_at, last_seen_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)').run(
        memberId,
        list.id,
        deviceId,
        name,
        hashToken(token),
        at,
        at,
      )
    }
    return {
      listId: list.id,
      code: list.code,
      token,
      memberId,
      seq: currentSeq(db, list.id),
      members: membersOf(db, list.id),
      entities: changesSince(db, list.id, 0),
    }
  })
}

/** Confere o token do celular para aquela lista. */
export function authenticate(db: Db, listId: string, token: string | null): MemberRow {
  if (!token) throw new SyncError(401, 'unauthorized')
  const member = db.prepare('SELECT id, list_id, device_id, name, is_owner, removed_at FROM members WHERE token_hash = ?').get(hashToken(token)) as MemberRow | undefined
  if (!member || member.list_id !== listId) throw new SyncError(401, 'unauthorized')
  const list = db.prepare('SELECT closed_at FROM lists WHERE id = ?').get(listId) as { closed_at: string | null } | undefined
  if (!list) throw new SyncError(404, 'not_found')
  if (list.closed_at) throw new SyncError(410, 'closed', 'A lista deixou de ser compartilhada.')
  if (member.removed_at) throw new SyncError(403, 'removed', 'Você foi removido da lista.')
  return member
}

export function sync(db: Db, member: MemberRow, req: SyncRequest): SyncResponse {
  const since = typeof req?.since === 'number' && req.since >= 0 ? req.since : 0
  const ops = Array.isArray(req?.ops) ? req.ops : []
  return tx(db, () => {
    const listId = member.list_id
    const name = str(40)(req?.name)?.trim()
    db.prepare('UPDATE members SET last_seen_at = ?, name = COALESCE(?, name) WHERE id = ?').run(now(), name || null, member.id)
    const aliases = applyOps(db, listId, member.id, ops)
    const code = (db.prepare('SELECT code FROM lists WHERE id = ?').get(listId) as { code: string }).code
    return { seq: currentSeq(db, listId), changes: changesSince(db, listId, since), members: membersOf(db, listId), aliases, code }
  })
}

/** Gera um código novo: o antigo para de funcionar (quem já entrou continua). */
export function regenerateCode(db: Db, member: MemberRow): string {
  if (!member.is_owner) throw new SyncError(403, 'forbidden', 'Só quem compartilhou pode trocar o código.')
  return tx(db, () => {
    const code = newCode(db)
    db.prepare('UPDATE lists SET code = ?, updated_at = ? WHERE id = ?').run(code, now(), member.list_id)
    return code
  })
}

/** Membro sai da lista; se for a dona, a lista deixa de ser compartilhada para todo mundo. */
export function leave(db: Db, member: MemberRow) {
  if (member.is_owner) db.prepare('UPDATE lists SET closed_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), member.list_id)
  else db.prepare('UPDATE members SET removed_at = ? WHERE id = ?').run(now(), member.id)
}

export function removeMember(db: Db, member: MemberRow, targetId: string) {
  if (!member.is_owner) throw new SyncError(403, 'forbidden', 'Só quem compartilhou pode remover pessoas.')
  if (targetId === member.id) throw new SyncError(400, 'invalid', 'Para sair, pare de compartilhar.')
  db.prepare('UPDATE members SET removed_at = ? WHERE id = ? AND list_id = ?').run(now(), targetId, member.list_id)
}

/** Limpeza diária: ops antigas (só servem para reenvio), listas encerradas e abandonadas. */
export function cleanup(db: Db) {
  const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
  db.prepare('DELETE FROM applied_ops WHERE at < ?').run(days(30))
  db.prepare('DELETE FROM lists WHERE closed_at IS NOT NULL AND closed_at < ?').run(days(30))
  db.prepare('DELETE FROM lists WHERE updated_at < ?').run(days(365))
}
