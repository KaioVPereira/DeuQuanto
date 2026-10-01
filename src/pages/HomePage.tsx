import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, Settings, ShoppingBasket, UserPlus, Users } from 'lucide-react'
import { DeltaChip, Fab, Header } from '@/components/ui'
import { NewListSheet } from '@/components/ListSheets'
import { useMarket, useStore } from '@/store/store'
import { MarketAvatar } from '@/components/media'
import { listTotals } from '@/lib/calc'
import { formatDateLong, formatMoney } from '@/lib/format'
import type { ShoppingList } from '@/lib/types'
import { useAppUpdate } from '@/lib/appUpdate'

export function HomePage() {
  const navigate = useNavigate()
  const lists = useStore((s) => s.lists)
  const [creating, setCreating] = useState(false)
  const { updateAvailable } = useAppUpdate()

  const sorted = [...lists].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const open = sorted.filter((l) => !l.finishedAt)
  const done = sorted.filter((l) => l.finishedAt)

  return (
    <div className="min-h-dvh pb-28">
      <Header
        title="Minhas listas"
        right={
          <div className="flex items-center">
            <button onClick={() => navigate('/entrar')} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-muted active:bg-line">
              <UserPlus size={18} /> Entrar
            </button>
            <button onClick={() => navigate('/ajustes')} className="relative rounded-full p-2.5 text-muted active:bg-line" aria-label="Ajustes">
              <Settings size={20} />
              {updateAvailable && <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-over ring-2 ring-bg" aria-label="Nova versão" />}
            </button>
          </div>
        }
      />

      <div className="space-y-6 px-4 pt-2">
        {lists.length === 0 && <EmptyState onCreate={() => setCreating(true)} onJoin={() => navigate('/entrar')} />}

        <HistorySummary lists={done} />

        {open.length > 0 && (
          <Section title="Em andamento">
            {open.map((l) => (
              <ListCard key={l.id} list={l} onClick={() => navigate(`/lista/${l.id}`)} />
            ))}
          </Section>
        )}

        {done.length > 0 && (
          <Section title="Compras finalizadas">
            {done.map((l) => (
              <ListCard key={l.id} list={l} onClick={() => navigate(`/lista/${l.id}`)} />
            ))}
          </Section>
        )}
      </div>

      <Fab onClick={() => setCreating(true)}>
        <Plus size={20} strokeWidth={2.5} /> Nova lista
      </Fab>

      <NewListSheet open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/lista/${id}`)} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function ListCard({ list, onClick }: { list: ShoppingList; onClick: () => void }) {
  const t = listTotals(list)
  const market = useMarket(list.marketId)
  const bought = t.checkedCount > 0
  const finished = !!list.finishedAt
  const leftOut = t.itemCount - t.checkedCount
  return (
    <button onClick={onClick} className="w-full rounded-3xl bg-card p-4 text-left shadow-sm shadow-black/5 active:scale-[0.99] active:bg-card/80">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">{list.name}</div>
          <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
            {market && <MarketAvatar market={market} size={18} />}
            <span className="truncate">
              {formatDateLong(list.date)}
              {market && ` · ${market.name}`}
            </span>
          </div>
          {list.share && <SharedWith list={list} />}
        </div>
        <div className="flex items-center gap-1 pt-1 text-sm text-muted">
          <span className="tabular">
            {t.checkedCount}/{t.itemCount}
          </span>
          <ChevronRight size={18} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {/* Finalizada: compara só o que entrou no carrinho, senão o que ficou de fora distorce. */}
        <Stat label={finished && leftOut > 0 ? 'Esperado (comprados)' : 'Esperado'} value={formatMoney(finished ? t.expectedOfBought : t.expected)} />
        <Stat label={finished ? 'Gasto' : 'No carrinho'} value={bought ? formatMoney(t.actual) : '—'} strong />
      </div>

      {bought && t.expectedOfBought > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-muted">
          <DeltaChip actual={t.actual} expected={t.expectedOfBought} />
          <span>{finished && leftOut > 0 ? `${leftOut} ${leftOut === 1 ? 'item ficou' : 'itens ficaram'} de fora (lista inteira ${formatMoney(t.expected)})` : 'nos itens comprados'}</span>
        </div>
      )}
    </button>
  )
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl bg-bg px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={`tabular text-base ${strong ? 'font-bold' : 'font-semibold'}`}>{value}</div>
    </div>
  )
}

/** Quanto, no geral, as compras finalizadas fugiram do esperado. */
function HistorySummary({ lists }: { lists: ShoppingList[] }) {
  const recent = lists.slice(0, 5)
  if (recent.length === 0) return null
  let expected = 0
  let actual = 0
  for (const l of recent) {
    const t = listTotals(l)
    expected += t.expectedOfBought
    actual += t.actual
  }
  if (expected === 0) return null
  return (
    <div className="rounded-3xl bg-ink p-4 text-bg">
      <div className="text-sm text-bg/70">
        {recent.length === 1 ? 'Última compra' : `Últimas ${recent.length} compras`}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className="tabular text-2xl font-bold">{formatMoney(actual)}</span>
        <span className="tabular text-sm text-bg/70">gasto · {formatMoney(expected)} esperado</span>
      </div>
      <div className="mt-2">
        <DeltaChip actual={actual} expected={expected} size="md" />
      </div>
    </div>
  )
}

/** "Com Ana" embaixo do nome da lista compartilhada. */
function SharedWith({ list }: { list: ShoppingList }) {
  const share = list.share!
  const others = share.members.filter((m) => m.id !== share.memberId).map((m) => m.name)
  const text = share.ended ? 'Não é mais compartilhada' : others.length ? `Com ${others.join(', ')}` : 'Compartilhada · ninguém entrou ainda'
  return (
    <div className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${share.ended ? 'text-muted' : 'text-brand-strong'}`}>
      <Users size={15} className="shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  )
}

function EmptyState({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 pt-16 text-center">
      <div className="grid size-20 place-items-center rounded-3xl bg-brand-soft text-brand">
        <ShoppingBasket size={40} />
      </div>
      <div className="mt-5 text-xl font-bold">Nenhuma lista ainda</div>
      <p className="mt-2 text-muted">
        Monte a lista em casa com o preço que você espera pagar. No mercado, confirme cada item com o preço real — no fim você vê quanto
        esperava e quanto gastou.
      </p>
      <button onClick={onCreate} className="mt-6 rounded-2xl bg-brand px-6 py-3.5 font-semibold text-on-brand active:bg-brand-press">
        Criar minha primeira lista
      </button>
      <button onClick={onJoin} className="mt-3 rounded-2xl px-6 py-3 font-semibold text-brand-strong active:bg-brand-soft">
        Entrar numa lista compartilhada
      </button>
    </div>
  )
}
