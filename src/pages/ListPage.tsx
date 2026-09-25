import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronRight, CircleCheckBig, List, MoreVertical, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { DeltaChip, Header, MenuItem, ProgressBar } from '@/components/ui'
import { Sheet } from '@/components/Sheet'
import { EditListSheet } from '@/components/ListSheets'
import { ItemFormSheet } from '@/components/ItemFormSheet'
import { CartBar, FinishSheet } from '@/components/CartBar'
import { MarketChip, ProductThumb } from '@/components/media'
import { useList, useMarket, useStore } from '@/store/store'
import { totalsOf, type Totals } from '@/lib/calc'
import { formatDateLong, formatMoney } from '@/lib/format'

export function ListPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const list = useList(id)
  const market = useMarket(list?.marketId)
  const sectors = useStore((s) => s.sectors)
  const catalog = useStore((s) => s.catalog)
  const setFinished = useStore((s) => s.setFinished)
  const deleteList = useStore((s) => s.deleteList)
  const [adding, setAdding] = useState(false)
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [finishing, setFinishing] = useState(false)

  if (!list) return <Navigate to="/" replace />

  const totals = totalsOf(list.items)
  const groups = sectors
    .map((sector) => ({ sector, items: list.items.filter((i) => i.sectorId === sector.id) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="min-h-dvh pb-36">
      <Header
        back
        title={list.name}
        subtitle={`${formatDateLong(list.date)}${list.finishedAt ? ' · finalizada' : ''}`}
        right={
          <button onClick={() => setMenu(true)} className="rounded-full p-2.5 active:bg-line" aria-label="Opções">
            <MoreVertical size={22} />
          </button>
        }
      />

      <div className="space-y-4 px-4 pt-1">
        <SummaryCard totals={totals} finished={!!list.finishedAt} market={<MarketChip market={market} onClick={() => setEditing(true)} placeholder="Em qual mercado?" />} />

        {groups.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-line px-6 py-12 text-center text-muted">
            Lista vazia. Toque no <b className="text-ink">+</b> para adicionar itens.
          </div>
        ) : (
          <div className="space-y-2.5">
            <button
              onClick={() => navigate(`/lista/${list.id}/setor/todos`)}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-semibold text-brand-strong active:bg-brand-soft"
            >
              <List size={20} />
              <span className="flex-1">Ver lista completa</span>
              <ChevronRight size={18} />
            </button>
            {groups.map(({ sector, items }) => {
              const t = totalsOf(items)
              const complete = t.checkedCount === t.itemCount
              // Os que faltam pegar primeiro: é o que interessa ver de relance.
              const preview = [...items].sort((a, b) => Number(a.checked) - Number(b.checked)).slice(0, 6)
              return (
                <button
                  key={sector.id}
                  onClick={() => navigate(`/lista/${list.id}/setor/${sector.id}`)}
                  className={`w-full rounded-3xl p-4 text-left shadow-sm shadow-black/5 active:scale-[0.99] ${complete ? 'bg-brand-soft' : 'bg-card'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl leading-none">{sector.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-bold">{sector.name}</div>
                      <div className="tabular text-sm text-muted">
                        {t.checkedCount} de {t.itemCount} {t.itemCount === 1 ? 'item' : 'itens'}
                        {t.expected > 0 && ` · est. ${formatMoney(t.expected)}`}
                      </div>
                    </div>
                    {complete ? <CheckCircle2 size={26} className="text-brand" /> : <ChevronRight size={20} className="text-faint" />}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    {preview.map((i) => (
                      <ProductThumb key={i.id} image={catalog[i.productKey]?.image} fallback={sector.emoji} size={34} className={i.checked ? 'opacity-40' : ''} />
                    ))}
                    {items.length > preview.length && <span className="tabular pl-1 text-sm font-semibold text-muted">+{items.length - preview.length}</span>}
                  </div>
                  {!complete && (
                    <div className="mt-3">
                      <ProgressBar value={t.checkedCount} max={t.itemCount} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <CartBar list={list} onAdd={() => setAdding(true)} onFinish={() => setFinishing(true)} />

      <ItemFormSheet open={adding} onClose={() => setAdding(false)} listId={list.id} mode={{ kind: 'add' }} />
      <EditListSheet list={list} open={editing} onClose={() => setEditing(false)} />
      <FinishSheet list={list} open={finishing} onClose={() => setFinishing(false)} onFinished={() => navigate('/', { replace: true })} />

      <Sheet open={menu} onClose={() => setMenu(false)} title={list.name}>
        <div className="-mx-2">
          <MenuItem
            icon={<Pencil size={20} />}
            onClick={() => {
              setMenu(false)
              setEditing(true)
            }}
          >
            Editar nome, data e mercado
          </MenuItem>
          {list.finishedAt ? (
            <MenuItem
              icon={<RotateCcw size={20} />}
              onClick={() => {
                setFinished(list.id, false)
                setMenu(false)
              }}
            >
              Reabrir compra
            </MenuItem>
          ) : (
            <MenuItem
              icon={<CircleCheckBig size={20} />}
              onClick={() => {
                setMenu(false)
                setFinishing(true)
              }}
            >
              Finalizar compra
            </MenuItem>
          )}
          <MenuItem
            danger
            icon={<Trash2 size={20} />}
            onClick={() => {
              if (!window.confirm(`Excluir a lista "${list.name}"? Isso não pode ser desfeito.`)) return
              setMenu(false)
              deleteList(list.id)
              navigate('/', { replace: true })
            }}
          >
            Excluir lista
          </MenuItem>
        </div>
      </Sheet>
    </div>
  )
}

function SummaryCard({ totals: t, finished, market }: { totals: Totals; finished: boolean; market: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-card p-4 shadow-sm shadow-black/5">
      <div className="mb-3">{market}</div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-sm text-muted">Esperado</div>
          <div className="tabular text-2xl font-bold">{formatMoney(t.expected)}</div>
        </div>
        <div>
          <div className="text-sm text-muted">{finished ? 'Gasto' : 'No carrinho'}</div>
          <div className="tabular text-2xl font-bold text-brand-strong">{formatMoney(t.actual)}</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-sm text-muted">
          <span className="tabular">
            {t.checkedCount} de {t.itemCount} itens
          </span>
          {t.missingPrice > 0 && <span>{t.missingPrice} sem preço estimado</span>}
        </div>
        <ProgressBar value={t.checkedCount} max={t.itemCount} />
      </div>
      {t.checkedCount > 0 && t.expectedOfBought > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
          <span className="tabular text-muted">Itens comprados: esperado {formatMoney(t.expectedOfBought)}</span>
          <DeltaChip actual={t.actual} expected={t.expectedOfBought} />
        </div>
      )}
    </div>
  )
}
