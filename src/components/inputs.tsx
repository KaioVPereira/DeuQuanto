import { useEffect, useState, type InputHTMLAttributes, type Ref } from 'react'
import { Minus, Plus } from 'lucide-react'
import { formatMoney, formatQty } from '@/lib/format'
import { UNITS, type Sector, type Unit } from '@/lib/types'

const fieldClass =
  'w-full rounded-2xl border border-line bg-bg px-4 py-3 text-base outline-none transition focus:border-brand focus:bg-card'

export function TextField({ ref, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} className={`${fieldClass} ${className}`} />
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-sm font-medium text-muted">{children}</div>
}

/**
 * Campo de dinheiro estilo app de banco: os dígitos entram pela direita
 * (digitar 1-2-3-4 dá R$ 12,34). Guarda centavos.
 */
export function MoneyInput({
  value,
  onChange,
  placeholder = 'R$ 0,00',
  autoFocus,
  ref,
}: {
  value: number | null
  onChange: (cents: number | null) => void
  placeholder?: string
  autoFocus?: boolean
  ref?: Ref<HTMLInputElement>
}) {
  // O cursor precisa ficar sempre no fim, senão o dígito entra no meio do valor.
  // O tamanho é lido dentro do rAF: medido antes, ele devolveria o cursor para trás
  // depois que o React reformata o valor.
  const moveCaretToEnd = (el: HTMLInputElement) => {
    requestAnimationFrame(() => {
      const len = el.value.length
      el.setSelectionRange(len, len)
    })
  }
  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={value == null ? '' : formatMoney(value)}
      onFocus={(e) => moveCaretToEnd(e.currentTarget)}
      onClick={(e) => moveCaretToEnd(e.currentTarget)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 9)
        onChange(digits ? parseInt(digits, 10) : null)
        moveCaretToEnd(e.currentTarget)
      }}
      className={`${fieldClass} tabular text-lg font-semibold`}
    />
  )
}

export function QtyInput({ value, onChange, unit }: { value: number; onChange: (qty: number) => void; unit: Unit }) {
  const decimal = UNITS.find((u) => u.value === unit)?.decimal ?? false
  const step = decimal ? 0.5 : unit === 'g' ? 100 : 1
  const [text, setText] = useState(formatQty(value))

  // Mantém o texto em sincronia quando o valor muda por fora (botões, troca de produto).
  useEffect(() => {
    setText((t) => (parseQty(t) === value ? t : formatQty(value)))
  }, [value])

  const bump = (dir: 1 | -1) => {
    const next = Math.max(step, Math.round((value + dir * step) * 1000) / 1000)
    onChange(next)
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => bump(-1)} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-bg active:bg-line" aria-label="Menos">
        <Minus size={20} />
      </button>
      <input
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const n = parseQty(e.target.value)
          if (n != null && n > 0) onChange(n)
        }}
        onBlur={() => setText(formatQty(value))}
        className={`${fieldClass} tabular min-w-0 text-center text-lg font-semibold`}
      />
      <button type="button" onClick={() => bump(1)} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-bg active:bg-line" aria-label="Mais">
        <Plus size={20} />
      </button>
    </div>
  )
}

function parseQty(text: string): number | null {
  const n = parseFloat(text.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function UnitPicker({ value, onChange }: { value: Unit; onChange: (u: Unit) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {UNITS.map((u) => (
        <button
          key={u.value}
          type="button"
          onClick={() => onChange(u.value)}
          className={`rounded-xl px-3 py-2 text-sm font-medium ${value === u.value ? 'bg-brand text-on-brand' : 'bg-bg text-muted active:bg-line'}`}
        >
          {u.label}
        </button>
      ))}
    </div>
  )
}

export function SectorGrid({ sectors, value, onChange }: { sectors: Sector[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {sectors.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(s.id)}
          className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-sm font-medium transition ${
            value === s.id ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-card active:bg-bg'
          }`}
        >
          <span className="text-lg leading-none">{s.emoji}</span>
          <span className="min-w-0 truncate">{s.name}</span>
        </button>
      ))}
    </div>
  )
}
