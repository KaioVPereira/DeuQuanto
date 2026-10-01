import { useState } from 'react'
import { ArrowRightLeft, Check, Pencil, ShoppingCart, Trash2, Undo2 } from 'lucide-react'
import { Sheet } from './Sheet'
import { SectorGrid } from './inputs'
import { DeltaChip, MenuItem } from './ui'
import { ProductThumb } from './media'
import { useStore } from '@/store/store'
import { actualLine, expectedLine } from '@/lib/calc'
import { formatMoney, formatQty } from '@/lib/format'
import type { ListItem } from '@/lib/types'

export function ItemRow({
  item,
  image,
  fallback,
  addedBy,
  onCheck,
  onOpen,
}: {
  item: ListItem
  image?: string | null
  fallback: string
  /** Lista compartilhada: nome de quem adicionou, quando foi outra pessoa. */
  addedBy?: string | null
  onCheck: () => void
  onOpen: () => void
}) {
  const exp = expectedLine(item)
  const act = actualLine(item)
  const qty = item.checked ? (item.actualQty ?? item.qty) : item.qty
  const expOfBought = item.expectedPrice == null ? null : Math.round(item.expectedPrice * qty)

  return (
    <div className={`flex items-center gap-1 rounded-2xl bg-card pr-3 ${item.checked ? 'opacity-70' : ''}`}>
      <button onClick={onCheck} className="grid w-12 shrink-0 place-items-center self-stretch" aria-label={item.checked ? 'Alterar confirmação' : 'Confirmar no carrinho'}>
        <span
          className={`grid size-7 place-items-center rounded-full border-2 transition ${item.checked ? 'border-brand bg-brand text-on-brand' : 'border-faint'}`}
        >
          {item.checked && <Check size={16} strokeWidth={3} />}
        </span>
      </button>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left">
        <span className="relative shrink-0">
          <ProductThumb image={image} fallback={fallback} size={48} />
          {addedBy && (
            <span
              title={`Adicionado por ${addedBy}`}
              className="absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-on-brand ring-2 ring-card"
            >
              {addedBy.trim()[0]?.toUpperCase()}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`truncate font-semibold ${item.checked ? 'line-through decoration-faint' : ''}`}>{item.name}</div>
          <div className="tabular truncate text-sm text-muted">
            {formatQty(qty)} {item.unit}
            {item.checked
              ? item.actualPrice != null && ` · pago ${formatMoney(item.actualPrice)}`
              : item.expectedPrice != null
                ? ` · est. ${formatMoney(item.expectedPrice)}`
                : ' · sem preço'}
            {addedBy && <span className="text-brand-strong"> · por {addedBy}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {item.checked ? (
            <>
              <div className="tabular font-bold">{formatMoney(act)}</div>
              {expOfBought != null && act != null && <DeltaChip compact actual={act} expected={expOfBought} />}
            </>
          ) : (
            <div className="tabular font-semibold text-muted">{exp == null ? '' : formatMoney(exp)}</div>
          )}
        </div>
      </button>
    </div>
  )
}

interface ActionsProps {
  listId: string
  item: ListItem | null
  onClose: () => void
  onConfirm: (item: ListItem) => void
  onEdit: (item: ListItem) => void
}

export function ItemActionsSheet({ listId, item, onClose, onConfirm, onEdit }: ActionsProps) {
  const [moving, setMoving] = useState(false)
  const sectors = useStore((s) => s.sectors)
  const moveItem = useStore((s) => s.moveItem)
  const uncheckItem = useStore((s) => s.uncheckItem)
  const removeItem = useStore((s) => s.removeItem)

  const close = () => {
    setMoving(false)
    onClose()
  }

  if (!item) return null
  const sector = sectors.find((s) => s.id === item.sectorId)

  return (
    <Sheet open onClose={close} title={item.name}>
      {moving ? (
        <div className="space-y-3">
          <div className="text-sm text-muted">
            Mover de <b>{sector?.emoji} {sector?.name}</b> para… (fica salvo para as próximas listas)
          </div>
          <SectorGrid
            sectors={sectors}
            value={item.sectorId}
            onChange={(id) => {
              moveItem(listId, item.id, id)
              close()
            }}
          />
        </div>
      ) : (
        <div className="-mx-2">
          <MenuItem icon={<ShoppingCart size={20} />} onClick={() => onConfirm(item)}>
            {item.checked ? 'Alterar quantidade / preço pago' : 'Confirmar no carrinho'}
          </MenuItem>
          <MenuItem icon={<ArrowRightLeft size={20} />} onClick={() => setMoving(true)}>
            Mover para outro setor
          </MenuItem>
          <MenuItem icon={<Pencil size={20} />} onClick={() => onEdit(item)}>
            Editar item
          </MenuItem>
          {item.checked && (
            <MenuItem
              icon={<Undo2 size={20} />}
              onClick={() => {
                uncheckItem(listId, item.id)
                close()
              }}
            >
              Tirar do carrinho
            </MenuItem>
          )}
          <MenuItem
            danger
            icon={<Trash2 size={20} />}
            onClick={() => {
              removeItem(listId, item.id)
              close()
            }}
          >
            Remover da lista
          </MenuItem>
        </div>
      )}
    </Sheet>
  )
}
