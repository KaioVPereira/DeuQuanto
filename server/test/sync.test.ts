import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb, type Db } from '../src/db.ts'
import { authenticate, joinList, leave, regenerateCode, removeMember, shareList, sync, SyncError, type MemberRow } from '../src/sync.ts'
import type { Entity, Op, ShareResponse } from '../../shared/protocol.ts'

const item = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  kind: 'item' as const,
  id,
  fields: { productKey: name.toLowerCase(), name, sectorId: 'frios', unit: 'un', qty: 1, expectedPrice: 500, checked: false, actualQty: null, actualPrice: null, checkedAt: null, image: null, ...extra },
})

let opSeq = 0
const op = (kind: Op['kind'], id: string, set: Record<string, unknown>): Op => ({ opId: `op${++opSeq}`, kind, id, set })
const del = (id: string): Op => ({ opId: `op${++opSeq}`, kind: 'item', id, del: true })

function setup() {
  const db = openDb(':memory:')
  const shared = shareList(db, {
    deviceId: 'cel-dela',
    name: 'Ana',
    entities: [{ kind: 'list', id: 'list', fields: { name: 'Compras 30/09', date: '2026-09-30', finishedAt: null, market: { name: 'Atacadão' } } }, item('i1', 'Leite'), item('i2', 'Arroz')],
  })
  const joined = joinList(db, shared.code, 'cel-dele', 'Kaio')!
  const ana = authenticate(db, shared.listId, shared.token)
  const kaio = authenticate(db, joined.listId, joined.token)
  return { db, shared, joined, ana, kaio }
}

const fieldsOf = (db: Db, m: MemberRow, id: string) => {
  const all = sync(db, m, { since: 0, ops: [] }).changes
  return all.find((e: Entity) => e.id === id)?.fields
}

test('compartilhar uma lista existente e entrar pelo código', () => {
  const { shared, joined } = setup()
  assert.equal(shared.code.length, 6)
  assert.equal(joined.listId, shared.listId)
  assert.deepEqual(
    joined.entities.map((e) => e.id).sort(),
    ['i1', 'i2', 'list'],
  )
  assert.deepEqual(
    joined.members.map((m) => [m.name, m.isOwner]),
    [
      ['Ana', true],
      ['Kaio', false],
    ],
  )
})

test('código aceita minúscula e traço; código errado não entra', () => {
  const db = openDb(':memory:')
  const shared = shareList(db, { deviceId: 'a', name: 'Ana', entities: [] })
  assert.equal(joinList(db, 'XXXXXX', 'b', 'Kaio'), null)
  assert.ok(joinList(db, shared.code, 'b', 'Kaio'))
})

test('campos diferentes do mesmo item: as duas alterações ficam', () => {
  const { db, ana, kaio } = setup()
  sync(db, ana, { since: 0, ops: [op('item', 'i1', { checked: true, actualPrice: 549, actualQty: 1 })] })
  sync(db, kaio, { since: 0, ops: [op('item', 'i1', { qty: 3 })] })
  const leite = fieldsOf(db, ana, 'i1')!
  assert.equal(leite.checked, true)
  assert.equal(leite.actualPrice, 549)
  assert.equal(leite.qty, 3)
})

test('mesmo campo: vale o que chegou por último no servidor', () => {
  const { db, ana, kaio } = setup()
  sync(db, ana, { since: 0, ops: [op('item', 'i1', { qty: 2 })] })
  sync(db, kaio, { since: 0, ops: [op('item', 'i1', { qty: 5 })] })
  assert.equal(fieldsOf(db, ana, 'i1')!.qty, 5)
})

test('remover é definitivo: edição depois da remoção é ignorada', () => {
  const { db, ana, kaio } = setup()
  sync(db, kaio, { since: 0, ops: [del('i2')] })
  const after = sync(db, ana, { since: 0, ops: [op('item', 'i2', { qty: 4 })] })
  const res = sync(db, ana, { since: 1, ops: [] })
  assert.ok(res.changes.find((e) => e.id === 'i2')?.deleted)
  // Primeira carga (since 0) não traz lápides.
  assert.equal(after.changes.find((e) => e.id === 'i2'), undefined)
})

test('reenvio da mesma op não aplica de novo (não desfaz alteração mais nova)', () => {
  const { db, ana, kaio } = setup()
  const mine = op('item', 'i1', { qty: 2 })
  sync(db, ana, { since: 0, ops: [mine] })
  sync(db, kaio, { since: 0, ops: [op('item', 'i1', { qty: 7 })] })
  sync(db, ana, { since: 0, ops: [mine] })
  assert.equal(fieldsOf(db, ana, 'i1')!.qty, 7)
})

test('os dois adicionaram o mesmo produto sem internet: vira um item, com a maior quantidade', () => {
  const { db, ana, kaio } = setup()
  const a = sync(db, ana, { since: 0, ops: [op('item', 'ana-cafe', item('ana-cafe', 'Café', { qty: 2 }).fields)] })
  assert.deepEqual(a.aliases, [])
  const kaioOp = op('item', 'kaio-cafe', item('kaio-cafe', 'Café', { qty: 1, expectedPrice: null }).fields)
  const k = sync(db, kaio, { since: 0, ops: [kaioOp] })
  assert.deepEqual(k.aliases, [{ from: 'kaio-cafe', to: 'ana-cafe' }])
  const cafes = k.changes.filter((e) => e.fields.productKey === 'café')
  assert.equal(cafes.length, 1)
  assert.equal(cafes[0].fields.qty, 2)
  assert.equal(cafes[0].fields.expectedPrice, 500)
  // Reenvio (resposta perdida) ainda informa o alias.
  assert.deepEqual(sync(db, kaio, { since: 0, ops: [kaioOp] }).aliases, [{ from: 'kaio-cafe', to: 'ana-cafe' }])
  // Edição pelo id antigo cai no item que sobreviveu.
  sync(db, kaio, { since: 0, ops: [op('item', 'kaio-cafe', { qty: 4 })] })
  assert.equal(fieldsOf(db, ana, 'ana-cafe')!.qty, 4)
})

test('since traz só o que mudou depois', () => {
  const { db, ana, kaio } = setup()
  const base = sync(db, kaio, { since: 0, ops: [] }).seq
  sync(db, ana, { since: base, ops: [op('item', 'i2', { checked: true })] })
  const res = sync(db, kaio, { since: base, ops: [] })
  assert.deepEqual(
    res.changes.map((e) => e.id),
    ['i2'],
  )
  assert.equal(res.changes[0].updatedBy, ana.id)
})

test('campos inválidos são descartados', () => {
  const { db, ana } = setup()
  sync(db, ana, { since: 0, ops: [op('item', 'i1', { image: 'javascript:alert(1)', qty: -3, hacker: true, name: 'Leite integral' })] })
  const leite = fieldsOf(db, ana, 'i1')!
  assert.equal(leite.image, null)
  assert.equal(leite.qty, 1)
  assert.equal(leite.hacker, undefined)
  assert.equal(leite.name, 'Leite integral')
})

test('cabeçalho da lista sincroniza (nome, mercado, finalizada)', () => {
  const { db, ana, kaio } = setup()
  sync(db, kaio, { since: 0, ops: [op('list', 'qualquer', { name: 'Mercado do mês', finishedAt: '2026-09-30T20:00:00Z' })] })
  const header = fieldsOf(db, ana, 'list')!
  assert.equal(header.name, 'Mercado do mês')
  assert.equal(header.finishedAt, '2026-09-30T20:00:00Z')
  assert.deepEqual(header.market, { name: 'Atacadão' })
})

test('token errado, membro removido e lista encerrada', () => {
  const { db, shared, joined, ana, kaio } = setup()
  assert.throws(() => authenticate(db, shared.listId, 'token-falso'), (e: SyncError) => e.status === 401)
  assert.throws(() => authenticate(db, shared.listId, null), (e: SyncError) => e.status === 401)
  assert.throws(() => removeMember(db, kaio, ana.id), (e: SyncError) => e.code === 'forbidden')
  removeMember(db, ana, kaio.id)
  assert.throws(() => authenticate(db, joined.listId, joined.token), (e: SyncError) => e.code === 'removed')
  assert.deepEqual(
    sync(db, ana, { since: 0, ops: [] }).members.map((m) => m.name),
    ['Ana'],
  )
  leave(db, ana)
  assert.throws(() => authenticate(db, shared.listId, shared.token), (e: SyncError) => e.code === 'closed')
})

test('entrar de novo pelo mesmo celular reaproveita o membro; código novo invalida o antigo', () => {
  const { db, shared, joined, ana } = setup()
  const again = joinList(db, shared.code, 'cel-dele', 'Kaio')!
  assert.equal(again.memberId, joined.memberId)
  assert.equal(again.members.length, 2)
  // O token antigo deixou de valer.
  assert.throws(() => authenticate(db, joined.listId, joined.token), (e: SyncError) => e.status === 401)
  const code = regenerateCode(db, ana)
  assert.notEqual(code, shared.code)
  assert.equal(joinList(db, shared.code, 'outro', 'Zé'), null)
  assert.ok(joinList(db, code, 'outro', 'Zé'))
})

test('saída de membro comum não encerra a lista', () => {
  const { db, shared, kaio } = setup()
  leave(db, kaio)
  const share: ShareResponse = shared
  assert.ok(authenticate(db, share.listId, share.token))
})
