import { useEffect } from 'react'
import { create } from 'zustand'
import { App } from '@capacitor/app'
import { useStore } from '@/store/store'
import { isNative } from '@/lib/native'
import { api, ApiHttpError, OfflineError } from './api'
import type { RemoteSummary } from './merge'

/**
 * Motor da sincronização: envia a fila da lista e recebe o que mudou, numa requisição só.
 * Quando roda:
 *  - a cada 4 s com a lista aberta na tela;
 *  - a cada 30 s nas outras telas, e sempre que o app volta para a frente;
 *  - logo depois de qualquer alteração numa lista compartilhada.
 * Sem internet, as alterações ficam na fila (salva no celular) e vão na próxima tentativa.
 */

export type SyncState = 'syncing' | 'ok' | 'offline' | 'error'

interface SyncStatusStore {
  byList: Record<string, { state: SyncState; at: number }>
  toast: { id: number; text: string } | null
  dismissToast: () => void
}

export const useSyncStatus = create<SyncStatusStore>()((set) => ({
  byList: {},
  toast: null,
  dismissToast: () => set({ toast: null }),
}))

const setStatus = (listId: string, state: SyncState) => useSyncStatus.setState((s) => ({ byList: { ...s.byList, [listId]: { state, at: Date.now() } } }))

const BATCH = 500
const running = new Map<string, Promise<void>>()
const again = new Set<string>()

/** Sincroniza uma lista. Chamadas durante uma sincronização em andamento viram uma rodada extra depois dela. */
export function syncList(listId: string): Promise<void> {
  const current = running.get(listId)
  if (current) {
    again.add(listId)
    return current
  }
  const p = run(listId).finally(() => {
    running.delete(listId)
    if (again.delete(listId)) void syncList(listId)
  })
  running.set(listId, p)
  return p
}

export function syncAll() {
  for (const l of useStore.getState().lists) if (l.share && !l.share.ended) void syncList(l.id)
}

async function run(listId: string) {
  const state = useStore.getState()
  const share = state.lists.find((l) => l.id === listId)?.share
  if (!share || share.ended) return
  const sent = (state.outbox[listId] ?? []).slice(0, BATCH)
  setStatus(listId, 'syncing')
  try {
    const res = await api.sync(share.remoteId, share.token, { since: share.seq, ops: sent, name: state.device?.name || undefined })
    const summary = useStore.getState().applySync(listId, res, sent.map((o) => o.opId))
    setStatus(listId, 'ok')
    if (summary) announce(listId, summary)
    if (sent.length === BATCH) again.add(listId)
  } catch (err) {
    if (err instanceof OfflineError) return setStatus(listId, 'offline')
    if (err instanceof ApiHttpError) {
      if (err.code === 'removed') {
        useStore.getState().updateShare(listId, { ended: 'removed' })
        return setStatus(listId, 'ok')
      }
      if (err.code === 'closed' || err.code === 'not_found' || err.status === 401) {
        useStore.getState().updateShare(listId, { ended: 'closed' })
        return setStatus(listId, 'ok')
      }
    }
    console.warn('sync', err)
    setStatus(listId, 'error')
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "Ana adicionou 3 itens e pôs 1 no carrinho". */
export function describeSummary(summary: RemoteSummary, nameOf: (memberId: string) => string): string | null {
  const sentences: string[] = []
  for (const [member, c] of Object.entries(summary.byMember)) {
    const parts: string[] = []
    if (c.added) parts.push(`adicionou ${plural(c.added, 'item', 'itens')}`)
    if (c.removed) parts.push(`removeu ${plural(c.removed, 'item', 'itens')}`)
    if (c.checked) parts.push(`pôs ${plural(c.checked, 'item', 'itens')} no carrinho`)
    if (c.edited) parts.push(`alterou ${plural(c.edited, 'item', 'itens')}`)
    if (parts.length === 0) continue
    const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
    sentences.push(`${nameOf(member)} ${joined}`)
  }
  return sentences.length ? sentences.join(' · ') : null
}

function announce(listId: string, summary: RemoteSummary) {
  const list = useStore.getState().lists.find((l) => l.id === listId)
  if (!list?.share) return
  const text = describeSummary(summary, (id) => list.share!.members.find((m) => m.id === id)?.name ?? 'Alguém')
  if (text) useSyncStatus.setState({ toast: { id: Date.now(), text: `${text} em “${list.name}”` } })
}

/** Sincronização de fundo: no início, ao voltar para o app, a cada 30 s e logo após alterações. */
export function useSyncLoop() {
  useEffect(() => {
    const visible = () => document.visibilityState === 'visible'
    syncAll()
    const timer = setInterval(() => visible() && syncAll(), 30_000)
    const onVisibility = () => visible() && syncAll()
    document.addEventListener('visibilitychange', onVisibility)
    const resume = isNative ? App.addListener('appStateChange', ({ isActive }) => isActive && syncAll()) : null

    // Alteração entrou na fila: envia em seguida (espera um instante para juntar várias).
    let debounce: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.outbox === prev.outbox) return
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        for (const [id, ops] of Object.entries(useStore.getState().outbox)) if (ops.length) void syncList(id)
      }, 400)
    })

    return () => {
      clearInterval(timer)
      clearTimeout(debounce)
      document.removeEventListener('visibilitychange', onVisibility)
      void resume?.then((h) => h.remove())
      unsubscribe()
    }
  }, [])
}

/** Lista aberta na tela: sincroniza a cada 4 s para ver o que a outra pessoa está fazendo. */
export function useLiveSync(listId: string | undefined) {
  const shared = useStore((s) => {
    const share = s.lists.find((l) => l.id === listId)?.share
    return !!share && !share.ended
  })
  useEffect(() => {
    if (!listId || !shared) return
    const tick = () => document.visibilityState === 'visible' && void syncList(listId)
    tick()
    const timer = setInterval(tick, 4_000)
    return () => clearInterval(timer)
  }, [listId, shared])
}
