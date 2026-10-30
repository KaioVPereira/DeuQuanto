import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CircleCheckBig, RotateCcw, ShoppingCart, Undo2 } from 'lucide-react'
import { DeltaChip, Header } from '@/components/ui'
import { FinishSheet } from '@/components/CartBar'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { ProductThumb } from '@/components/media'
import { useList, useStore } from '@/store/store'
import { useLiveSync } from '@/sync/engine'
import { actualLine, totalsOf } from '@/lib/calc'
import { formatMoney, formatQty } from '@/lib/format'
import type { ListItem, ShoppingList } from '@/lib/types'

/**
 * O que já está no carrinho (tocando no resumo da lista): conferir, corrigir preço,
 * tirar peça por peça e finalizar dali mesmo.
 */
export function CartPage() {
  const { id } = useParams()
  const list = useList(id)
  useLiveSync(list?.id)
  if (!list) return <Navigate to="/" replace />
  return <CartView list={list} />
}

/** O que saiu por último — dá para desfazer por alguns segundos. */
interface Removed {
  item: ListItem
  qty: number
  price: number | null
}

function CartView({ list }: { list: ShoppingList }) {
  const navigate = useNavigate()
  const sectors = useStore((s) => s.sectors)
  const catalog = useStore((s) => s.catalog)
  const uncheckItem = useStore((s) => s.uncheckItem)
  const checkItem = useStore((s) => s.checkItem)
  const setFinished = useStore((s) => s.setFinished)
  const [confirming, setConfirming] = useState<ListItem | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [removed, setRemoved] = useState<Removed | null>(null)

  useEffect(() => {
    if (!removed) return
    const t = setTimeout(() => setRemoved(null), 5_000)
    return () => clearTimeout(t)
  }, [removed])

  const finished = !!list.finishedAt
  const inCart = list.items.filter((i) => i.checked)
  const all = totalsOf(list.items)
  const t = totalsOf(inCart)
  const groups = sectors.map((sector) => ({ sector, items: inCart.filter((i) => i.sectorId === sector.id) })).filter((g) => g.items.length > 0)

  const takeOut = (item: ListItem) => {
    setRemoved({ item, qty: item.actualQty ?? item.qty, price: item.actualPrice })
    uncheckItem(list.id, item.id)
  }
  const undo = () => {
    if (!removed) return
    checkItem(list.id, removed.item.id, removed.qty, removed.price)
    setRemoved(null)
  }
  const live = confirming ? (list.items.find((i) => i.id === confirming.id) ?? null) : null

  return (
    <div className="min-h-dvh pb-36">
      <Header back title="Carrinho" subtitle={list.name} />

      <div className="space-y-4 px-4 pt-1">
        <div className="rounded-3xl bg-card p-4 shadow-sm shadow-black/5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted">{finished ? 'Gasto' : 'No carrinho'}</div>
              <div className="tabular text-2xl font-bold text-brand-strong">{formatMoney(t.actual)}</div>
              <div className="tabular text-xs text-muted">
                {t.itemCount} de {all.itemCount} {all.itemCount === 1 ? 'item' : 'itens'}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted">Esperado desses itens</div>
              <div className="tabular text-2xl font-bold">{formatMoney(t.expectedOfBought)}</div>
              {t.expectedOfBought > 0 && <DeltaChip actual={t.actual} expected={t.expectedOfBought} />}
            </div>
          </div>
        </div>

        {inCart.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-line px-6 py-10 text-center text-muted">
            <ShoppingCart size={32} className="mx-auto mb-2 text-faint" />
            O carrinho está vazio. No mercado, toque em <b className="text-ink">Cheguei no mercado</b> e vá pondo os produtos.
          </div>
        ) : (
          <>
            <div className="px-1 text-sm text-muted">Toque no produto para corrigir quantidade ou preço.</div>
            {groups.map(({ sector, items }) => (
              <section key={sector.id} className="overflow-hidden rounded-3xl bg-card shadow-sm shadow-black/5">
                <div className="flex items-center gap-2 px-4 pt-3.5 pb-1.5">
                  <span className="text-xl leading-none">{sector.emoji}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">{sector.name}</span>
                  <span className="tabular text-sm text-muted">{formatMoney(totalsOf(items).actual)}</span>
                </div>
                <div className="divide-y divide-line">
                  {items.map((item) => (
                    <CartRow key={item.id} item={item} image={catalog[item.productKey]?.image} fallback={sector.emoji} onOpen={() => setConfirming(item)} onTakeOut={() => takeOut(item)} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      {removed && (
        <div className="fixed inset-x-0 z-40 flex justify-center px-4" style={{ bottom: 'calc(var(--sab) + 6rem)' }}>
          <div className="animate-fade flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-bg shadow-xl">
            <span className="min-w-0 flex-1 truncate">
              <b>{removed.item.name}</b> saiu do carrinho
            </span>
            <button onClick={undo} className="shrink-0 rounded-xl px-2 py-1 font-bold text-brand-soft active:bg-white/10">
              Desfazer
            </button>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)]" style={{ paddingBottom: 'calc(var(--sab) + 0.75rem)' }}>
        <div className="flex items-center gap-2 px-4 pt-3">
          <div className="min-w-0 flex-1">
            <div className="tabular text-xs text-muted">{finished ? 'Compra finalizada' : 'Total no carrinho'}</div>
            <div className="tabular truncate text-lg leading-tight font-bold">{formatMoney(t.actual)}</div>
          </div>
          {finished ? (
            <button onClick={() => setFinished(list.id, false)} className="flex h-12 items-center gap-2 rounded-2xl bg-bg px-4 font-semibold active:bg-line">
              <RotateCcw size={18} /> Reabrir
            </button>
          ) : (
            <button onClick={() => setFinishing(true)} className="flex h-12 items-center gap-2 rounded-2xl bg-brand px-5 font-semibold text-on-brand active:bg-brand-press">
              <CircleCheckBig size={18} /> Finalizar compra
            </button>
          )}
        </div>
      </div>

      <ConfirmSheet listId={list.id} item={live} onClose={() => setConfirming(null)} />
      <FinishSheet list={list} open={finishing} onClose={() => setFinishing(false)} onFinished={() => navigate('/', { replace: true })} />
    </div>
  )
}

function CartRow({ item, image, fallback, onOpen, onTakeOut }: { item: ListItem; image?: string | null; fallback: string; onOpen: () => void; onTakeOut: () => void }) {
  const qty = item.actualQty ?? item.qty
  const act = actualLine(item)
  const expOfBought = item.expectedPrice == null ? null : Math.round(item.expectedPrice * qty)
  return (
    <div className="flex items-center gap-2 py-2.5 pr-3 pl-4">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <ProductThumb image={image} fallback={fallback} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{item.name}</div>
          <div className="tabular truncate text-sm text-muted">
            {formatQty(qty)} {item.unit}
            {item.actualPrice != null && ` · ${formatMoney(item.actualPrice)}`}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular font-bold">{formatMoney(act ?? 0)}</div>
          {expOfBought != null && act != null && <DeltaChip compact actual={act} expected={expOfBought} />}
        </div>
      </button>
      <button onClick={onTakeOut} className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-xs font-semibold text-over active:bg-over-soft" aria-label={`Tirar ${item.name} do carrinho`}>
        <Undo2 size={18} />
        Tirar
      </button>
    </div>
  )
}
