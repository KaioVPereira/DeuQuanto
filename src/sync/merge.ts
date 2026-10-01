import type { Entity, JoinResponse, MarketRef, Op, SyncResponse } from '../../shared/protocol'
import type { CatalogEntry, ListItem, ListShare, Market, Sector, ShoppingList, Unit } from '@/lib/types'
import { UNITS } from '@/lib/types'
import { recordPaid, unrecordPaid, upsertMarket } from '@/lib/catalog'
import { todayIso, uid } from '@/lib/format'

/**
 * Junta no celular o que veio do servidor. Regra principal: campo que este celular mudou e
 * ainda não conseguiu enviar (está na fila) não é sobrescrito — senão a alteração "piscava"
 * e voltava ao valor antigo até a fila chegar no servidor.
 */

export interface MergeState {
  lists: ShoppingList[]
  sectors: Sector[]
  catalog: Record<string, CatalogEntry>
  markets: Market[]
  outbox: Record<string, Op[]>
}

/** O que outras pessoas mudaram, para o aviso "Ana adicionou 3 itens". */
export interface RemoteSummary {
  byMember: Record<string, { added: number; removed: number; checked: number; edited: number }>
}

const FALLBACK_SECTOR = 'outros'
const UNIT_SET = new Set<string>(UNITS.map((u) => u.value))

const asString = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback)
const asNumberOrNull = (v: unknown, fallback: number | null) => (v === null ? null : typeof v === 'number' ? v : fallback)

function addSector(sectors: Sector[], sector: Sector): Sector[] {
  // "Outros" fica sempre no fim.
  const idx = sectors.findIndex((x) => x.id === FALLBACK_SECTOR)
  const next = [...sectors]
  next.splice(idx < 0 ? next.length : idx, 0, sector)
  return next
}

function marketIdFor(markets: Market[], ref: unknown): { markets: Market[]; id: string | null } {
  if (!ref || typeof ref !== 'object') return { markets, id: null }
  const m = ref as MarketRef
  if (!m.name) return { markets, id: null }
  return upsertMarket(markets, { name: m.name, ...(m.address ? { address: m.address } : {}), ...(m.osmId ? { osmId: m.osmId } : {}) })
}

/** Campos do item vindos do servidor, menos os que estão pendentes aqui. */
function itemFrom(e: Entity, prev: ListItem | undefined, pending: Set<string> | undefined, sectors: Sector[]): ListItem {
  const f = e.fields
  const base: ListItem = prev ?? {
    id: e.id,
    productKey: '',
    name: '',
    sectorId: FALLBACK_SECTOR,
    unit: 'un',
    qty: 1,
    expectedPrice: null,
    checked: false,
    actualQty: null,
    actualPrice: null,
    checkedAt: null,
  }
  const take = <K extends keyof ListItem>(key: K, value: ListItem[K]): ListItem[K] => (pending?.has(key) || !(key in f) ? base[key] : value)
  const sectorId = take('sectorId', asString(f.sectorId, base.sectorId))
  const unit = take('unit', (UNIT_SET.has(f.unit as string) ? f.unit : base.unit) as Unit)
  return {
    ...base,
    id: e.id,
    productKey: take('productKey', asString(f.productKey, base.productKey)),
    name: take('name', asString(f.name, base.name)),
    // Setor que não existe aqui (não deveria acontecer: ele vem junto) cai em "Outros".
    sectorId: sectors.some((s) => s.id === sectorId) ? sectorId : FALLBACK_SECTOR,
    unit,
    qty: take('qty', typeof f.qty === 'number' ? f.qty : base.qty),
    expectedPrice: take('expectedPrice', asNumberOrNull(f.expectedPrice, base.expectedPrice)),
    checked: take('checked', typeof f.checked === 'boolean' ? f.checked : base.checked),
    actualQty: take('actualQty', asNumberOrNull(f.actualQty, base.actualQty)),
    actualPrice: take('actualPrice', asNumberOrNull(f.actualPrice, base.actualPrice)),
    checkedAt: take('checkedAt', f.checkedAt === null || typeof f.checkedAt === 'string' ? (f.checkedAt as string | null) : base.checkedAt),
    createdBy: e.createdBy ?? base.createdBy ?? null,
  }
}

/** Produto que chegou de outro celular e este ainda não conhecia: aprende setor, unidade e foto. */
function learn(catalog: Record<string, CatalogEntry>, item: ListItem, image: unknown): Record<string, CatalogEntry> {
  if (!item.productKey) return catalog
  const entry = catalog[item.productKey]
  const img = typeof image === 'string' ? image : null
  if (!entry) {
    return {
      ...catalog,
      [item.productKey]: { key: item.productKey, name: item.name, sectorId: item.sectorId, unit: item.unit, lastExpected: item.expectedPrice, paid: [], timesUsed: 0, image: img, webRef: null },
    }
  }
  // O que este celular já decidiu sobre o produto vale mais; só completa a foto que faltava.
  return !entry.image && img ? { ...catalog, [item.productKey]: { ...entry, image: img } } : catalog
}

/** Alterações deste celular ainda não enviadas, por entidade: quais campos, e se é remoção. */
function pendingIndex(ops: Op[]) {
  const fields = new Map<string, Set<string>>()
  const deleted = new Set<string>()
  for (const op of ops) {
    const key = `${op.kind}:${op.kind === 'list' ? 'list' : op.id}`
    if (op.del) deleted.add(key)
    for (const k of Object.keys(op.set ?? {})) {
      if (!fields.has(key)) fields.set(key, new Set())
      fields.get(key)!.add(k)
    }
  }
  return { fields, deleted }
}

/**
 * Aplica as entidades recebidas numa lista. Serve tanto para o sync de rotina quanto para
 * montar a lista de quem acabou de entrar (aí `list` é a lista vazia recém-criada).
 */
function applyEntities(state: MergeState, list: ShoppingList, entities: Entity[], pendingOps: Op[], me: string | null) {
  let { sectors, catalog, markets } = state
  let items = list.items
  let header: Partial<ShoppingList> = {}
  const summary: RemoteSummary = { byMember: {} }
  const bump = (member: string | null, key: keyof RemoteSummary['byMember'][string]) => {
    if (!member || member === me) return
    summary.byMember[member] ??= { added: 0, removed: 0, checked: 0, edited: 0 }
    summary.byMember[member][key]++
  }
  const pending = pendingIndex(pendingOps)

  // Setores primeiro: os itens podem depender deles.
  for (const e of entities) {
    if (e.kind !== 'sector' || e.deleted || sectors.some((s) => s.id === e.id)) continue
    sectors = addSector(sectors, { id: e.id, name: asString(e.fields.name, 'Setor'), emoji: asString(e.fields.emoji, '📦') })
  }

  for (const e of entities) {
    if (e.kind === 'list') {
      const f = e.fields
      const pf = pending.fields.get('list:list')
      if ('name' in f && !pf?.has('name')) header.name = asString(f.name, list.name)
      if ('date' in f && !pf?.has('date')) header.date = asString(f.date, list.date)
      if ('finishedAt' in f && !pf?.has('finishedAt')) header.finishedAt = f.finishedAt === null ? null : asString(f.finishedAt, list.finishedAt ?? '') || null
      if ('market' in f && !pf?.has('market')) {
        const r = marketIdFor(markets, f.market)
        markets = r.markets
        header.marketId = r.id
      }
      continue
    }
    if (e.kind !== 'item') continue

    const key = `item:${e.id}`
    const prev = items.find((i) => i.id === e.id)
    if (e.deleted) {
      if (!prev) continue
      items = items.filter((i) => i.id !== e.id)
      catalog = unrecordPaid(catalog, prev.productKey, list.id)
      bump(e.updatedBy, 'removed')
      continue
    }
    // Este celular removeu e a remoção ainda está na fila: o servidor vai apagar.
    if (pending.deleted.has(key)) continue

    const pf = pending.fields.get(key)
    const next = itemFrom(e, prev, pf, sectors)
    items = prev ? items.map((i) => (i.id === e.id ? next : i)) : [...items, next]
    catalog = learn(catalog, next, e.fields.image)

    // O preço pago por quem estava no mercado entra no histórico daqui também.
    const listForPaid = { id: list.id, date: header.date ?? list.date, marketId: header.marketId !== undefined ? header.marketId : list.marketId }
    if (next.checked && next.actualPrice != null && (!prev?.checked || prev.actualPrice !== next.actualPrice || prev.productKey !== next.productKey)) {
      catalog = recordPaid(catalog, next, listForPaid, next.actualPrice)
    } else if (prev?.checked && !next.checked) {
      catalog = unrecordPaid(catalog, prev.productKey, list.id)
    }

    if (!prev) bump(e.createdBy ?? e.updatedBy, 'added')
    else if (!prev.checked && next.checked) bump(e.updatedBy, 'checked')
    else if (JSON.stringify(prev) !== JSON.stringify(next)) bump(e.updatedBy, 'edited')
  }

  return { list: { ...list, ...header, items }, sectors, catalog, markets, summary }
}

/** Resultado de um sync: atualiza a lista, tira da fila o que o servidor confirmou. */
export function mergeSync(state: MergeState, listId: string, res: SyncResponse, sentOpIds: Set<string>): { patch: Partial<MergeState>; summary: RemoteSummary } | null {
  const list = state.lists.find((l) => l.id === listId)
  if (!list?.share) return null

  // Item que o servidor juntou com outro (os dois adicionaram o mesmo produto offline).
  const aliases = new Map(res.aliases.map((a) => [a.from, a.to]))
  let items = list.items
  for (const [from, to] of aliases) {
    if (!items.some((i) => i.id === from)) continue
    items = items.some((i) => i.id === to) ? items.filter((i) => i.id !== from) : items.map((i) => (i.id === from ? { ...i, id: to } : i))
  }

  const remaining = (state.outbox[listId] ?? []).filter((op) => !sentOpIds.has(op.opId)).map((op) => (op.kind === 'item' && aliases.has(op.id) ? { ...op, id: aliases.get(op.id)! } : op))

  const applied = applyEntities(state, { ...list, items }, res.changes, remaining, list.share.memberId)
  const share: ListShare = { ...list.share, seq: res.seq, members: res.members, code: res.code, lastSyncAt: new Date().toISOString() }
  return {
    patch: {
      lists: state.lists.map((l) => (l.id === listId ? { ...applied.list, share } : l)),
      sectors: applied.sectors,
      catalog: applied.catalog,
      markets: applied.markets,
      outbox: { ...state.outbox, [listId]: remaining },
    },
    summary: applied.summary,
  }
}

/**
 * Quem entrou pelo código: monta a lista local a partir do servidor. Se este celular já
 * tem essa lista (abriu o convite de novo), só troca o token e atualiza.
 */
export function mergeJoin(state: MergeState, res: JoinResponse): { patch: Partial<MergeState>; listId: string } {
  const existing = state.lists.find((l) => l.share?.remoteId === res.listId)
  const share: ListShare = {
    remoteId: res.listId,
    token: res.token,
    memberId: res.memberId,
    isOwner: res.members.some((m) => m.id === res.memberId && m.isOwner),
    code: res.code,
    seq: res.seq,
    members: res.members,
    lastSyncAt: new Date().toISOString(),
    ended: null,
  }
  // Abriu o convite de novo: o servidor manda a lista inteira (sem os removidos), então some
  // daqui o que não está lá — menos o que este celular criou e ainda não conseguiu enviar.
  const serverIds = new Set(res.entities.filter((e) => e.kind === 'item').map((e) => e.id))
  const pendingIds = new Set((existing ? (state.outbox[existing.id] ?? []) : []).filter((o) => o.kind === 'item' && !o.del).map((o) => o.id))
  const base: ShoppingList = existing
    ? { ...existing, share, items: existing.items.filter((i) => serverIds.has(i.id) || pendingIds.has(i.id)) }
    : { id: uid(), name: 'Lista compartilhada', date: todayIso(), createdAt: new Date().toISOString(), finishedAt: null, marketId: null, items: [], share }
  const applied = applyEntities(state, base, res.entities, existing ? (state.outbox[existing.id] ?? []) : [], res.memberId)
  const list = { ...applied.list, share }
  return {
    listId: list.id,
    patch: {
      lists: existing ? state.lists.map((l) => (l.id === existing.id ? list : l)) : [list, ...state.lists],
      sectors: applied.sectors,
      catalog: applied.catalog,
      markets: applied.markets,
    },
  }
}
