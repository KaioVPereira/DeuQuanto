import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Header } from '@/components/ui'
import { CartBar, FinishSheet } from '@/components/CartBar'
import { ItemActionsSheet, ItemRow } from '@/components/items'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { ItemFormSheet, type ItemFormMode } from '@/components/ItemFormSheet'
import { useList, useStore } from '@/store/store'
import { useLiveSync } from '@/sync/engine'
import { totalsOf } from '@/lib/calc'
import { formatMoney } from '@/lib/format'
import type { ListItem } from '@/lib/types'

const ALL = 'todos'

export function SectorPage() {
  const { id, sectorId } = useParams()
  const navigate = useNavigate()
  const list = useList(id)
  const sectors = useStore((s) => s.sectors)
  const catalog = useStore((s) => s.catalog)
  const [finishing, setFinishing] = useState(false)
  const [confirming, setConfirming] = useState<ListItem | null>(null)
  const [actions, setActions] = useState<ListItem | null>(null)
  const [form, setForm] = useState<ItemFormMode | null>(null)
  const activeChip = useRef<HTMLButtonElement>(null)
  useLiveSync(list?.id)

  useEffect(() => {
    activeChip.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [sectorId])

  if (!list) return <Navigate to="/" replace />

  const isAll = sectorId === ALL
  const sector = sectors.find((s) => s.id === sectorId)
  if (!isAll && !sector) return <Navigate to={`/lista/${list.id}`} replace />

  const usedSectors = sectors.filter((s) => list.items.some((i) => i.sectorId === s.id))
  const items = isAll ? list.items : list.items.filter((i) => i.sectorId === sectorId)
  const t = totalsOf(items)

  // Mantém a referência "viva" do item aberto no painel (o store troca o objeto a cada edição).
  const live = (item: ListItem | null) => (item ? (list.items.find((i) => i.id === item.id) ?? null) : null)

  // Selo de quem adicionou: só nos itens que outra pessoa pôs depois de compartilhar.
  const share = list.share
  const addedBy = (item: ListItem) =>
    share && item.createdBy && item.createdBy !== share.memberId ? (share.members.find((m) => m.id === item.createdBy)?.name ?? null) : null

  const goTo = (target: string) => navigate(`/lista/${list.id}/setor/${target}`, { replace: true })

  const renderItems = (group: ListItem[]) => {
    const pending = group.filter((i) => !i.checked)
    const done = group.filter((i) => i.checked)
    return (
      <div className="space-y-2">
        {[...pending, ...done].map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            image={catalog[item.productKey]?.image}
            fallback={sectors.find((s) => s.id === item.sectorId)?.emoji ?? '🛒'}
            addedBy={addedBy(item)}
            onCheck={() => setConfirming(item)}
            onOpen={() => setActions(item)}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-dvh pb-36">
      <Header
        back
        title={isAll ? 'Lista completa' : `${sector!.emoji} ${sector!.name}`}
        subtitle={
          <span className="tabular">
            {t.checkedCount} de {t.itemCount} no carrinho
            {t.checkedCount > 0 ? ` · ${formatMoney(t.actual)}` : t.expected > 0 ? ` · est. ${formatMoney(t.expected)}` : ''}
          </span>
        }
      />

      {usedSectors.length > 1 && (
        <div className="no-scrollbar sticky top-[calc(var(--sat)+4rem)] z-20 -mt-1 flex gap-2 overflow-x-auto bg-bg/95 px-4 pb-3">
          <Chip active={isAll} onClick={() => goTo(ALL)} ref={isAll ? activeChip : undefined}>
            Tudo
          </Chip>
          {usedSectors.map((s) => {
            const st = totalsOf(list.items.filter((i) => i.sectorId === s.id))
            const complete = st.checkedCount === st.itemCount
            return (
              <Chip key={s.id} active={s.id === sectorId} onClick={() => goTo(s.id)} ref={s.id === sectorId ? activeChip : undefined}>
                {s.emoji} {s.name}
                <span className={`tabular ml-1 text-xs ${complete ? '' : 'opacity-60'}`}>{complete ? '✓' : `${st.checkedCount}/${st.itemCount}`}</span>
              </Chip>
            )
          })}
        </div>
      )}

      <div className="px-4 pt-1">
        {items.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-line px-6 py-12 text-center text-muted">Nada neste setor.</div>
        ) : isAll ? (
          <div className="space-y-5">
            {usedSectors.map((s) => (
              <section key={s.id}>
                <h2 className="mb-2 px-1 font-bold">
                  {s.emoji} {s.name}
                </h2>
                {renderItems(items.filter((i) => i.sectorId === s.id))}
              </section>
            ))}
          </div>
        ) : (
          renderItems(items)
        )}
      </div>

      <CartBar list={list} onAdd={() => setForm({ kind: 'add', defaultSectorId: isAll ? undefined : sectorId })} onFinish={() => setFinishing(true)} />
      <FinishSheet list={list} open={finishing} onClose={() => setFinishing(false)} onFinished={() => navigate('/', { replace: true })} />

      <ConfirmSheet listId={list.id} item={live(confirming)} onClose={() => setConfirming(null)} />
      <ItemActionsSheet
        listId={list.id}
        item={live(actions)}
        onClose={() => setActions(null)}
        onConfirm={(item) => {
          setActions(null)
          setConfirming(item)
        }}
        onEdit={(item) => {
          setActions(null)
          setForm({ kind: 'edit', item })
        }}
      />
      {form && <ItemFormSheet open onClose={() => setForm(null)} listId={list.id} mode={form} />}
    </div>
  )
}

function Chip({ active, onClick, children, ref }: { active: boolean; onClick: () => void; children: React.ReactNode; ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap ${active ? 'bg-brand text-on-brand' : 'bg-card text-ink shadow-sm shadow-black/5 active:bg-line'}`}
    >
      {children}
    </button>
  )
}
