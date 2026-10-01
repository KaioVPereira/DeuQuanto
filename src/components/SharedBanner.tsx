import { useEffect, useState } from 'react'
import { ChevronRight, CloudOff, Loader2, Users } from 'lucide-react'
import { useStore } from '@/store/store'
import { useSyncStatus } from '@/sync/engine'
import type { ShoppingList } from '@/lib/types'
import { relativeTime } from './ShareSheet'

/** Faixa no topo da lista compartilhada: com quem, e se está tudo sincronizado. Toque abre o painel. */
export function SharedBanner({ list, onClick }: { list: ShoppingList; onClick: () => void }) {
  const share = list.share
  const pending = useStore((s) => s.outbox[list.id]?.length ?? 0)
  const status = useSyncStatus((s) => s.byList[list.id]?.state)
  // Re-renderiza a cada 15 s para o "há 1 min" andar sozinho.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000)
    return () => clearInterval(t)
  }, [])
  if (!share) return null

  if (share.ended) {
    return (
      <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl bg-over-soft px-4 py-3 text-left text-sm font-medium text-over">
        <Users size={18} className="shrink-0" />
        <span className="flex-1">{share.ended === 'removed' ? 'Você foi tirado desta lista' : 'Esta lista deixou de ser compartilhada'}</span>
        <ChevronRight size={16} />
      </button>
    )
  }

  const others = share.members.filter((m) => m.id !== share.memberId).map((m) => m.name)
  const who = others.length === 0 ? 'Aguardando alguém entrar' : `Com ${others.length === 1 ? others[0] : `${others.slice(0, -1).join(', ')} e ${others[others.length - 1]}`}`
  const offline = status === 'offline'
  const detail = offline
    ? pending > 0
      ? `sem internet · ${pending} ${pending === 1 ? 'alteração' : 'alterações'} na fila`
      : 'sem internet'
    : pending > 0 || status === 'syncing'
      ? 'sincronizando'
      : `sincronizado ${relativeTime(share.lastSyncAt)}`

  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left shadow-sm shadow-black/5 active:bg-bg">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-strong">
        <Users size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{who}</span>
        <span className={`flex items-center gap-1 text-sm ${offline ? 'text-over' : 'text-muted'}`}>
          {offline ? <CloudOff size={14} /> : pending > 0 || status === 'syncing' ? <Loader2 size={14} className="animate-spin" /> : null}
          {detail}
        </span>
      </span>
      <ChevronRight size={18} className="text-faint" />
    </button>
  )
}
