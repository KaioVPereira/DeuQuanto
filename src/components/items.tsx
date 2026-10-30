import { useState } from 'react'
import { ArrowRightLeft, Check, Pencil, ShoppingCart, ShoppingCartPlus, Trash2, Undo2 } from 'lucide-react'
import { Sheet } from './Sheet'
import { SectorGrid } from './inputs'
import { DeltaChip, MenuItem } from './ui'
import { ProductThumb } from './media'
import { ConfirmSheet } from './ConfirmSheet'
import { ItemFormSheet } from './ItemFormSheet'
import { useStore } from '@/store/store'
import { actualLine, expectedLine } from '@/lib/calc'
import { formatMoney, formatQty } from '@/lib/format'
import type { ListItem, ShoppingList } from '@/lib/types'

/**
 * Linhas de item com tudo o que um toque abre: pôr no carrinho, o menu do item e a edição.
 * `row(item)` desenha a linha com o carrinho (no mercado), `planRow(item)` sem ele (em casa);
 * `sheets` vai uma vez no fim da página.
 */
export function useItemSheets(list: ShoppingList) {
  const sectors = useStore((s) => s.sectors)
  const catalog = useStore((s) => s.catalog)
  const [confirming, setConfirming] = useState<ListItem | null>(null)
  const [actions, setActions] = useState<ListItem | null>(null)
  const [editing, setEditing] = useState<ListItem | null>(null)

  // Mantém a referência "viva" do item aberto no painel (o store troca o objeto a cada edição).
  const live = (item: ListItem | null) => (item ? (list.items.find((i) => i.id === item.id) ?? null) : null)

  // Selo de quem adicionou: só nos itens que outra pessoa pôs depois de compartilhar.
  const share = list.share
  const addedBy = (item: ListItem) =>
    share && item.createdBy && item.createdBy !== share.memberId ? (share.members.find((m) => m.id === item.createdBy)?.name ?? null) : null

  const planRow = (item: ListItem) => (
    <PlanRow
      key={item.id}
      item={item}
      image={catalog[item.productKey]?.image}
      fallback={sectors.find((s) => s.id === item.sectorId)?.emoji ?? '🛒'}
      addedBy={addedBy(item)}
      onClick={() => setActions(item)}
    />
  )

  const row = (item: ListItem) => (
    <ItemRow
      key={item.id}
      item={item}
      image={catalog[item.productKey]?.image}
      fallback={sectors.find((s) => s.id === item.sectorId)?.emoji ?? '🛒'}
      addedBy={addedBy(item)}
      onCheck={() => setConfirming(item)}
      onOpen={() => setActions(item)}
    />
  )

  const sheets = (
    <>
      <ConfirmSheet listId={list.id} item={live(confirming)} onClose={() => setConfirming(null)} />
      <ItemActionsSheet
        listId={list.id}
        item={live(actions)}
        onClose={() => setActions(null)}
        onConfirm={(item) => {
          setActions(null)
          setConfirming(item)
        }}
        onEdit={(item) => {
          setActions(null)
          setEditing(item)
        }}
      />
      {editing && <ItemFormSheet open onClose={() => setEditing(null)} listId={list.id} mode={{ kind: 'edit', item: editing }} />}
    </>
  )

  return { row, planRow, sheets }
}

/** Os que faltam pegar primeiro, os do carrinho no fim. */
export const pendingFirst = (items: ListItem[]) => [...items.filter((i) => !i.checked), ...items.filter((i) => i.checked)]

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
      <button onClick={onCheck} className="group grid w-12 shrink-0 place-items-center self-stretch" aria-label={item.checked ? 'Alterar confirmação' : 'Confirmar no carrinho'}>
        {item.checked ? (
          <span className="grid size-7 place-items-center rounded-full border-2 border-brand bg-brand text-on-brand">
            <Check size={16} strokeWidth={3} />
          </span>
        ) : (
          // Fora do carrinho: cara de botão (fundo + carrinho com "+"), não de marcador de lista.
          <span className="grid size-[38px] place-items-center rounded-xl bg-brand-soft text-brand-strong transition group-active:scale-90">
            <ShoppingCartPlus size={20} strokeWidth={2.2} />
          </span>
        )}
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

/** Linha sem o botão do carrinho (lista em casa): o produto e o estimado; tocar abre editar/mover/remover. */
export function PlanRow({ item, image, fallback, addedBy, onClick }: { item: ListItem; image?: string | null; fallback: string; addedBy: string | null; onClick: () => void }) {
  const exp = expectedLine(item)
  const act = actualLine(item)
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-bg ${item.checked ? 'opacity-60' : ''}`}>
      <ProductThumb image={image} fallback={fallback} size={40} />
      <div className="min-w-0 flex-1">
        <div className={`truncate font-semibold ${item.checked ? 'line-through decoration-faint' : ''}`}>{item.name}</div>
        <div className="tabular truncate text-sm text-muted">
          {formatQty(item.checked ? (item.actualQty ?? item.qty) : item.qty)} {item.unit}
          {item.checked ? ' · no carrinho' : item.expectedPrice != null ? ` · est. ${formatMoney(item.expectedPrice)}` : ' · sem preço'}
          {addedBy && <span className="text-brand-strong"> · por {addedBy}</span>}
        </div>
      </div>
      {item.checked ? <Check size={18} className="shrink-0 text-brand" /> : null}
      <span className="tabular shrink-0 font-semibold text-muted">{formatMoney((item.checked ? act : exp) ?? 0)}</span>
    </button>
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
