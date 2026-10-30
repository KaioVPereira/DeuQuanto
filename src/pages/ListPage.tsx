import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronRight, CircleCheckBig, List, Lightbulb, MoreVertical, Pencil, Plus, RotateCcw, ShoppingCart, Trash2, Users, X } from 'lucide-react'
import { DeltaChip, Header, MenuItem, ProgressBar } from '@/components/ui'
import { Sheet } from '@/components/Sheet'
import { EditListSheet } from '@/components/ListSheets'
import { ItemFormSheet } from '@/components/ItemFormSheet'
import { CartBar, FinishSheet } from '@/components/CartBar'
import { ShareSheet } from '@/components/ShareSheet'
import { SharedBanner } from '@/components/SharedBanner'
import { useLiveSync } from '@/sync/engine'
import { api } from '@/sync/api'
import { MarketChip, ProductThumb } from '@/components/media'
import { pendingFirst } from '@/components/items'
import { useList, useMarket, useStore } from '@/store/store'
import { totalsOf, type Totals } from '@/lib/calc'
import { formatDateLong, formatMoney } from '@/lib/format'
import type { ShoppingList } from '@/lib/types'

export function ListPage() {
  const { id } = useParams()
  const list = useList(id)
  useLiveSync(list?.id)
  if (!list) return <Navigate to="/" replace />
  return <ListView list={list} />
}

function ListView({ list }: { list: ShoppingList }) {
  const navigate = useNavigate()
  const market = useMarket(list.marketId)
  const sectors = useStore((s) => s.sectors)
  const tipSeen = useStore((s) => !!s.tipsSeen['cart-button'])
  const dismissTip = useStore((s) => s.dismissTip)
  const setFinished = useStore((s) => s.setFinished)
  const deleteList = useStore((s) => s.deleteList)
  const [adding, setAdding] = useState(false)
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const catalog = useStore((s) => s.catalog)

  const live = !!list.share && !list.share.ended

  const totals = totalsOf(list.items)
  const finished = !!list.finishedAt
  const groups = sectors
    .map((sector) => ({ sector, items: pendingFirst(list.items.filter((i) => i.sectorId === sector.id)) }))
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
        {list.share && <SharedBanner list={list} onClick={() => setSharing(true)} />}
        <SummaryCard
          totals={totals}
          finished={!!list.finishedAt}
          onOpen={() => navigate(`/lista/${list.id}/carrinho`)}
          market={<MarketChip market={market} onClick={() => setEditing(true)} placeholder="Em qual mercado?" />}
        />

        {list.items.length === 0 ? (
          <HowItWorks />
        ) : (
          <>
            {!finished && (
              <>
                <button
                  onClick={() => navigate(`/lista/${list.id}/mercado`)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-brand px-4 py-3.5 text-left text-on-brand shadow-sm active:bg-brand-press"
                >
                  <ShoppingCart size={24} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-lg leading-tight font-bold">Cheguei no mercado</div>
                    <div className="text-sm opacity-85">Escolha o setor e vá pondo no carrinho</div>
                  </div>
                  <ChevronRight size={20} />
                </button>
                {!tipSeen && (
                  <div className="flex gap-3 rounded-2xl bg-card p-3 text-sm shadow-sm shadow-black/5">
                    <Lightbulb size={20} className="mt-0.5 shrink-0 text-brand" />
                    <div className="flex-1">
                      Chegou no mercado? Toque em <b>Cheguei no mercado</b>, escolha o setor e toque no{' '}
                      <ShoppingCart size={15} className="inline align-[-2px] text-brand-strong" /> de cada produto que pegar, com o preço da gôndola.
                    </div>
                    <button onClick={() => dismissTip('cart-button')} className="-m-1 self-start rounded-full p-1 text-muted active:bg-line" aria-label="Entendi">
                      <X size={18} />
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Em casa: só os setores. Tocar abre os produtos dele (sem o carrinho — isso é no "Cheguei no mercado"). */}
            <div className="space-y-2.5">
              {groups.map(({ sector, items }) => {
                const t = totalsOf(items)
                const complete = t.checkedCount === t.itemCount
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
                          {t.itemCount} {t.itemCount === 1 ? 'item' : 'itens'}
                          {t.expected > 0 && ` · est. ${formatMoney(t.expected)}`}
                          {t.checkedCount > 0 && ` · ${t.checkedCount} no carrinho`}
                        </div>
                      </div>
                      {complete ? <CheckCircle2 size={24} className="text-brand" /> : <ChevronRight size={20} className="text-faint" />}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                      {items.slice(0, 6).map((i) => (
                        <ProductThumb key={i.id} image={catalog[i.productKey]?.image} fallback={sector.emoji} size={34} className={i.checked ? 'opacity-40' : ''} />
                      ))}
                      {items.length > 6 && <span className="tabular pl-1 text-sm font-semibold text-muted">+{items.length - 6}</span>}
                    </div>
                  </button>
                )
              })}
              <button
                onClick={() => navigate(`/lista/${list.id}/setor/todos`)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-brand-strong active:bg-brand-soft"
              >
                <List size={18} /> Ver a lista completa
              </button>
            </div>
          </>
        )}
      </div>

      <CartBar list={list} onAdd={() => setAdding(true)} onFinish={() => setFinishing(true)} />

      <ItemFormSheet open={adding} onClose={() => setAdding(false)} listId={list.id} mode={{ kind: 'add' }} />
      <EditListSheet list={list} open={editing} onClose={() => setEditing(false)} />
      <FinishSheet list={list} open={finishing} onClose={() => setFinishing(false)} onFinished={() => navigate('/', { replace: true })} />
      <ShareSheet list={list} open={sharing} onClose={() => setSharing(false)} />

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
          <MenuItem
            icon={<Users size={20} />}
            onClick={() => {
              setMenu(false)
              setSharing(true)
            }}
          >
            {live ? 'Compartilhamento' : 'Compartilhar com alguém'}
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
              const msg = !live
                ? `Excluir a lista "${list.name}"? Isso não pode ser desfeito.`
                : list.share!.isOwner
                  ? `Excluir a lista "${list.name}"? Ela deixa de ser compartilhada — quem entrou fica com uma cópia.`
                  : `Excluir a lista "${list.name}" deste celular? Você sai da lista; para os outros ela continua.`
              if (!window.confirm(msg)) return
              setMenu(false)
              // Avisa o servidor se der; sem internet, a lista sai daqui do mesmo jeito.
              if (live) void api.leave(list.share!.remoteId, list.share!.token).catch(() => {})
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

/** Lista vazia: explica o caminho todo, que não é óbvio na primeira vez. */
function HowItWorks() {
  const steps = [
    { icon: <Plus size={18} strokeWidth={2.5} />, text: <>Em casa, toque no <b className="text-ink">+</b> e monte a lista com o preço que você espera pagar.</> },
    { icon: <ShoppingCart size={18} />, text: <>No mercado, toque em <b className="text-ink">Cheguei no mercado</b>, escolha o setor e toque no carrinho de cada produto que pegar, com o preço da gôndola.</> },
    { icon: <CircleCheckBig size={18} />, text: <>No caixa, toque em <b className="text-ink">Finalizar</b> e veja quanto deu.</> },
  ]
  return (
    <div className="rounded-3xl border-2 border-dashed border-line px-5 py-6 text-muted">
      <div className="mb-4 text-center text-lg font-bold text-ink">Como funciona</div>
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-strong">{s.icon}</span>
            <span className="pt-1.5 text-sm leading-snug">{s.text}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 border-t border-line pt-4 text-center text-sm">
        Já está no mercado? No <b className="text-ink">+</b> dá para pôr direto no carrinho.
      </div>
    </div>
  )
}

/** Resumo da lista; tocar abre o carrinho (o chip do mercado continua sendo só dele). */
function SummaryCard({ totals: t, finished, market, onOpen }: { totals: Totals; finished: boolean; market: React.ReactNode; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="cursor-pointer rounded-3xl bg-card p-4 shadow-sm shadow-black/5 transition active:scale-[0.99]"
    >
      <div className="mb-3 w-fit" onClick={(e) => e.stopPropagation()}>
        {market}
      </div>
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
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm font-semibold text-brand-strong">
        <span className="flex items-center gap-2">
          <ShoppingCart size={17} /> Ver o carrinho{t.checkedCount > 0 && ` (${t.checkedCount})`}
        </span>
        <ChevronRight size={18} />
      </div>
    </div>
  )
}
