import { useState } from 'react'
import { Check, LocateFixed, Loader2, Plus } from 'lucide-react'
import { useStore } from '@/store/store'
import { currentPosition, formatDistance, HttpError, LocationError, nearbyMarkets, type NearbyMarket, type NearbyStage } from '@/lib/web'
import { MarketAvatar } from './media'
import { TextField } from './inputs'

type Nearby =
  | { state: 'idle' }
  | { state: 'loading'; stage: NearbyStage }
  | { state: 'error'; message: string }
  | { state: 'ok'; markets: NearbyMarket[]; stale: boolean; coarse: boolean }

const STAGE_TEXT: Record<NearbyStage, string> = {
  locating: 'Pegando sua localização…',
  'locating-gps': 'Ainda sem localização — tentando pelo GPS…',
  searching: 'Procurando supermercados perto de você…',
  'searching-backup': 'O mapa está lento, tentando outro servidor…',
}

function nearbyErrorMessage(err: unknown): string {
  if (err instanceof LocationError) return err.message
  if (err instanceof HttpError && err.status === 429)
    return 'O serviço de mapas (gratuito) está recebendo acesso demais agora. Espere um minuto e tente de novo, ou use "Digitar nome".'
  return 'Não consegui buscar os mercados agora. Confira a internet e tente de novo, ou use "Digitar nome".'
}

/**
 * Escolha do mercado: os que você já usou, os que estão perto (GPS + OpenStreetMap)
 * ou um nome digitado.
 */
export function MarketPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const markets = useStore((s) => s.markets)
  const lists = useStore((s) => s.lists)
  const addMarket = useStore((s) => s.addMarket)
  const [nearby, setNearby] = useState<Nearby>({ state: 'idle' })
  const [typing, setTyping] = useState(false)
  const [newName, setNewName] = useState('')

  // Mais usados primeiro.
  const uses = new Map<string, number>()
  for (const l of lists) if (l.marketId) uses.set(l.marketId, (uses.get(l.marketId) ?? 0) + 1)
  const known = [...markets].sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.name.localeCompare(b.name))

  const findNearby = async () => {
    const onStage = (stage: NearbyStage) => setNearby({ state: 'loading', stage })
    onStage('locating')
    try {
      const pos = await currentPosition(onStage)
      const found = await nearbyMarkets(pos.lat, pos.lon, onStage)
      setNearby({ state: 'ok', markets: found, stale: !!pos.stale, coarse: (pos.accuracy ?? 0) > 1000 })
    } catch (err) {
      setNearby({ state: 'error', message: nearbyErrorMessage(err) })
    }
  }

  const pickNearby = (m: NearbyMarket) => {
    onChange(addMarket({ name: m.name, address: m.address, osmId: m.osmId }))
    setNearby({ state: 'idle' })
  }

  const saveTyped = () => {
    if (!newName.trim()) return
    onChange(addMarket({ name: newName }))
    setNewName('')
    setTyping(false)
  }

  return (
    <div className="space-y-2">
      {known.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {known.map((m) => {
            const active = m.id === value
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange(active ? null : m.id)}
                className={`inline-flex max-w-full items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm font-semibold ${
                  active ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line active:bg-bg'
                }`}
              >
                <MarketAvatar market={m} size={26} />
                <span className="truncate">{m.name}</span>
                {active && <Check size={16} />}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={findNearby}
          disabled={nearby.state === 'loading'}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-line px-3 py-3 text-sm font-semibold active:bg-bg disabled:opacity-60"
        >
          {nearby.state === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
          Perto de mim
        </button>
        <button
          type="button"
          onClick={() => setTyping((t) => !t)}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-line px-3 py-3 text-sm font-semibold active:bg-bg"
        >
          <Plus size={16} /> Digitar nome
        </button>
      </div>

      {typing && (
        <div className="flex gap-2">
          <TextField
            autoFocus
            placeholder="Ex.: Assaí Coxipó"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveTyped()}
            autoCapitalize="words"
          />
          <button type="button" onClick={saveTyped} disabled={!newName.trim()} className="rounded-2xl bg-brand px-4 font-semibold text-on-brand disabled:opacity-40">
            OK
          </button>
        </div>
      )}

      {nearby.state === 'loading' && <div className="px-1 text-sm text-muted">{STAGE_TEXT[nearby.stage]}</div>}
      {nearby.state === 'ok' && nearby.stale && (
        <div className="px-1 text-sm text-muted">Não deu para pegar a localização agora — usando a última posição conhecida.</div>
      )}
      {nearby.state === 'ok' && nearby.coarse && (
        <div className="rounded-2xl bg-over-soft px-3 py-2 text-sm text-over">
          Localização aproximada (±2 km): os mercados e as distâncias podem não bater. Para acertar, ative "Localização precisa" em Configurações ›
          Apps › Deu Quanto? › Permissões.
        </div>
      )}
      {nearby.state === 'error' && <div className="rounded-2xl bg-over-soft px-3 py-2 text-sm text-over">{nearby.message}</div>}
      {nearby.state === 'ok' &&
        (nearby.markets.length === 0 ? (
          <div className="px-1 text-sm text-muted">Nenhum supermercado encontrado no mapa por perto. Use "Digitar nome".</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line">
            {nearby.markets.map((m) => (
              <button key={m.osmId} type="button" onClick={() => pickNearby(m)} className="flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-b-0 active:bg-bg">
                <MarketAvatar market={m} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{m.name}</span>
                  {m.address && <span className="block truncate text-xs text-muted">{m.address}</span>}
                </span>
                <span className="tabular shrink-0 text-sm text-muted">{formatDistance(m.distance)}</span>
              </button>
            ))}
          </div>
        ))}
    </div>
  )
}
