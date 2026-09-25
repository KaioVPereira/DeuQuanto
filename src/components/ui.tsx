import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { formatDelta, formatPercent } from '@/lib/format'

export function Header({ title, subtitle, back, right }: { title: ReactNode; subtitle?: ReactNode; back?: boolean; right?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="pt-safe sticky top-0 z-30 bg-bg/95 backdrop-blur-sm">
      <div className="flex min-h-16 items-center gap-2 px-3">
        {back && (
          <button onClick={() => navigate(-1)} className="rounded-full p-2.5 active:bg-line" aria-label="Voltar">
            <ArrowLeft size={22} />
          </button>
        )}
        <div className={`min-w-0 flex-1 ${back ? '' : 'pl-2'}`}>
          <div className="truncate text-xl font-bold tracking-tight">{title}</div>
          {subtitle && <div className="truncate text-sm text-muted">{subtitle}</div>}
        </div>
        {right}
      </div>
    </header>
  )
}

export function Fab({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="bottom-safe fixed right-4 z-30 flex items-center gap-2 rounded-2xl bg-brand px-5 py-4 font-semibold text-on-brand shadow-lg shadow-brand/30 active:bg-brand-press"
    >
      {children}
    </button>
  )
}

export function PrimaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full rounded-2xl bg-brand px-4 py-3.5 text-base font-semibold text-on-brand active:bg-brand-press disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`w-full rounded-2xl bg-bg px-4 py-3.5 text-base font-semibold text-ink active:bg-line disabled:opacity-40 ${className}`}>
      {children}
    </button>
  )
}

/** Chip de diferença pago × esperado: vermelho = gastou mais, verde = economizou. */
export function DeltaChip({ actual, expected, size = 'sm', compact }: { actual: number; expected: number; size?: 'sm' | 'md'; compact?: boolean }) {
  const delta = actual - expected
  if (expected === 0) return null
  const tone = delta > 0 ? 'bg-over-soft text-over' : delta < 0 ? 'bg-under-soft text-under' : 'bg-bg text-muted'
  return (
    <span className={`tabular inline-flex items-center gap-1 rounded-full font-semibold ${tone} ${size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'}`}>
      {compact ? formatPercent(delta / expected) : <>{formatDelta(delta)} <span className="opacity-75">({formatPercent(delta / expected)})</span></>}
    </span>
  )
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.min(100, (value / max) * 100)
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function MenuItem({ icon, children, onClick, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left font-medium active:bg-bg ${danger ? 'text-over' : ''}`}>
      <span className={danger ? 'text-over' : 'text-muted'}>{icon}</span>
      {children}
    </button>
  )
}
