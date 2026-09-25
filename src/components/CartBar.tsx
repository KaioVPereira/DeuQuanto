import { useState } from 'react'
import { CircleCheckBig, Plus, RotateCcw } from 'lucide-react'
import { Sheet } from './Sheet'
import { Label } from './inputs'
import { DeltaChip, PrimaryButton, SecondaryButton } from './ui'
import { MarketPicker } from './MarketPicker'
import { useStore } from '@/store/store'
import { totalsOf } from '@/lib/calc'
import { formatMoney } from '@/lib/format'
import type { ShoppingList } from '@/lib/types'

/**
 * Barra fixa no rodapé da lista: o total do carrinho sempre à vista e o Finalizar a um
 * toque — dá para finalizar com itens faltando, eles só não entram no gasto.
 */
export function CartBar({ list, onAdd, onFinish }: { list: ShoppingList; onAdd: () => void; onFinish: () => void }) {
  const setFinished = useStore((s) => s.setFinished)
  const t = totalsOf(list.items)
  const finished = !!list.finishedAt

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)]" style={{ paddingBottom: 'calc(var(--sab) + 0.75rem)' }}>
      <div className="flex items-center gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <div className="tabular text-xs text-muted">
            {finished ? 'Compra finalizada' : 'No carrinho'} · {t.checkedCount} de {t.itemCount}
          </div>
          <div className="tabular truncate text-lg leading-tight font-bold">
            {formatMoney(t.actual)}
            {t.expected > 0 && <span className="ml-1.5 text-sm font-medium text-muted">de {formatMoney(t.expected)}</span>}
          </div>
        </div>
        {finished ? (
          <button onClick={() => setFinished(list.id, false)} className="flex h-12 items-center gap-2 rounded-2xl bg-bg px-4 font-semibold active:bg-line">
            <RotateCcw size={18} /> Reabrir
          </button>
        ) : (
          <>
            <button onClick={onAdd} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand-strong active:bg-line" aria-label="Adicionar item">
              <Plus size={24} strokeWidth={2.5} />
            </button>
            <button onClick={onFinish} className="flex h-12 items-center gap-2 rounded-2xl bg-brand px-4 font-semibold text-on-brand active:bg-brand-press">
              <CircleCheckBig size={18} /> Finalizar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function FinishSheet({ list, open, onClose, onFinished }: { list: ShoppingList; open: boolean; onClose: () => void; onFinished: () => void }) {
  if (!open) return null
  return <FinishForm list={list} onClose={onClose} onFinished={onFinished} />
}

function FinishForm({ list, onClose, onFinished }: { list: ShoppingList; onClose: () => void; onFinished: () => void }) {
  const setFinished = useStore((s) => s.setFinished)
  const [marketId, setMarketId] = useState<string | null>(list.marketId ?? null)
  const t = totalsOf(list.items)
  const pending = list.items.filter((i) => !i.checked)

  return (
    <Sheet
      open
      onClose={onClose}
      title="Finalizar compra"
      footer={
        <div className="space-y-2">
          <PrimaryButton
            onClick={() => {
              setFinished(list.id, true, marketId)
              onClose()
              onFinished()
            }}
          >
            {pending.length > 0 ? `Finalizar sem ${pending.length === 1 ? '1 item' : `${pending.length} itens`}` : 'Finalizar e salvar'}
          </PrimaryButton>
          <SecondaryButton onClick={onClose}>Continuar comprando</SecondaryButton>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-bg p-3">
            <div className="text-sm text-muted">Esperado</div>
            <div className="tabular text-xl font-bold">{formatMoney(t.expectedOfBought)}</div>
            <div className="text-xs text-muted">nos itens comprados</div>
          </div>
          <div className="rounded-2xl bg-bg p-3">
            <div className="text-sm text-muted">Gasto</div>
            <div className="tabular text-xl font-bold text-brand-strong">{formatMoney(t.actual)}</div>
            <div className="text-xs text-muted">
              {t.checkedCount} {t.checkedCount === 1 ? 'item' : 'itens'}
            </div>
          </div>
        </div>

        {t.expectedOfBought > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-3">
            <span className="font-medium">{t.actual > t.expectedOfBought ? 'Gastou a mais' : t.actual < t.expectedOfBought ? 'Economizou' : 'Bateu certinho'}</span>
            <DeltaChip actual={t.actual} expected={t.expectedOfBought} size="md" />
          </div>
        )}

        {pending.length > 0 && (
          <div>
            <Label>Ficaram de fora ({pending.length})</Label>
            <div className="rounded-2xl bg-bg px-4 py-3 text-sm">
              {pending.slice(0, 8).map((i) => i.name).join(', ')}
              {pending.length > 8 && ` e mais ${pending.length - 8}`}
              <div className="mt-1 text-xs text-muted">Não entram no gasto nem na comparação com o esperado.</div>
            </div>
          </div>
        )}

        <div>
          <Label>Onde você comprou?</Label>
          <MarketPicker value={marketId} onChange={setMarketId} />
        </div>
      </div>
    </Sheet>
  )
}
