import type { CatalogEntry, ListItem, Market, ShoppingList, WebPriceRef } from './types'
import { productKey, uid } from './format'

/**
 * Regras do catálogo (memória por produto) e dos mercados, usadas tanto pelas ações do
 * store quanto pela sincronização — o que chega de outro celular passa pelas mesmas regras.
 */

const MAX_PRICE_HISTORY = 20

/** Grava no catálogo o que o usuário decidiu para esse produto (setor, unidade, preço). */
export function remember(
  catalog: Record<string, CatalogEntry>,
  item: Pick<ListItem, 'productKey' | 'name' | 'sectorId' | 'unit' | 'expectedPrice'>,
  countUse: boolean,
  extra?: { image?: string | null; webRef?: WebPriceRef | null },
): Record<string, CatalogEntry> {
  const prev = catalog[item.productKey]
  const entry: CatalogEntry = {
    key: item.productKey,
    name: item.name,
    sectorId: item.sectorId,
    unit: item.unit,
    lastExpected: item.expectedPrice ?? prev?.lastExpected ?? null,
    paid: prev?.paid ?? [],
    timesUsed: (prev?.timesUsed ?? 0) + (countUse ? 1 : 0),
    image: extra?.image !== undefined ? extra.image : (prev?.image ?? null),
    webRef: extra?.webRef !== undefined ? extra.webRef : (prev?.webRef ?? null),
  }
  return { ...catalog, [item.productKey]: entry }
}

/** Registra o preço pago no histórico do produto (um ponto por lista). */
export function recordPaid(catalog: Record<string, CatalogEntry>, item: ListItem, list: Pick<ShoppingList, 'id' | 'date' | 'marketId'>, price: number) {
  const withEntry = remember(catalog, item, false)
  const entry = withEntry[item.productKey]
  const paid = [{ price, date: list.date, listId: list.id, marketId: list.marketId ?? null }, ...entry.paid.filter((p) => p.listId !== list.id)]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_PRICE_HISTORY)
  return { ...withEntry, [item.productKey]: { ...entry, paid } }
}

/** Tira do histórico o preço que veio daquela lista (item saiu do carrinho). */
export function unrecordPaid(catalog: Record<string, CatalogEntry>, key: string, listId: string) {
  const entry = catalog[key]
  if (!entry || !entry.paid.some((p) => p.listId === listId)) return catalog
  return { ...catalog, [key]: { ...entry, paid: entry.paid.filter((p) => p.listId !== listId) } }
}

/** Troca o mercado dos preços pagos que vieram de uma lista. */
export function remapListMarket(catalog: Record<string, CatalogEntry>, listId: string, marketId: string | null): Record<string, CatalogEntry> {
  const out: Record<string, CatalogEntry> = {}
  for (const [k, e] of Object.entries(catalog)) {
    out[k] = e.paid.some((p) => p.listId === listId) ? { ...e, paid: e.paid.map((p) => (p.listId === listId ? { ...p, marketId } : p)) } : e
  }
  return out
}

/** Reaproveita o mercado se já existir (mesmo ponto do mapa ou mesmo nome). */
export function upsertMarket(markets: Market[], market: Omit<Market, 'id'>): { markets: Market[]; id: string } {
  const nameKey = productKey(market.name)
  const existing = markets.find((m) => (market.osmId && m.osmId === market.osmId) || (!market.osmId && productKey(m.name) === nameKey))
  if (existing) return { markets, id: existing.id }
  const id = uid()
  return { markets: [...markets, { ...market, name: market.name.trim(), id }], id }
}
