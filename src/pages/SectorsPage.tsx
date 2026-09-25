import { useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { Header } from '@/components/ui'
import { Sheet } from '@/components/Sheet'
import { Label, TextField } from '@/components/inputs'
import { PrimaryButton } from '@/components/ui'
import { FALLBACK_SECTOR, useStore } from '@/store/store'
import type { Sector } from '@/lib/types'

const EMOJIS = ['🥬', '🍎', '🥩', '🐟', '🍗', '🧀', '🥛', '🍞', '🍚', '🥫', '🍝', '🧂', '🥤', '🍺', '🍷', '☕', '🍫', '🍪', '🍿', '🧊', '🍦', '🧽', '🧴', '🧻', '👶', '🐾', '💊', '🌿', '🔌', '📦']

export function SectorsPage() {
  const sectors = useStore((s) => s.sectors)
  const moveSector = useStore((s) => s.moveSector)
  const deleteSector = useStore((s) => s.deleteSector)
  const [editing, setEditing] = useState<Sector | 'new' | null>(null)

  return (
    <div className="min-h-dvh pb-10">
      <Header back title="Setores" subtitle="Deixe na ordem em que você anda no mercado" />
      <div className="space-y-2 px-4 pt-1">
        {sectors.map((s, idx) => (
          <div key={s.id} className="flex items-center gap-1 rounded-2xl bg-card py-1.5 pr-1.5 pl-4">
            <span className="text-2xl">{s.emoji}</span>
            <span className="ml-2 min-w-0 flex-1 truncate font-semibold">{s.name}</span>
            <IconBtn label="Subir" disabled={idx === 0} onClick={() => moveSector(s.id, -1)}>
              <ChevronUp size={20} />
            </IconBtn>
            <IconBtn label="Descer" disabled={idx === sectors.length - 1} onClick={() => moveSector(s.id, 1)}>
              <ChevronDown size={20} />
            </IconBtn>
            <IconBtn label="Editar" onClick={() => setEditing(s)}>
              <Pencil size={18} />
            </IconBtn>
            {s.id !== FALLBACK_SECTOR && (
              <IconBtn
                label="Excluir"
                onClick={() => {
                  if (window.confirm(`Excluir o setor "${s.name}"? Os produtos dele vão para "Outros".`)) deleteSector(s.id)
                }}
              >
                <Trash2 size={18} className="text-over" />
              </IconBtn>
            )}
          </div>
        ))}
        <button
          onClick={() => setEditing('new')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-4 font-semibold text-brand-strong active:bg-brand-soft"
        >
          <Plus size={20} /> Novo setor
        </button>
      </div>
      {editing && <SectorForm sector={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function IconBtn({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="grid size-10 place-items-center rounded-xl text-muted active:bg-bg disabled:opacity-25">
      {children}
    </button>
  )
}

function SectorForm({ sector, onClose }: { sector: Sector | null; onClose: () => void }) {
  const addSector = useStore((s) => s.addSector)
  const updateSector = useStore((s) => s.updateSector)
  const [name, setName] = useState(sector?.name ?? '')
  const [emoji, setEmoji] = useState(sector?.emoji ?? '📦')

  const save = () => {
    if (!name.trim()) return
    if (sector) updateSector(sector.id, { name: name.trim(), emoji })
    else addSector(name, emoji)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={sector ? 'Editar setor' : 'Novo setor'} footer={<PrimaryButton disabled={!name.trim()} onClick={save}>Salvar</PrimaryButton>}>
      <div className="space-y-5">
        <div>
          <Label>Nome</Label>
          <TextField autoFocus={!sector} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Utilidades" autoCapitalize="sentences" />
        </div>
        <div>
          <Label>Ícone</Label>
          <div className="grid grid-cols-6 gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`grid aspect-square place-items-center rounded-2xl text-2xl ${emoji === e ? 'bg-brand-soft ring-2 ring-brand' : 'bg-bg active:bg-line'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
