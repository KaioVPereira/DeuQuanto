import type { CatalogEntry, ListItem, PricePoint, ShoppingList } from './types'

export function expectedLine(item: ListItem): number | null {
  return item.expectedPrice == null ? null : Math.round(item.expectedPrice * item.qty)
}

export function actualLine(item: ListItem): number | null {
  if (!item.checked || item.actualPrice == null) return null
  return Math.round(item.actualPrice * (item.actualQty ?? item.qty))
}

export interface Totals {
  /** Soma estimada da lista inteira (itens sem preço ficam de fora). */
  expected: number
  /** Soma do que foi pago. */
  actual: number
  /** Estimado só dos itens que foram comprados — é a base justa de comparação. */
  expectedOfBought: number
  itemCount: number
  checkedCount: number
  missingPrice: number
}

export function totalsOf(items: ListItem[]): Totals {
  const t: Totals = { expected: 0, actual: 0, expectedOfBought: 0, itemCount: items.length, checkedCount: 0, missingPrice: 0 }
  for (const item of items) {
    const exp = expectedLine(item)
    if (exp == null) t.missingPrice++
    else t.expected += exp
    if (item.checked) {
      t.checkedCount++
      t.actual += actualLine(item) ?? 0
      // Compara o que foi estimado para a quantidade que realmente entrou no carrinho.
      if (item.expectedPrice != null) t.expectedOfBought += Math.round(item.expectedPrice * (item.actualQty ?? item.qty))
    }
  }
  return t
}

export function listTotals(list: ShoppingList): Totals {
  return totalsOf(list.items)
}

/** Média dos últimos preços pagos (até 5). */
export function averagePaid(entry: CatalogEntry | undefined): number | null {
  if (!entry || entry.paid.length === 0) return null
  const recent = entry.paid.slice(0, 5)
  return Math.round(recent.reduce((s, p) => s + p.price, 0) / recent.length)
}

/**
 * Preço sugerido para estimar: o último pago no mesmo mercado da lista, senão o último
 * pago em qualquer lugar, senão a última estimativa, senão o preço online.
 */
export function suggestedPrice(entry: CatalogEntry | undefined, marketId?: string | null): number | null {
  if (!entry) return null
  const sameMarket = marketId ? entry.paid.find((p) => p.marketId === marketId) : undefined
  return sameMarket?.price ?? entry.paid[0]?.price ?? entry.lastExpected ?? entry.webRef?.price ?? null
}

export function lastPaidAt(entry: CatalogEntry | undefined, marketId: string | null | undefined): PricePoint | undefined {
  if (!entry || !marketId) return undefined
  return entry.paid.find((p) => p.marketId === marketId)
}

/** Mercado com o menor último preço pago — só faz sentido com 2+ mercados no histórico. */
export function cheapestMarket(entry: CatalogEntry | undefined): PricePoint | null {
  if (!entry) return null
  const latestByMarket = new Map<string, PricePoint>()
  for (const p of entry.paid) if (p.marketId && !latestByMarket.has(p.marketId)) latestByMarket.set(p.marketId, p)
  if (latestByMarket.size < 2) return null
  return [...latestByMarket.values()].reduce((min, p) => (p.price < min.price ? p : min))
}
