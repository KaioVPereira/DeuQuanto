import { useState } from 'react'
import { Sheet } from './Sheet'
import { Label, TextField } from './inputs'
import { PrimaryButton } from './ui'
import { MarketPicker } from './MarketPicker'
import { useStore } from '@/store/store'
import { formatDate, todayIso } from '@/lib/format'
import type { ShoppingList } from '@/lib/types'

export function NewListSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  if (!open) return null
  return <NewListForm onClose={onClose} onCreated={onCreated} />
}

function NewListForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const lists = useStore((s) => s.lists)
  const createList = useStore((s) => s.createList)
  const [date, setDate] = useState(todayIso())
  const [name, setName] = useState('')
  const [copyFrom, setCopyFrom] = useState<string | null>(null)
  // Sugere o mercado da última lista: quem compra sempre no mesmo lugar não precisa escolher.
  const [marketId, setMarketId] = useState<string | null>(() => [...lists].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.marketId ?? null)

  const recent = [...lists].filter((l) => l.items.length > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
  const defaultName = `Compras ${formatDate(date).slice(0, 5)}`

  const create = () => {
    const id = createList(name.trim() || defaultName, date, copyFrom, marketId)
    onClose()
    onCreated(id)
  }

  return (
    <Sheet open onClose={onClose} title="Nova lista" footer={<PrimaryButton onClick={create}>Criar lista</PrimaryButton>}>
      <div className="space-y-5">
        <div>
          <Label>Nome</Label>
          <TextField placeholder={defaultName} value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="sentences" />
        </div>
        <div>
          <Label>Data da compra</Label>
          <TextField type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Onde você vai comprar?</Label>
          <MarketPicker value={marketId} onChange={setMarketId} />
        </div>
        {recent.length > 0 && (
          <div>
            <Label>Começar a partir de</Label>
            <div className="space-y-2">
              <Choice active={copyFrom === null} onClick={() => setCopyFrom(null)} title="Lista em branco" />
              {recent.map((l) => (
                <Choice
                  key={l.id}
                  active={copyFrom === l.id}
                  onClick={() => setCopyFrom(l.id)}
                  title={`Copiar "${l.name}"`}
                  subtitle={`${formatDate(l.date)} · ${l.items.length} itens · preços atualizados pelo último pago`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

function Choice({ active, onClick, title, subtitle }: { active: boolean; onClick: () => void; title: string; subtitle?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left ${active ? 'border-brand bg-brand-soft' : 'border-line active:bg-bg'}`}
    >
      <span className={`size-5 shrink-0 rounded-full border-2 ${active ? 'border-brand bg-brand shadow-[inset_0_0_0_3px_var(--color-card)]' : 'border-faint'}`} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{title}</span>
        {subtitle && <span className="block text-sm text-muted">{subtitle}</span>}
      </span>
    </button>
  )
}

export function EditListSheet({ list, open, onClose }: { list: ShoppingList; open: boolean; onClose: () => void }) {
  if (!open) return null
  return <EditListForm list={list} onClose={onClose} />
}

function EditListForm({ list, onClose }: { list: ShoppingList; onClose: () => void }) {
  const updateList = useStore((s) => s.updateList)
  const [name, setName] = useState(list.name)
  const [date, setDate] = useState(list.date)
  const [marketId, setMarketId] = useState<string | null>(list.marketId ?? null)
  return (
    <Sheet
      open
      onClose={onClose}
      title="Editar lista"
      footer={
        <PrimaryButton
          disabled={!name.trim()}
          onClick={() => {
            updateList(list.id, { name: name.trim(), date, marketId })
            onClose()
          }}
        >
          Salvar
        </PrimaryButton>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Nome</Label>
          <TextField value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Data da compra</Label>
          <TextField type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>{list.finishedAt ? 'Onde você comprou' : 'Onde você vai comprar'}</Label>
          <MarketPicker value={marketId} onChange={setMarketId} />
        </div>
      </div>
    </Sheet>
  )
}
