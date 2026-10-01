import type { ItemFields, ListFields, MarketRef, Op, ShareRequest } from '../../shared/protocol'
import { LIST_ENTITY_ID } from '../../shared/protocol'
import type { CatalogEntry, ListItem, Market, Sector, ShoppingList } from '@/lib/types'
import { uid } from '@/lib/format'

/** Monta as alterações que o celular manda para o servidor. Cada uma leva um id próprio. */

const opId = () => uid() + Math.random().toString(36).slice(2, 6)

export const DEFAULT_SECTOR_IDS = new Set(['hortifruti', 'mistura', 'frios', 'padaria', 'mercearia', 'bebidas', 'doces', 'salgados', 'congelados', 'limpeza', 'higiene', 'pet', 'outros'])

export function itemFields(item: ListItem, image: string | null): ItemFields {
  return {
    productKey: item.productKey,
    name: item.name,
    sectorId: item.sectorId,
    unit: item.unit,
    qty: item.qty,
    expectedPrice: item.expectedPrice,
    checked: item.checked,
    actualQty: item.actualQty,
    actualPrice: item.actualPrice,
    checkedAt: item.checkedAt,
    image,
  }
}

/** Item novo: vai inteiro. */
export function createItemOp(item: ListItem, image: string | null): Op {
  return { opId: opId(), kind: 'item', id: item.id, set: { ...itemFields(item, image) } }
}

/** Item que já existe: vai só o que mudou — é isso que deixa duas pessoas mexerem no mesmo item. */
export function patchItemOp(id: string, set: Partial<ItemFields>): Op {
  return { opId: opId(), kind: 'item', id, set }
}

export function deleteItemOp(id: string): Op {
  return { opId: opId(), kind: 'item', id, del: true }
}

export function listOp(set: Partial<ListFields>): Op {
  return { opId: opId(), kind: 'list', id: LIST_ENTITY_ID, set }
}

/**
 * Setor que o item usa. Os padrões têm o mesmo id em todo celular; um setor criado à mão
 * só existe no celular de quem criou, então ele vai junto para o outro lado criar igual.
 */
export function sectorOps(sectors: Sector[], sectorId: string): Op[] {
  if (DEFAULT_SECTOR_IDS.has(sectorId)) return []
  const sector = sectors.find((s) => s.id === sectorId)
  return sector ? [{ opId: opId(), kind: 'sector', id: sector.id, set: { name: sector.name, emoji: sector.emoji } }] : []
}

export function marketRef(markets: Market[], marketId: string | null | undefined): MarketRef | null {
  const m = marketId ? markets.find((x) => x.id === marketId) : undefined
  if (!m) return null
  return { name: m.name, ...(m.address ? { address: m.address } : {}), ...(m.osmId ? { osmId: m.osmId } : {}) }
}

/** A lista que já existe no celular, inteira, para subir ao compartilhar. */
export function snapshot(list: ShoppingList, sectors: Sector[], markets: Market[], catalog: Record<string, CatalogEntry>): ShareRequest['entities'] {
  const usedSectors = new Set(list.items.map((i) => i.sectorId))
  return [
    { kind: 'list', id: LIST_ENTITY_ID, fields: { name: list.name, date: list.date, finishedAt: list.finishedAt, market: marketRef(markets, list.marketId) } },
    // Setores antes dos itens: quem recebe já tem o setor quando o item chega.
    ...sectors.filter((s) => usedSectors.has(s.id) && !DEFAULT_SECTOR_IDS.has(s.id)).map((s) => ({ kind: 'sector' as const, id: s.id, fields: { name: s.name, emoji: s.emoji } })),
    ...list.items.map((i) => ({ kind: 'item' as const, id: i.id, fields: { ...itemFields(i, catalog[i.productKey]?.image ?? null) } })),
  ]
}
