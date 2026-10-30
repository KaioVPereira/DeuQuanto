import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronRight, List, ShoppingCart } from 'lucide-react'
import { Header, ProgressBar } from '@/components/ui'
import { CartBar, FinishSheet } from '@/components/CartBar'
import { ItemFormSheet } from '@/components/ItemFormSheet'
import { ProductThumb } from '@/components/media'
import { useList, useStore } from '@/store/store'
import { useLiveSync } from '@/sync/engine'
import { totalsOf } from '@/lib/calc'
import { formatMoney } from '@/lib/format'
import type { ShoppingList } from '@/lib/types'

/**
 * "Cheguei no mercado": os setores da lista na ordem do percurso. A pessoa toca no setor em
 * que está e, lá dentro, vai pondo produto por produto no carrinho. Setor completo vai para o fim.
 */
export function MarketPage() {
  const { id } = useParams()
  const list = useList(id)
  useLiveSync(list?.id)
  if (!list) return <Navigate to="/" replace />
  return <MarketView list={list} />
}

function MarketView({ list }: { list: ShoppingList }) {
  const navigate = useNavigate()
  const sectors = useStore((s) => s.sectors)
  const catalog = useStore((s) => s.catalog)
  const [adding, setAdding] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const t = totalsOf(list.items)
  const groups = sectors
    .map((sector) => {
      const items = list.items.filter((i) => i.sectorId === sector.id)
      return { sector, items, totals: totalsOf(items) }
    })
    .filter((g) => g.items.length > 0)
  const pending = groups.filter((g) => g.totals.checkedCount < g.totals.itemCount)
  const complete = groups.filter((g) => g.totals.checkedCount === g.totals.itemCount)
  const open = (sectorId: string) => navigate(`/lista/${list.id}/mercado/${sectorId}`)

  return (
    <div className="min-h-dvh pb-36">
      <Header back title="No mercado" subtitle={list.name} />

      <div className="space-y-4 px-4 pt-1">
        <div className="rounded-3xl bg-card p-4 shadow-sm shadow-black/5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand-strong">
              <ShoppingCart size={22} />
            </span>
            <div className="min-w-0 flex-1 text-sm leading-snug text-muted">
              Toque no <b className="text-ink">setor</b> em que você está. Lá dentro, toque no carrinho de cada produto que pegar.
            </div>
          </div>
          <div className="mt-4 mb-1.5 flex justify-between text-sm text-muted">
            <span className="tabular">
              {t.checkedCount} de {t.itemCount} {t.itemCount === 1 ? 'item' : 'itens'} no carrinho
            </span>
            <span className="tabular font-semibold text-brand-strong">{formatMoney(t.actual)}</span>
          </div>
          <ProgressBar value={t.checkedCount} max={t.itemCount} />
        </div>

        {list.items.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-line px-6 py-12 text-center text-muted">
            A lista está vazia. Toque no <b className="text-ink">+</b> para pôr um produto direto no carrinho.
          </div>
        ) : pending.length === 0 ? (
          <div className="rounded-3xl bg-brand-soft px-6 py-8 text-center">
            <CheckCircle2 size={36} className="mx-auto mb-2 text-brand" />
            <div className="text-lg font-bold text-brand-strong">Tudo no carrinho!</div>
            <div className="mt-1 text-sm text-brand-strong">
              Toque em <b>Finalizar</b> quando passar no caixa.
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pending.map(({ sector, items, totals: st }) => {
              const left = items.filter((i) => !i.checked)
              const missing = st.itemCount - st.checkedCount
              return (
                <button
                  key={sector.id}
                  onClick={() => open(sector.id)}
                  className="w-full rounded-3xl bg-card p-4 text-left shadow-sm shadow-black/5 active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-4xl leading-none">{sector.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-bold">{sector.name}</div>
                      <div className="tabular text-sm text-muted">
                        {missing === 1 ? 'Falta 1 produto' : `Faltam ${missing} produtos`}
                        {st.checkedCount > 0 && ` · ${st.checkedCount} no carrinho`}
                      </div>
                    </div>
                    <ChevronRight size={22} className="text-faint" />
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    {left.slice(0, 6).map((i) => (
                      <ProductThumb key={i.id} image={catalog[i.productKey]?.image} fallback={sector.emoji} size={36} />
                    ))}
                    {left.length > 6 && <span className="tabular pl-1 text-sm font-semibold text-muted">+{left.length - 6}</span>}
                  </div>
                  {st.checkedCount > 0 && (
                    <div className="mt-3">
                      <ProgressBar value={st.checkedCount} max={st.itemCount} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {complete.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-semibold text-muted">Setores completos</h2>
            <div className="space-y-2">
              {complete.map(({ sector, totals: st }) => (
                <button
                  key={sector.id}
                  onClick={() => open(sector.id)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-brand-soft px-4 py-3 text-left active:scale-[0.99]"
                >
                  <span className="text-2xl leading-none">{sector.emoji}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-brand-strong">{sector.name}</span>
                  <span className="tabular text-sm text-brand-strong">{formatMoney(st.actual)}</span>
                  <CheckCircle2 size={22} className="text-brand" />
                </button>
              ))}
            </div>
          </section>
        )}

        {list.items.length > 0 && (
          <button
            onClick={() => navigate(`/lista/${list.id}/mercado/todos`)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-brand-strong active:bg-brand-soft"
          >
            <List size={18} /> Ver todos os produtos de uma vez
          </button>
        )}
      </div>

      <CartBar list={list} onAdd={() => setAdding(true)} onFinish={() => setFinishing(true)} />
      <ItemFormSheet open={adding} onClose={() => setAdding(false)} listId={list.id} mode={{ kind: 'add', toCart: true }} />
      <FinishSheet list={list} open={finishing} onClose={() => setFinishing(false)} onFinished={() => navigate('/', { replace: true })} />
    </div>
  )
}
