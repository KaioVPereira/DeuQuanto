const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Centavos → "R$ 12,34". */
export function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return money.format(cents / 100)
}

/** Diferença com sinal: "+R$ 1,20" / "−R$ 0,50". */
export function formatDelta(cents: number): string {
  if (cents === 0) return money.format(0)
  const sign = cents > 0 ? '+' : '−'
  return sign + money.format(Math.abs(cents) / 100)
}

export function formatPercent(ratio: number): string {
  const pct = Math.round(ratio * 1000) / 10
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : ''
  return `${sign}${Math.abs(pct).toLocaleString('pt-BR')}%`
}

export function formatQty(qty: number): string {
  return qty.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/** "2026-09-24" → "24/09/2026". */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "2026-09-24" → "Qui, 24 de setembro" (com o ano só quando não é o ano corrente). */
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const year = y === new Date().getFullYear() ? '' : ` de ${y}`
  return `${WEEKDAYS[date.getDay()]}, ${d} de ${MONTHS[m - 1]}${year}`
}

export function todayIso(): string {
  const now = new Date()
  const off = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - off).toISOString().slice(0, 10)
}

/** Normaliza o nome para casar "Açúcar  " com "acucar". */
export function productKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
