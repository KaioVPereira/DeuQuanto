import { useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { Sheet } from './Sheet'
import { Label, MoneyInput, QtyInput } from './inputs'
import { DeltaChip, PrimaryButton } from './ui'
import { ProductThumb } from './media'
import { useStore } from '@/store/store'
import { formatMoney, formatQty } from '@/lib/format'
import type { ListItem } from '@/lib/types'

interface Props {
  listId: string
  item: ListItem | null
  onClose: () => void
}

export function ConfirmSheet({ listId, item, onClose }: Props) {
  if (!item) return null
  return <ConfirmForm key={item.id} listId={listId} item={item} onClose={onClose} />
}

function ConfirmForm({ listId, item, onClose }: { listId: string; item: ListItem; onClose: () => void }) {
  const checkItem = useStore((s) => s.checkItem)
  const image = useStore((s) => s.catalog[item.productKey]?.image)
  const emoji = useStore((s) => s.sectors.find((x) => x.id === item.sectorId)?.emoji ?? '🛒')
  const [qty, setQty] = useState(item.actualQty ?? item.qty)
  const [price, setPrice] = useState<number | null>(item.actualPrice)

  const total = price == null ? null : Math.round(price * qty)
  const expectedTotal = item.expectedPrice == null ? null : Math.round(item.expectedPrice * qty)

  const confirm = () => {
    if (price == null) return
    checkItem(listId, item.id, qty, price)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      footer={
        <PrimaryButton disabled={price == null} onClick={confirm} className="flex items-center justify-center gap-2">
          <ShoppingCart size={18} />
          {total == null ? 'Informe o preço' : `Confirmar no carrinho · ${formatMoney(total)}`}
        </PrimaryButton>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl bg-bg p-3 text-sm">
          <ProductThumb image={image} fallback={emoji} size={72} />
          <div className="min-w-0">
            <div className="text-muted">Planejado</div>
            <div className="tabular font-semibold">
              {formatQty(item.qty)} {item.unit}
              {item.expectedPrice != null && (
                <>
                  {' '}× {formatMoney(item.expectedPrice)} = {formatMoney(Math.round(item.expectedPrice * item.qty))}
                </>
              )}
            </div>
          </div>
        </div>

        <div>
          <Label>Quantidade no carrinho ({item.unit})</Label>
          <QtyInput value={qty} onChange={setQty} unit={item.unit} />
        </div>

        <div>
          <Label>Preço na gôndola agora (por {item.unit})</Label>
          <MoneyInput value={price} onChange={setPrice} autoFocus placeholder={item.expectedPrice != null ? `Estimado ${formatMoney(item.expectedPrice)}` : 'R$ 0,00'} />
          {item.expectedPrice != null && price !== item.expectedPrice && (
            <button
              type="button"
              onClick={() => setPrice(item.expectedPrice)}
              className="mt-2 rounded-xl border border-line px-3 py-2 text-sm font-medium active:bg-bg"
            >
              Mesmo do estimado ({formatMoney(item.expectedPrice)})
            </button>
          )}
        </div>

        {total != null && (
          <div className="rounded-2xl border border-line p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-muted">Total deste item</span>
              <span className="tabular text-xl font-bold">{formatMoney(total)}</span>
            </div>
            {expectedTotal != null && (
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted">vs. esperado {formatMoney(expectedTotal)}</span>
                <DeltaChip actual={total} expected={expectedTotal} />
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
