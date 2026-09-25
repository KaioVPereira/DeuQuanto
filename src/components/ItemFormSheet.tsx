import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, History, Loader2, Search } from 'lucide-react'
import { Sheet } from './Sheet'
import { Label, MoneyInput, QtyInput, SectorGrid, TextField, UnitPicker } from './inputs'
import { PrimaryButton } from './ui'
import { ProductThumb } from './media'
import { useStore } from '@/store/store'
import { averagePaid, cheapestMarket, suggestedPrice } from '@/lib/calc'
import { formatDate, formatMoney, formatQty, productKey, todayIso } from '@/lib/format'
import { searchPriceOnWeb } from '@/lib/native'
import { searchProducts } from '@/lib/web'
import type { CatalogEntry, ListItem, Unit, WebProduct } from '@/lib/types'

export type ItemFormMode = { kind: 'add'; defaultSectorId?: string } | { kind: 'edit'; item: ListItem }

interface Props {
  open: boolean
  onClose: () => void
  listId: string
  mode: ItemFormMode
}

type SearchState = 'idle' | 'loading' | 'done' | 'error'

export function ItemFormSheet(props: Props) {
  // Remonta a cada abertura para começar com o formulário limpo.
  if (!props.open) return null
  return <ItemForm {...props} />
}

function ItemForm({ onClose, listId, mode }: Props) {
  const catalog = useStore((s) => s.catalog)
  const sectors = useStore((s) => s.sectors)
  const markets = useStore((s) => s.markets)
  const list = useStore((s) => s.lists.find((l) => l.id === listId))
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const marketId = list?.marketId ?? null

  const editing = mode.kind === 'edit' ? mode.item : null
  const initialSector = editing?.sectorId ?? (mode.kind === 'add' ? (mode.defaultSectorId ?? null) : null)

  const [name, setName] = useState(editing?.name ?? '')
  const [sectorId, setSectorId] = useState<string | null>(initialSector)
  const [unit, setUnit] = useState<Unit>(editing?.unit ?? 'un')
  const [qty, setQty] = useState(editing?.qty ?? 1)
  const [price, setPrice] = useState<number | null>(editing?.expectedPrice ?? null)
  const [touched, setTouched] = useState({ sector: !!editing, price: !!editing, unit: !!editing })
  const [showSectors, setShowSectors] = useState(!initialSector)
  const [nameFocused, setNameFocused] = useState(false)
  const [lastAdded, setLastAdded] = useState<string | null>(null)
  const [sectorFromMemory, setSectorFromMemory] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // Foto: a escolhida, se o usuário mexeu nela, e o produto online que ela representa.
  const [image, setImage] = useState<string | null>(editing ? (catalog[editing.productKey]?.image ?? null) : null)
  const [imageTouched, setImageTouched] = useState(!!editing)
  const [picked, setPicked] = useState<WebProduct | null>(null)
  const [results, setResults] = useState<WebProduct[]>([])
  const [search, setSearch] = useState<SearchState>('idle')

  const key = productKey(name)
  const entry: CatalogEntry | undefined = key ? catalog[key] : undefined
  const alreadyInList = mode.kind === 'add' ? list?.items.find((i) => i.productKey === key) : undefined

  const suggestions = useMemo(() => {
    if (!key) return []
    return Object.values(catalog)
      .filter((e) => e.key !== key && e.key.includes(key))
      .sort((a, b) => b.timesUsed - a.timesUsed || a.name.localeCompare(b.name))
      .slice(0, 5)
  }, [catalog, key])

  // Produto conhecido: puxa o setor salvo, a unidade, a foto e o último preço, sem
  // atropelar o que o usuário já escolheu à mão neste formulário.
  useEffect(() => {
    if (!entry || editing) return
    if (!touched.sector) {
      setSectorId(entry.sectorId)
      setShowSectors(false)
      setSectorFromMemory(true)
    }
    if (!touched.unit) setUnit(entry.unit)
    if (!touched.price) setPrice(suggestedPrice(entry, marketId))
    if (!imageTouched && entry.image) {
      setImage(entry.image)
      setPicked(null)
    }
  }, [entry?.key])

  // Busca as fotos enquanto digita (espera a pessoa parar de digitar um instante).
  useEffect(() => {
    const term = name.trim()
    if (term.length < 3) {
      setResults([])
      setSearch('idle')
      return
    }
    let cancelled = false
    setSearch('loading')
    const timer = setTimeout(() => {
      searchProducts(term)
        .then((found) => {
          if (cancelled) return
          setResults(found)
          setSearch('done')
        })
        .catch(() => !cancelled && setSearch('error'))
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [name])

  // Sem foto salva e sem escolha manual: a primeira encontrada já vira a foto.
  useEffect(() => {
    if (imageTouched || entry?.image) return
    const first = results[0] ?? null
    setImage(first?.image ?? null)
    setPicked(first)
  }, [results])

  const pick = (product: WebProduct | null) => {
    setImage(product?.image ?? null)
    setPicked(product)
    setImageTouched(true)
    if (product?.price != null && price == null) setPrice(product.price)
  }

  const applySuggestion = (e: CatalogEntry) => {
    setName(e.name)
    setSectorId(e.sectorId)
    setShowSectors(false)
    setSectorFromMemory(true)
    setUnit(e.unit)
    setPrice(suggestedPrice(e, marketId))
    setTouched({ sector: false, price: false, unit: false })
    setImage(e.image ?? null)
    setImageTouched(!!e.image)
    setPicked(null)
    nameRef.current?.blur()
  }

  const sector = sectors.find((s) => s.id === sectorId)
  const canSave = key.length > 0 && !!sectorId && qty > 0
  const avg = averagePaid(entry)
  const last = entry?.paid[0]
  const cheapest = cheapestMarket(entry)
  const marketName = (id?: string | null) => markets.find((m) => m.id === id)?.name
  const webPrice = picked?.price != null ? { price: picked.price, store: picked.store } : entry?.webRef ? { price: entry.webRef.price, store: entry.webRef.store } : null

  const save = () => {
    if (!canSave || !sectorId) return
    const webRef = picked ? (picked.price != null ? { price: picked.price, name: picked.name, store: picked.store, at: todayIso() } : null) : imageTouched && !image ? null : undefined
    const input = { name, sectorId, unit, qty, expectedPrice: price, image, webRef }
    if (editing) {
      updateItem(listId, editing.id, input)
      onClose()
      return
    }
    addItem(listId, input)
    setLastAdded(`${name.trim()} → ${sector?.emoji} ${sector?.name}`)
    // Fica aberto para ir adicionando em sequência.
    setName('')
    setQty(1)
    setUnit('un')
    setPrice(null)
    setSectorId(mode.kind === 'add' ? (mode.defaultSectorId ?? null) : null)
    setShowSectors(!(mode.kind === 'add' && mode.defaultSectorId))
    setSectorFromMemory(false)
    setTouched({ sector: false, price: false, unit: false })
    setImage(null)
    setImageTouched(false)
    setPicked(null)
    nameRef.current?.focus()
  }

  const savedImageOption = entry?.image && !results.some((r) => r.image === entry.image) ? entry.image : null

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Editar item' : 'Adicionar item'}
      footer={
        <PrimaryButton disabled={!canSave} onClick={save}>
          {editing ? 'Salvar' : alreadyInList ? `Somar à lista (${formatQty(alreadyInList.qty)} → ${formatQty(alreadyInList.qty + qty)})` : 'Adicionar à lista'}
        </PrimaryButton>
      }
    >
      <div className="space-y-5">
        {lastAdded && (
          <div className="animate-pop flex items-center gap-2 rounded-2xl bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong">
            <Check size={16} /> <span className="truncate">{lastAdded}</span>
          </div>
        )}

        <div>
          <Label>Produto</Label>
          <div className="flex items-center gap-3">
            <ProductThumb image={image} fallback={sector?.emoji ?? '🛒'} size={52} />
            <div className="relative min-w-0 flex-1">
              <TextField
                ref={nameRef}
                autoFocus={!editing}
                placeholder="Ex.: Arroz 5kg, Detergente…"
                value={name}
                autoCapitalize="sentences"
                onChange={(e) => {
                  setName(e.target.value)
                  setLastAdded(null)
                }}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setTimeout(() => setNameFocused(false), 150)}
                onKeyDown={(e) => e.key === 'Enter' && nameRef.current?.blur()}
              />
              {nameFocused && suggestions.length > 0 && (
                <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-line bg-card shadow-lg">
                  {suggestions.map((s) => {
                    const sec = sectors.find((x) => x.id === s.sectorId)
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applySuggestion(s)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-bg"
                      >
                        <ProductThumb image={s.image} fallback={sec?.emoji ?? '🛒'} size={36} />
                        <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                        <span className="tabular text-sm text-muted">{formatMoney(suggestedPrice(s, marketId))}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          {alreadyInList && (
            <div className="mt-1.5 text-sm text-over">
              Já está na lista ({formatQty(alreadyInList.qty)} {alreadyInList.unit}) — a quantidade vai ser somada.
            </div>
          )}

          {name.trim().length >= 3 && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-muted">
                Foto do produto
                {search === 'loading' && <Loader2 size={14} className="animate-spin" />}
              </div>
              <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
                <PhotoOption selected={!image} onClick={() => pick(null)} label="Sem foto">
                  <span className="text-3xl">{sector?.emoji ?? '🛒'}</span>
                </PhotoOption>
                {savedImageOption && (
                  <PhotoOption
                    selected={image === savedImageOption}
                    onClick={() => {
                      setImage(savedImageOption)
                      setPicked(null)
                      setImageTouched(true)
                    }}
                    label="A que você usou antes"
                  >
                    <img src={savedImageOption} alt="" className="size-full object-contain" />
                  </PhotoOption>
                )}
                {results.map((r) => (
                  <PhotoOption key={r.id} selected={image === r.image} onClick={() => pick(r)} label={r.name} price={r.price}>
                    <img src={r.image} alt="" loading="lazy" className="size-full object-contain" />
                  </PhotoOption>
                ))}
                {search === 'loading' && results.length === 0 && [0, 1, 2].map((i) => <div key={i} className="h-[138px] w-24 shrink-0 animate-pulse rounded-2xl bg-bg" />)}
              </div>
              {search === 'error' && <div className="mt-1 text-xs text-muted">Sem conexão agora — as fotos aparecem quando a internet voltar.</div>}
              {search === 'done' && results.length === 0 && <div className="mt-1 text-xs text-muted">Nenhuma foto encontrada para “{name.trim()}”.</div>}
            </div>
          )}
        </div>

        <div>
          <Label>Setor do mercado</Label>
          {!showSectors && sector ? (
            <div className="flex items-center gap-3 rounded-2xl border border-brand bg-brand-soft px-4 py-3">
              <span className="text-xl">{sector.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-brand-strong">{sector.name}</div>
                {sectorFromMemory && !touched.sector && <div className="text-xs text-brand">Setor salvo da última vez</div>}
              </div>
              <button type="button" onClick={() => setShowSectors(true)} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-brand-strong active:bg-card/60">
                Trocar
              </button>
            </div>
          ) : (
            <SectorGrid
              sectors={sectors}
              value={sectorId}
              onChange={(id) => {
                setSectorId(id)
                setTouched((t) => ({ ...t, sector: true }))
                setShowSectors(false)
              }}
            />
          )}
        </div>

        <div>
          <Label>Quantidade</Label>
          <QtyInput value={qty} onChange={setQty} unit={unit} />
          <div className="mt-2">
            <UnitPicker
              value={unit}
              onChange={(u) => {
                setUnit(u)
                setTouched((t) => ({ ...t, unit: true }))
                if (u === 'g' && qty < 100) setQty(500)
                else if (u !== 'g' && qty >= 100) setQty(1)
              }}
            />
          </div>
        </div>

        <div>
          <Label>Preço médio estimado (por {unit})</Label>
          <MoneyInput
            value={price}
            onChange={(v) => {
              setPrice(v)
              setTouched((t) => ({ ...t, price: true }))
            }}
          />

          {(last || webPrice || cheapest) && (
            <div className="mt-3 rounded-2xl bg-bg p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                <History size={14} /> Referências de preço
              </div>
              <div className="flex flex-wrap gap-2">
                {last && (
                  <PriceChip
                    label={`Último pago${marketName(last.marketId) ? ` · ${marketName(last.marketId)}` : ''} (${formatDate(last.date).slice(0, 5)})`}
                    value={last.price}
                    active={price === last.price}
                    onClick={() => setPrice(last.price)}
                  />
                )}
                {avg != null && entry && entry.paid.length > 1 && (
                  <PriceChip label={`Média de ${Math.min(entry.paid.length, 5)} compras`} value={avg} active={price === avg} onClick={() => setPrice(avg)} />
                )}
                {cheapest && cheapest.price !== last?.price && (
                  <PriceChip label={`Mais barato · ${marketName(cheapest.marketId) ?? 'outro mercado'}`} value={cheapest.price} active={price === cheapest.price} onClick={() => setPrice(cheapest.price)} />
                )}
                {webPrice && (
                  <PriceChip label={`Online · ${webPrice.store}`} value={webPrice.price} active={price === webPrice.price} onClick={() => setPrice(webPrice.price)} />
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!key}
            onClick={() => searchPriceOnWeb(name)}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-line px-4 py-3 text-sm font-semibold text-ink active:bg-bg disabled:opacity-40"
          >
            <Search size={16} /> Pesquisar em outras lojas (Google)
          </button>

          {price != null && (
            <div className="mt-3 flex items-baseline justify-between text-sm">
              <span className="text-muted">Total estimado</span>
              <span className="tabular text-base font-bold">{formatMoney(Math.round(price * qty))}</span>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function PhotoOption({ selected, onClick, label, price, children }: { selected: boolean; onClick: () => void; label: string; price?: number | null; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-24 shrink-0 flex-col rounded-2xl border-2 p-1.5 text-left transition ${selected ? 'border-brand bg-brand-soft' : 'border-line bg-card active:bg-bg'}`}
    >
      <span className="grid h-20 w-full place-items-center overflow-hidden rounded-xl bg-photo">{children}</span>
      <span className="mt-1 line-clamp-2 text-[11px] leading-tight text-muted">{label}</span>
      {price != null && <span className="tabular mt-0.5 text-xs font-bold">{formatMoney(price)}</span>}
    </button>
  )
}

function PriceChip({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left ${active ? 'border-brand bg-brand-soft' : 'border-line bg-card active:bg-line'}`}
    >
      <div className="text-[11px] text-muted">{label}</div>
      <div className="tabular font-semibold">{formatMoney(value)}</div>
    </button>
  )
}
