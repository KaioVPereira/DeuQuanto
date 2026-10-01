import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { Preferences } from '@capacitor/preferences'
import type { JoinResponse, Op, ShareResponse, SyncResponse } from '../../shared/protocol'
import type { CatalogEntry, ListItem, ListShare, Market, Sector, ShoppingList, Unit, WebPriceRef } from '@/lib/types'
import { productKey, todayIso, uid } from '@/lib/format'
import { suggestedPrice } from '@/lib/calc'
import { recordPaid, remapListMarket, remember, unrecordPaid, upsertMarket } from '@/lib/catalog'
import type { Accent, ThemeMode } from '@/lib/theme'
import { createItemOp, deleteItemOp, listOp, marketRef, patchItemOp, sectorOps } from '@/sync/ops'
import { mergeJoin, mergeSync, type RemoteSummary } from '@/sync/merge'

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

/** Este celular nas listas compartilhadas: o id fica fixo, o nome a pessoa escolhe. */
export interface Device {
  id: string
  name: string
}

interface State {
  lists: ShoppingList[]
  sectors: Sector[]
  catalog: Record<string, CatalogEntry>
  markets: Market[]
  settings: { themeMode: ThemeMode; accent: Accent }
  device: Device | null
  /** Alterações de listas compartilhadas ainda não confirmadas pelo servidor, por lista. */
  outbox: Record<string, Op[]>

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

  // ---------- Listas compartilhadas ----------
  setDeviceName: (name: string) => Device
  /** A lista deste celular acabou de subir para o servidor. */
  startSharing: (listId: string, res: ShareResponse) => void
  /** Entrou numa lista pelo código: devolve o id local dela. */
  joinShared: (res: JoinResponse) => string
  applySync: (listId: string, res: SyncResponse, sentOpIds: string[]) => RemoteSummary | null
  updateShare: (listId: string, patch: Partial<ListShare>) => void
  /** Volta a ser uma lista só deste celular (parou de compartilhar, saiu, ou dispensou o aviso). */
  unshare: (listId: string) => void
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

const isLive = (list: ShoppingList | undefined) => !!list?.share && !list.share.ended

/** Põe as alterações na fila de envio — só se a lista estiver compartilhada. */
function queue(s: State, listId: string, ops: Op[]): Partial<State> {
  if (ops.length === 0 || !isLive(s.lists.find((l) => l.id === listId))) return {}
  return { outbox: { ...s.outbox, [listId]: [...(s.outbox[listId] ?? []), ...ops] } }
}

/** Quem adicionou: só marca em lista compartilhada. */
const author = (s: State, listId: string) => {
  const list = s.lists.find((l) => l.id === listId)
  return isLive(list) ? list!.share!.memberId : undefined
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
      device: null,
      outbox: {},

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
          const op = listOp({
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.date !== undefined ? { date: patch.date } : {}),
            ...(patch.marketId !== undefined ? { market: marketRef(s.markets, patch.marketId) } : {}),
          })
          const catalog = patch.marketId !== undefined ? remapListMarket(s.catalog, id, patch.marketId) : s.catalog
          return { lists, catalog, ...queue(s, id, [op]) }
        }),

      deleteList: (id) =>
        set((s) => {
          // Tira do histórico de preços os pontos que vieram dessa lista.
          const catalog: Record<string, CatalogEntry> = {}
          for (const [k, e] of Object.entries(s.catalog)) catalog[k] = { ...e, paid: e.paid.filter((p) => p.listId !== id) }
          const outbox = { ...s.outbox }
          delete outbox[id]
          return { lists: s.lists.filter((l) => l.id !== id), catalog, outbox }
        }),

      setFinished: (id, finished, marketId) =>
        set((s) => {
          const finishedAt = finished ? new Date().toISOString() : null
          const lists = mapList(s.lists, id, (l) => ({
            ...l,
            finishedAt,
            ...(marketId !== undefined ? { marketId } : {}),
          }))
          const op = listOp({ finishedAt, ...(marketId !== undefined ? { market: marketRef(s.markets, marketId) } : {}) })
          const catalog = marketId !== undefined ? remapListMarket(s.catalog, id, marketId) : s.catalog
          return { lists, catalog, ...queue(s, id, [op]) }
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
          let op: Op
          if (existing) {
            item = { ...existing, qty: existing.qty + input.qty, sectorId: input.sectorId, unit: input.unit, expectedPrice: input.expectedPrice ?? existing.expectedPrice }
            lists = mapList(s.lists, listId, (l) => mapItem(l, existing.id, () => item))
            op = patchItemOp(item.id, {
              qty: item.qty,
              sectorId: item.sectorId,
              unit: item.unit,
              expectedPrice: item.expectedPrice,
              ...(input.image !== undefined ? { image: input.image } : {}),
            })
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
              ...(author(s, listId) ? { createdBy: author(s, listId) } : {}),
            }
            lists = mapList(s.lists, listId, (l) => ({ ...l, items: [...l.items, item] }))
            op = createItemOp(item, input.image !== undefined ? input.image : (s.catalog[key]?.image ?? null))
          }
          return { lists, catalog: remember(s.catalog, item, !existing, input), ...queue(s, listId, [...sectorOps(s.sectors, item.sectorId), op]) }
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
          if (!updated) return s
          const u: ListItem = updated
          const op = patchItemOp(itemId, {
            productKey: u.productKey,
            name: u.name,
            sectorId: u.sectorId,
            unit: u.unit,
            qty: u.qty,
            expectedPrice: u.expectedPrice,
            ...(input.image !== undefined ? { image: input.image } : {}),
          })
          return { lists, catalog: remember(s.catalog, u, false, input), ...queue(s, listId, [...sectorOps(s.sectors, u.sectorId), op]) }
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
          return moved
            ? { lists, catalog: remember(s.catalog, moved, false), ...queue(s, listId, [...sectorOps(s.sectors, sectorId), patchItemOp(itemId, { sectorId })]) }
            : s
        }),

      removeItem: (listId, itemId) =>
        set((s) => ({
          lists: mapList(s.lists, listId, (l) => ({ ...l, items: l.items.filter((i) => i.id !== itemId) })),
          ...queue(s, listId, [deleteItemOp(itemId)]),
        })),

      checkItem: (listId, itemId, actualQty, actualPrice) =>
        set((s) => {
          const list = s.lists.find((l) => l.id === listId)
          const item = list?.items.find((i) => i.id === itemId)
          if (!list || !item) return s
          const checkedAt = new Date().toISOString()
          const lists = mapList(s.lists, listId, (l) => mapItem(l, itemId, (i) => ({ ...i, checked: true, actualQty, actualPrice, checkedAt })))
          const catalog = actualPrice != null ? recordPaid(s.catalog, item, list, actualPrice) : s.catalog
          return { lists, catalog, ...queue(s, listId, [patchItemOp(itemId, { checked: true, actualQty, actualPrice, checkedAt })]) }
        }),

      uncheckItem: (listId, itemId) =>
        set((s) => {
          const item = s.lists.find((l) => l.id === listId)?.items.find((i) => i.id === itemId)
          if (!item) return s
          const lists = mapList(s.lists, listId, (l) =>
            mapItem(l, itemId, (i) => ({ ...i, checked: false, actualQty: null, actualPrice: null, checkedAt: null })),
          )
          return {
            lists,
            catalog: unrecordPaid(s.catalog, item.productKey, listId),
            ...queue(s, listId, [patchItemOp(itemId, { checked: false, actualQty: null, actualPrice: null, checkedAt: null })]),
          }
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
          // Nas listas compartilhadas, os itens que estavam no setor apagado mudam de setor para todos.
          let outbox = s.outbox
          for (const l of s.lists) {
            const ops = l.items.filter((i) => i.sectorId === id).map((i) => patchItemOp(i.id, { sectorId: FALLBACK_SECTOR }))
            const q = queue({ ...s, outbox }, l.id, ops)
            if (q.outbox) outbox = q.outbox
          }
          return {
            sectors: s.sectors.filter((x) => x.id !== id),
            lists: s.lists.map((l) => ({ ...l, items: l.items.map((i) => ({ ...i, sectorId: reassign(i.sectorId) })) })),
            catalog,
            outbox,
          }
        }),

      addMarket: (market) => {
        const { markets, id } = upsertMarket(get().markets, market)
        if (markets !== get().markets) set({ markets })
        return id
      },

      setDeviceName: (name) => {
        const device: Device = { id: get().device?.id ?? crypto.randomUUID(), name: name.trim() }
        set({ device })
        return device
      },

      startSharing: (listId, res) =>
        set((s) => ({
          lists: mapList(s.lists, listId, (l) => ({
            ...l,
            share: {
              remoteId: res.listId,
              token: res.token,
              memberId: res.memberId,
              isOwner: true,
              code: res.code,
              seq: res.seq,
              members: res.members,
              lastSyncAt: new Date().toISOString(),
              ended: null,
            },
          })),
          outbox: { ...s.outbox, [listId]: [] },
        })),

      joinShared: (res) => {
        const { patch, listId } = mergeJoin(get(), res)
        set(patch)
        return listId
      },

      applySync: (listId, res, sentOpIds) => {
        const merged = mergeSync(get(), listId, res, new Set(sentOpIds))
        if (!merged) return null
        set(merged.patch)
        return merged.summary
      },

      updateShare: (listId, patch) => set((s) => ({ lists: mapList(s.lists, listId, (l) => (l.share ? { ...l, share: { ...l.share, ...patch } } : l)) })),

      unshare: (listId) =>
        set((s) => {
          const outbox = { ...s.outbox }
          delete outbox[listId]
          return { lists: mapList(s.lists, listId, (l) => ({ ...l, share: null, items: l.items.map(({ createdBy: _, ...i }) => i) })), outbox }
        }),
    }),
    {
      name: 'lista-compras',
      version: 1,
      storage: createJSONStorage(() => preferencesStorage),
      partialize: (s) => ({ lists: s.lists, sectors: s.sectors, catalog: s.catalog, markets: s.markets, settings: s.settings, device: s.device, outbox: s.outbox }),
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
