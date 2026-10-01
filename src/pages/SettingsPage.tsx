import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, LayoutGrid, Moon, ShoppingBasket, Smartphone, Sun, UserRound } from 'lucide-react'
import { Header } from '@/components/ui'
import { useStore } from '@/store/store'
import { ACCENTS, resolveMode, watchSystemMode, type Accent, type ThemeMode } from '@/lib/theme'
import { useAppUpdate } from '@/lib/appUpdate'
import { TextField } from '@/components/inputs'

const MODES: { id: ThemeMode; label: string; icon: ReactNode }[] = [
  { id: 'light', label: 'Claro', icon: <Sun size={18} /> },
  { id: 'dark', label: 'Escuro', icon: <Moon size={18} /> },
  { id: 'system', label: 'Automático', icon: <Smartphone size={18} /> },
]

export function SettingsPage() {
  const navigate = useNavigate()
  const { themeMode, accent } = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const device = useStore((s) => s.device)
  const setDeviceName = useStore((s) => s.setDeviceName)
  const [name, setName] = useState(device?.name ?? '')
  const app = useAppUpdate()
  // As prévias acompanham o modo em uso agora (inclusive o do celular, no automático).
  const [previewMode, setPreviewMode] = useState(resolveMode(themeMode))
  useEffect(() => {
    setPreviewMode(resolveMode(themeMode))
    if (themeMode !== 'system') return
    return watchSystemMode(() => setPreviewMode(resolveMode('system')))
  }, [themeMode])

  return (
    <div className="min-h-dvh pb-10">
      <Header back title="Ajustes" />
      <div className="space-y-7 px-4 pt-1">
        <section>
          <SectionTitle>Aparência</SectionTitle>
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-card p-1.5 shadow-sm shadow-black/5">
            {MODES.map((m) => {
              const active = m.id === themeMode
              return (
                <button
                  key={m.id}
                  onClick={() => setSettings({ themeMode: m.id })}
                  className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                    active ? 'bg-brand text-on-brand' : 'text-muted active:bg-bg'
                  }`}
                >
                  {m.icon}
                  {m.label}
                </button>
              )
            })}
          </div>
          {themeMode === 'system' && <p className="mt-2 px-1 text-sm text-muted">Fica claro ou escuro junto com o celular.</p>}
        </section>

        <section>
          <SectionTitle>Cor do tema</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {ACCENTS.map((a) => (
              <ThemePreview key={a.id} accent={a.id} name={a.name} mode={previewMode} selected={a.id === accent} onClick={() => setSettings({ accent: a.id })} />
            ))}
          </div>
        </section>

        <section>
          <SectionTitle>Lista</SectionTitle>
          <button onClick={() => navigate('/setores')} className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left font-semibold shadow-sm shadow-black/5 active:bg-bg">
            <LayoutGrid size={20} className="text-muted" />
            <span className="flex-1">
              Setores do mercado
              <span className="block text-sm font-normal text-muted">Criar, renomear e pôr na ordem do seu mercado</span>
            </span>
            <ChevronRight size={18} className="text-faint" />
          </button>
        </section>

        <section>
          <SectionTitle>Listas compartilhadas</SectionTitle>
          <div className="rounded-2xl bg-card px-4 py-4 shadow-sm shadow-black/5">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <UserRound size={20} className="text-muted" /> Seu nome
            </div>
            <TextField
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== device?.name && setDeviceName(name)}
              placeholder="Como os outros te veem na lista"
              autoCapitalize="words"
              maxLength={40}
            />
            <p className="mt-2 text-sm text-muted">Aparece para quem está na mesma lista, e nos itens que você adicionar.</p>
          </div>
        </section>

        <section>
          <SectionTitle>Aplicativo</SectionTitle>
          <button onClick={() => navigate('/ajustes/app')} className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left font-semibold shadow-sm shadow-black/5 active:bg-bg">
            <ShoppingBasket size={20} className="text-muted" />
            <span className="flex-1">
              Versão e atualização
              <span className="block text-sm font-normal text-muted">
                {app.installed ? `Instalada: ${app.installed.version}` : 'Baixar o app para Android'}
                {app.latest && ` · mais recente: ${app.latest.version}`}
              </span>
            </span>
            {app.updateAvailable && <span className="rounded-full bg-over-soft px-2.5 py-1 text-xs font-bold text-over">nova</span>}
            <ChevronRight size={18} className="text-faint" />
          </button>
        </section>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">{children}</h2>
}

/**
 * Miniatura da tela no tema: o botão recebe data-mode/data-accent, então tudo dentro
 * dele usa as cores daquele tema — é o CSS de verdade, não uma imitação.
 */
function ThemePreview({ accent, name, mode, selected, onClick }: { accent: Accent; name: string; mode: 'light' | 'dark'; selected: boolean; onClick: () => void }) {
  return (
    <button
      data-mode={mode}
      data-accent={accent}
      onClick={onClick}
      className={`overflow-hidden rounded-3xl border-2 bg-bg text-left transition active:scale-[0.98] ${selected ? 'border-brand' : 'border-line'}`}
    >
      <div className="p-3">
        <div className="rounded-2xl bg-card p-2.5 shadow-sm shadow-black/5">
          <div className="h-2 w-14 rounded-full bg-ink/80" />
          <div className="mt-1.5 h-1.5 w-20 rounded-full bg-muted/40" />
          <div className="mt-2.5 flex items-center gap-2">
            <span className="grid size-4 place-items-center rounded-full bg-brand text-on-brand">
              <Check size={10} strokeWidth={3.5} />
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full w-2/3 rounded-full bg-brand" />
            </div>
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <span className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-bold text-on-brand">Finalizar</span>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line bg-card px-3 py-2 text-sm font-semibold text-ink">
        {name}
        {selected && (
          <span className="grid size-5 place-items-center rounded-full bg-brand text-on-brand">
            <Check size={13} strokeWidth={3} />
          </span>
        )}
      </div>
    </button>
  )
}
