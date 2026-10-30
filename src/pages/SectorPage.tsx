import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronRight, ShoppingCart } from 'lucide-react'
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

/**
 * Os produtos de um setor (ou de todos). Duas caras:
 * - em casa (`/lista/:id/setor/...`): só conferir e editar, sem o botão do carrinho;
 * - no mercado (`/lista/:id/mercado/...`): produto por produto no carrinho, e no fim o próximo setor.
 */
export function SectorPage({ market = false }: { market?: boolean }) {
  const { id } = useParams()
  const list = useList(id)
  useLiveSync(list?.id)
  if (!list) return <Navigate to="/" replace />
  return <SectorView list={list} market={market} />
}

function SectorView({ list, market }: { list: ShoppingList; market: boolean }) {
  const { sectorId } = useParams()
  const navigate = useNavigate()
  const sectors = useStore((s) => s.sectors)
  const [finishing, setFinishing] = useState(false)
  const [adding, setAdding] = useState(false)
  const { row, planRow, sheets } = useItemSheets(list)
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

  const goTo = (target: string) => navigate(`/lista/${list.id}/${market ? 'mercado' : 'setor'}/${target}`, { replace: true })

  const renderItems = (group: ListItem[]) =>
    market ? (
      <div className="space-y-2">{pendingFirst(group).map(row)}</div>
    ) : (
      <div className="divide-y divide-line overflow-hidden rounded-3xl bg-card shadow-sm shadow-black/5">{pendingFirst(group).map(planRow)}</div>
    )

  return (
    <div className="min-h-dvh pb-36">
      <Header
        back
        title={isAll ? 'Lista completa' : `${sector!.emoji} ${sector!.name}`}
        subtitle={
          <span className="tabular">
            {market ? (
              <>
                {t.checkedCount} de {t.itemCount} no carrinho
                {t.checkedCount > 0 ? ` · ${formatMoney(t.actual)}` : t.expected > 0 ? ` · est. ${formatMoney(t.expected)}` : ''}
              </>
            ) : (
              <>
                {t.itemCount} {t.itemCount === 1 ? 'item' : 'itens'}
                {t.expected > 0 && ` · est. ${formatMoney(t.expected)}`}
              </>
            )}
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
                <span className={`tabular ml-1 text-xs ${market && complete ? '' : 'opacity-60'}`}>{!market ? st.itemCount : complete ? '✓' : `${st.checkedCount}/${st.itemCount}`}</span>
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
          <>
            {market && t.checkedCount < t.itemCount && (
              <div className="mb-3 flex items-center gap-2 px-1 text-sm text-muted">
                <ShoppingCart size={16} className="shrink-0 text-brand" /> Pegou o produto? Toque no carrinho dele e digite o preço da gôndola.
              </div>
            )}
            {renderItems(items)}
            {market && t.checkedCount === t.itemCount && <SectorDone list={list} sectorId={sectorId!} onGo={goTo} onFinish={() => setFinishing(true)} />}
          </>
        )}
      </div>

      <CartBar list={list} onAdd={() => setAdding(true)} onFinish={() => setFinishing(true)} />
      <FinishSheet list={list} open={finishing} onClose={() => setFinishing(false)} onFinished={() => navigate('/', { replace: true })} />
      <ItemFormSheet open={adding} onClose={() => setAdding(false)} listId={list.id} mode={{ kind: 'add', defaultSectorId: isAll ? undefined : sectorId, toCart: market }} />
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

/** Setor todo no carrinho: leva para o próximo que ainda tem coisa, na ordem do percurso. */
function SectorDone({ list, sectorId, onGo, onFinish }: { list: ShoppingList; sectorId: string; onGo: (id: string) => void; onFinish: () => void }) {
  const sectors = useStore((s) => s.sectors)
  const withPending = sectors.filter((s) => list.items.some((i) => i.sectorId === s.id && !i.checked))
  const here = sectors.findIndex((s) => s.id === sectorId)
  const next = withPending.find((s) => sectors.indexOf(s) > here) ?? withPending[0]

  return (
    <div className="mt-5 rounded-3xl bg-brand-soft p-5 text-center">
      <CheckCircle2 size={32} className="mx-auto mb-1.5 text-brand" />
      <div className="font-bold text-brand-strong">Setor completo!</div>
      {next ? (
        <button
          onClick={() => onGo(next.id)}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-brand px-4 py-3.5 text-left text-on-brand active:bg-brand-press"
        >
          <span className="text-2xl leading-none">{next.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs opacity-85">Próximo setor</span>
            <span className="block truncate font-bold">{next.name}</span>
          </span>
          <ChevronRight size={20} />
        </button>
      ) : (
        <>
          <div className="mt-1 text-sm text-brand-strong">Tudo da lista está no carrinho.</div>
          <button onClick={onFinish} className="mt-4 w-full rounded-2xl bg-brand px-4 py-3.5 font-semibold text-on-brand active:bg-brand-press">
            Finalizar compra
          </button>
        </>
      )}
    </div>
  )
}
