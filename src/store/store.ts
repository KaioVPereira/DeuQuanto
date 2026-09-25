import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { Preferences } from '@capacitor/preferences'
import type { CatalogEntry, ListItem, Market, Sector, ShoppingList, Unit, WebPriceRef } from '@/lib/types'
import { productKey, todayIso, uid } from '@/lib/format'
import { suggestedPrice } from '@/lib/calc'
import type { Accent, ThemeMode } from '@/lib/theme'

export const FALLBACK_SECTOR = 'outros'

// Ordem aproximada de um percurso de mercado — dá para reordenar em "Setores".
const DEFAULT_SECTORS: Sector[] = [
  { id: 'hortifruti', name: 'Hortifrúti', emoji: '🥬' },
  { id: 'mistura', name: 'Mistura / Açougue', emoji: '🥩' },
  { id: 'frios', name: 'Frios e laticínios', emoji: '🧀' },
  { id: 'padaria', name: 'Padaria', emoji: '🍞' },
  { id: 'mercearia', name: 'Mercearia', emoji: '🍚' },
  { id: 'bebidas', name: 'Bebidas', emoji: '🥤' },
  { id: 'doces', name: 'Doces', emoji: '🍫' },
  { id: 'salgados', name: 'Salgados', emoji: '🍿' },
  { id: 'congelados', name: 'Congelados', emoji: '🧊' },
  { id: 'limpeza', name: 'Limpeza', emoji: '🧽' },
  { id: 'higiene', name: 'Higiene', emoji: '🧴' },
  { id: 'pet', name: 'Pet', emoji: '🐾' },
  { id: FALLBACK_SECTOR, name: 'Outros', emoji: '📦' },
]

const MAX_PRICE_HISTORY = 20

export interface NewItemInput {
  name: string
  sectorId: string
  unit: Unit
  qty: number
  expectedPrice: number | null
  /** undefined = não mexe na foto/referência já salvas no catálogo. */
  image?: string | null
  webRef?: WebPriceRef | null
}

interface State {
  lists: ShoppingList[]
  sectors: Sector[]
  catalog: Record<string, CatalogEntry>
  markets: Market[]
  settings: { themeMode: ThemeMode; accent: Accent }

  setSettings: (patch: Partial<State['settings']>) => void
  createList: (name: string, date: string, copyFromId?: string | null, marketId?: string | null) => string
  updateList: (id: string, patch: Partial<Pick<ShoppingList, 'name' | 'date' | 'marketId'>>) => void
  deleteList: (id: string) => void
  /** Ao finalizar, dá para corrigir o mercado: onde pretendia → onde comprou. */
  setFinished: (id: string, finished: boolean, marketId?: string | null) => void

  /** Se o produto já estiver na lista, soma a quantidade em vez de duplicar. */
  addItem: (listId: string, input: NewItemInput) => void
  updateItem: (listId: string, itemId: string, input: NewItemInput) => void
  moveItem: (listId: string, itemId: string, sectorId: string) => void
  removeItem: (listId: string, itemId: string) => void
  checkItem: (listId: string, itemId: string, actualQty: number, actualPrice: number | null) => void
  uncheckItem: (listId: string, itemId: string) => void

  addSector: (name: string, emoji: string) => string
  updateSector: (id: string, patch: Partial<Omit<Sector, 'id'>>) => void
  moveSector: (id: string, direction: -1 | 1) => void
  deleteSector: (id: string) => void

  /** Reaproveita o mercado se já existir (mesmo ponto do mapa ou mesmo nome). */
  addMarket: (market: Omit<Market, 'id'>) => string
}

/** Adaptador: Preferences grava no SharedPreferences no Android e no localStorage na web. */
const preferencesStorage: StateStorage = {
  getItem: async (name) => (await Preferences.get({ key: name })).value,
  setItem: async (name, value) => {
    await Preferences.set({ key: name, value })
  },
  removeItem: async (name) => {
    await Preferences.remove({ key: name })
  },
}

function mapList(lists: ShoppingList[], id: string, fn: (l: ShoppingList) => ShoppingList): ShoppingList[] {
  return lists.map((l) => (l.id === id ? fn(l) : l))
}

function mapItem(list: ShoppingList, itemId: string, fn: (i: ListItem) => ListItem): ShoppingList {
  return { ...list, items: list.items.map((i) => (i.id === itemId ? fn(i) : i)) }
}

/** Grava no catálogo o que o usuário decidiu para esse produto (setor, unidade, preço). */
function remember(
  catalog: Record<string, CatalogEntry>,
  item: Pick<ListItem, 'productKey' | 'name' | 'sectorId' | 'unit' | 'expectedPrice'>,
  countUse: boolean,
  extra?: Pick<NewItemInput, 'image' | 'webRef'>,
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

/** Troca o mercado dos preços pagos que vieram de uma lista. */
function remapListMarket(catalog: Record<string, CatalogEntry>, listId: string, marketId: string | null): Record<string, CatalogEntry> {
  const out: Record<string, CatalogEntry> = {}
  for (const [k, e] of Object.entries(catalog)) {
    out[k] = e.paid.some((p) => p.listId === listId) ? { ...e, paid: e.paid.map((p) => (p.listId === listId ? { ...p, marketId } : p)) } : e
  }
  return out
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      lists: [],
      sectors: DEFAULT_SECTORS,
      catalog: {},
      markets: [],
      // Padrão = o visual de sempre (verde claro); quem quiser muda em Ajustes.
      settings: { themeMode: 'light', accent: 'verde' },

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      createList: (name, date, copyFromId, marketId) => {
        const id = uid()
        const { catalog, lists } = get()
        const source = copyFromId ? lists.find((l) => l.id === copyFromId) : null
        const items: ListItem[] = (source?.items ?? []).map((i) => {
          const entry = catalog[i.productKey]
          return {
            id: uid(),
            productKey: i.productKey,
            name: i.name,
            // O catálogo tem a decisão mais recente de setor e o último preço pago.
            sectorId: entry?.sectorId ?? i.sectorId,
            unit: entry?.unit ?? i.unit,
            qty: i.qty,
            expectedPrice: suggestedPrice(entry, marketId) ?? i.expectedPrice,
            checked: false,
            actualQty: null,
            actualPrice: null,
            checkedAt: null,
          }
        })
        const list: ShoppingList = {
          id,
          name: name.trim() || 'Compras',
          date: date || todayIso(),
          createdAt: new Date().toISOString(),
          finishedAt: null,
          marketId: marketId ?? null,
          items,
        }
        set({ lists: [list, ...lists] })
        return id
      },

      updateList: (id, patch) =>
        set((s) => {
          const lists = mapList(s.lists, id, (l) => ({ ...l, ...patch }))
          return patch.marketId !== undefined ? { lists, catalog: remapListMarket(s.catalog, id, patch.marketId) } : { lists }
        }),

      deleteList: (id) =>
        set((s) => {
          // Tira do histórico de preços os pontos que vieram dessa lista.
          const catalog: Record<string, CatalogEntry> = {}
          for (const [k, e] of Object.entries(s.catalog)) catalog[k] = { ...e, paid: e.paid.filter((p) => p.listId !== id) }
          return { lists: s.lists.filter((l) => l.id !== id), catalog }
        }),

      setFinished: (id, finished, marketId) =>
        set((s) => {
          const lists = mapList(s.lists, id, (l) => ({
            ...l,
            finishedAt: finished ? new Date().toISOString() : null,
            ...(marketId !== undefined ? { marketId } : {}),
          }))
          return marketId !== undefined ? { lists, catalog: remapListMarket(s.catalog, id, marketId) } : { lists }
        }),

      addItem: (listId, input) =>
        set((s) => {
          const key = productKey(input.name)
          if (!key) return s
          const list = s.lists.find((l) => l.id === listId)
          if (!list) return s
          const existing = list.items.find((i) => i.productKey === key)
          let item: ListItem
          let lists: ShoppingList[]
          if (existing) {
            item = { ...existing, qty: existing.qty + input.qty, sectorId: input.sectorId, unit: input.unit, expectedPrice: input.expectedPrice ?? existing.expectedPrice }
            lists = mapList(s.lists, listId, (l) => mapItem(l, existing.id, () => item))
          } else {
            item = {
              id: uid(),
              productKey: key,
              name: input.name.trim(),
              sectorId: input.sectorId,
              unit: input.unit,
              qty: input.qty,
              expectedPrice: input.expectedPrice,
              checked: false,
              actualQty: null,
              actualPrice: null,
              checkedAt: null,
            }
            lists = mapList(s.lists, listId, (l) => ({ ...l, items: [...l.items, item] }))
          }
          return { lists, catalog: remember(s.catalog, item, !existing, input) }
        }),

      updateItem: (listId, itemId, input) =>
        set((s) => {
          const key = productKey(input.name)
          if (!key) return s
          let updated: ListItem | null = null
          const lists = mapList(s.lists, listId, (l) =>
            mapItem(l, itemId, (i) => {
              updated = { ...i, productKey: key, name: input.name.trim(), sectorId: input.sectorId, unit: input.unit, qty: input.qty, expectedPrice: input.expectedPrice }
              return updated
            }),
          )
          return updated ? { lists, catalog: remember(s.catalog, updated, false, input) } : s
        }),

      moveItem: (listId, itemId, sectorId) =>
        set((s) => {
          let moved: ListItem | null = null
          const lists = mapList(s.lists, listId, (l) =>
            mapItem(l, itemId, (i) => {
              moved = { ...i, sectorId }
              return moved
            }),
          )
          // É aqui que o setor fica "aprendido" para as próximas listas.
          return moved ? { lists, catalog: remember(s.catalog, moved, false) } : s
        }),

      removeItem: (listId, itemId) =>
        set((s) => ({ lists: mapList(s.lists, listId, (l) => ({ ...l, items: l.items.filter((i) => i.id !== itemId) })) })),

      checkItem: (listId, itemId, actualQty, actualPrice) =>
        set((s) => {
          const list = s.lists.find((l) => l.id === listId)
          const item = list?.items.find((i) => i.id === itemId)
          if (!list || !item) return s
          const lists = mapList(s.lists, listId, (l) =>
            mapItem(l, itemId, (i) => ({ ...i, checked: true, actualQty, actualPrice, checkedAt: new Date().toISOString() })),
          )
          let catalog = s.catalog
          if (actualPrice != null) {
            catalog = remember(catalog, item, false)
            const entry = catalog[item.productKey]
            const paid = [{ price: actualPrice, date: list.date, listId, marketId: list.marketId ?? null }, ...entry.paid.filter((p) => p.listId !== listId)]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, MAX_PRICE_HISTORY)
            catalog = { ...catalog, [item.productKey]: { ...entry, paid } }
          }
          return { lists, catalog }
        }),

      uncheckItem: (listId, itemId) =>
        set((s) => {
          const item = s.lists.find((l) => l.id === listId)?.items.find((i) => i.id === itemId)
          if (!item) return s
          const lists = mapList(s.lists, listId, (l) =>
            mapItem(l, itemId, (i) => ({ ...i, checked: false, actualQty: null, actualPrice: null, checkedAt: null })),
          )
          const entry = s.catalog[item.productKey]
          const catalog = entry ? { ...s.catalog, [item.productKey]: { ...entry, paid: entry.paid.filter((p) => p.listId !== listId) } } : s.catalog
          return { lists, catalog }
        }),

      addSector: (name, emoji) => {
        const id = uid()
        set((s) => {
          // "Outros" fica sempre no fim.
          const fallbackIdx = s.sectors.findIndex((x) => x.id === FALLBACK_SECTOR)
          const sectors = [...s.sectors]
          sectors.splice(fallbackIdx < 0 ? sectors.length : fallbackIdx, 0, { id, name: name.trim(), emoji })
          return { sectors }
        })
        return id
      },

      updateSector: (id, patch) => set((s) => ({ sectors: s.sectors.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),

      moveSector: (id, direction) =>
        set((s) => {
          const idx = s.sectors.findIndex((x) => x.id === id)
          const target = idx + direction
          if (idx < 0 || target < 0 || target >= s.sectors.length) return s
          const sectors = [...s.sectors]
          ;[sectors[idx], sectors[target]] = [sectors[target], sectors[idx]]
          return { sectors }
        }),

      deleteSector: (id) =>
        set((s) => {
          if (id === FALLBACK_SECTOR) return s
          const reassign = (sectorId: string) => (sectorId === id ? FALLBACK_SECTOR : sectorId)
          const catalog: Record<string, CatalogEntry> = {}
          for (const [k, e] of Object.entries(s.catalog)) catalog[k] = { ...e, sectorId: reassign(e.sectorId) }
          return {
            sectors: s.sectors.filter((x) => x.id !== id),
            lists: s.lists.map((l) => ({ ...l, items: l.items.map((i) => ({ ...i, sectorId: reassign(i.sectorId) })) })),
            catalog,
          }
        }),

      addMarket: (market) => {
        const { markets } = get()
        const nameKey = productKey(market.name)
        const existing = markets.find((m) => (market.osmId && m.osmId === market.osmId) || (!market.osmId && productKey(m.name) === nameKey))
        if (existing) return existing.id
        const id = uid()
        set({ markets: [...markets, { ...market, name: market.name.trim(), id }] })
        return id
      },
    }),
    {
      name: 'lista-compras',
      version: 1,
      storage: createJSONStorage(() => preferencesStorage),
      partialize: (s) => ({ lists: s.lists, sectors: s.sectors, catalog: s.catalog, markets: s.markets, settings: s.settings }),
    },
  ),
)

export function useList(id: string | undefined) {
  return useStore((s) => s.lists.find((l) => l.id === id))
}

export function useMarket(id: string | null | undefined) {
  return useStore((s) => (id ? s.markets.find((m) => m.id === id) : undefined))
}

export function useSectorMap() {
  const sectors = useStore((s) => s.sectors)
  return new Map(sectors.map((x) => [x.id, x]))
}
