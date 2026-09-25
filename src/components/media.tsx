import { useState } from 'react'
import { MapPin } from 'lucide-react'
import type { Market } from '@/lib/types'

/** Foto do produto; sem foto (ou se ela não carregar, ex. offline) cai no emoji do setor. */
export function ProductThumb({ image, fallback, size = 44, className = '' }: { image?: string | null; fallback: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = image && failed !== image
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-line ${showImage ? 'bg-photo' : 'bg-bg'} ${className}`}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img src={image} alt="" loading="lazy" onError={() => setFailed(image)} className="size-full object-contain p-0.5" />
      ) : (
        <span style={{ fontSize: size * 0.5 }} className="leading-none">
          {fallback}
        </span>
      )}
    </span>
  )
}

const MARKET_COLORS = ['#1e7a46', '#c2410c', '#1d4ed8', '#7c3aed', '#be123c', '#0f766e', '#a16207', '#4338ca']

/** Cor estável por nome: o mesmo mercado sempre com a mesma cor. */
export function marketColor(name: string): string {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return MARKET_COLORS[h % MARKET_COLORS.length]
}

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}

export function MarketAvatar({ market, size = 28 }: { market: Pick<Market, 'name'>; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: marketColor(market.name), fontSize: size * 0.38 }}
    >
      {initials(market.name)}
    </span>
  )
}

export function MarketChip({ market, onClick, placeholder = 'Escolher mercado' }: { market?: Market; onClick?: () => void; placeholder?: string }) {
  if (!market) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-faint px-3 py-1.5 text-sm font-medium text-muted active:bg-bg"
      >
        <MapPin size={14} /> {placeholder}
      </button>
    )
  }
  return (
    <button type="button" onClick={onClick} className="inline-flex max-w-full items-center gap-2 rounded-full bg-bg py-1 pr-3 pl-1 text-sm font-semibold active:bg-line">
      <MarketAvatar market={market} size={24} />
      <span className="truncate">{market.name}</span>
    </button>
  )
}
