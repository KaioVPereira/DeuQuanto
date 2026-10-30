import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Header } from '@/components/ui'
import { CartBar, FinishSheet } from '@/components/CartBar'
import { pendingFirst, useItemSheets } from '@/components/items'
import { ItemFormSheet } from '@/components/ItemFormSheet'
import { useList, useStore } from '@/store/store'
import { useLiveSync } from '@/sync/engine'
import { totalsOf } from '@/lib/calc'
import { formatMoney } from '@/lib/format'
import type { ListItem, ShoppingList } from '@/lib/types'

const ALL = 'todos'

export function SectorPage() {
  const { id } = useParams()
  const list = useList(id)
  useLiveSync(list?.id)
  if (!list) return <Navigate to="/" replace />
  return <SectorView list={list} />
}

function SectorView({ list }: { list: ShoppingList }) {
  const { sectorId } = useParams()
  const navigate = useNavigate()
  const sectors = useStore((s) => s.sectors)
  const [finishing, setFinishing] = useState(false)
  const [adding, setAdding] = useState(false)
  const { row, sheets } = useItemSheets(list)
  const activeChip = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeChip.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [sectorId])

  const isAll = sectorId === ALL
  const sector = sectors.find((s) => s.id === sectorId)
  if (!isAll && !sector) return <Navigate to={`/lista/${list.id}`} replace />

  const usedSectors = sectors.filter((s) => list.items.some((i) => i.sectorId === s.id))
  const items = isAll ? list.items : list.items.filter((i) => i.sectorId === sectorId)
  const t = totalsOf(items)

  const goTo = (target: string) => navigate(`/lista/${list.id}/setor/${target}`, { replace: true })

  const renderItems = (group: ListItem[]) => <div className="space-y-2">{pendingFirst(group).map(row)}</div>

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

      <CartBar list={list} onAdd={() => setAdding(true)} onFinish={() => setFinishing(true)} />
      <FinishSheet list={list} open={finishing} onClose={() => setFinishing(false)} onFinished={() => navigate('/', { replace: true })} />
      <ItemFormSheet open={adding} onClose={() => setAdding(false)} listId={list.id} mode={{ kind: 'add', defaultSectorId: isAll ? undefined : sectorId }} />
      {sheets}
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
