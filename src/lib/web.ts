import { CapacitorHttp } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { isNative } from './native'
import { productKey } from './format'
import type { WebProduct } from './types'

const TIMEOUT = 10_000

export class HttpError extends Error {
  status: number
  constructor(status: number) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

/**
 * GET que devolve JSON. No celular vai pelo HTTP nativo: o catálogo do Atacadão não
 * libera CORS, então um fetch do WebView seria barrado. No navegador (dev) passa
 * pelo proxy do Vite (veja vite.config.ts).
 */
async function getJson(url: string, devUrl = url, timeout = TIMEOUT): Promise<unknown> {
  if (isNative) {
    const res = await CapacitorHttp.get({
      url,
      headers: { Accept: 'application/json', 'User-Agent': 'DeuQuanto/0.1 (Android)' },
      connectTimeout: timeout,
      readTimeout: timeout,
    })
    if (res.status < 200 || res.status >= 300) throw new HttpError(res.status)
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  }
  const res = await fetch(devUrl, { signal: AbortSignal.timeout(timeout) })
  if (!res.ok) throw new HttpError(res.status)
  return res.json()
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Cache é só atalho; sem ele o app busca de novo.
  }
}

// ---------- Fotos e preços: catálogo online do Atacadão (loja VTEX) ----------

// O endereço sem /io responde 308 para este; chamando direto evitamos depender do
// HTTP nativo seguir o redirect.
const ATACADAO_SEARCH = 'https://www.atacadao.com.br/io/api/catalog_system/pub/products/search'

interface VtexProduct {
  productId: string
  productName: string
  items?: {
    images?: { imageUrl: string }[]
    sellers?: { commertialOffer?: { Price?: number; AvailableQuantity?: number } }[]
  }[]
}

/** Miniatura 240×240 servida pela própria CDN da VTEX (~10 KB em vez da foto cheia). */
function thumbnail(url: string): string {
  return url.replace(/\/arquivos\/ids\/(\d+)\//, '/arquivos/ids/$1-240-240/').replace(/\?.*$/, '')
}

const searchCache = new Map<string, Promise<WebProduct[]>>()

export function searchProducts(term: string): Promise<WebProduct[]> {
  const key = productKey(term)
  const cached = searchCache.get(key)
  if (cached) return cached
  const query = `?ft=${encodeURIComponent(term.trim())}&_from=0&_to=11`
  const promise = getJson(ATACADAO_SEARCH + query, '/proxy/atacadao/io/api/catalog_system/pub/products/search' + query)
    .then((data) => {
      if (!Array.isArray(data)) return []
      const seen = new Set<string>()
      const out: WebProduct[] = []
      for (const p of data as VtexProduct[]) {
        const item = p.items?.[0]
        const image = item?.images?.[0]?.imageUrl
        if (!image) continue
        // A mesma embalagem aparece repetida (um por vendedor/kit).
        const nameKey = productKey(p.productName)
        if (seen.has(nameKey)) continue
        seen.add(nameKey)
        const offer = item?.sellers?.map((s) => s.commertialOffer).find((o) => (o?.Price ?? 0) > 0 && (o?.AvailableQuantity ?? 0) > 0)
        out.push({
          id: String(p.productId),
          name: p.productName,
          image: thumbnail(image),
          price: offer?.Price ? Math.round(offer.Price * 100) : null,
          store: 'Atacadão',
        })
      }
      return out.slice(0, 8)
    })
    .catch((err) => {
      // Falha não fica em cache: sem sinal agora, pode funcionar daqui a pouco.
      searchCache.delete(key)
      throw err
    })
  searchCache.set(key, promise)
  return promise
}

// ---------- Mercados perto de mim: GPS + OpenStreetMap (Overpass) ----------

export interface NearbyMarket {
  osmId: string
  name: string
  address?: string
  lat: number
  lon: number
  /** Metros. */
  distance: number
}

interface OsmElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6_371_000 * 2 * Math.asin(Math.sqrt(a))
}

export class LocationError extends Error {}

export type NearbyStage = 'locating' | 'locating-gps' | 'searching' | 'searching-backup'

export interface Coords {
  lat: number
  lon: number
  /** Veio da última posição guardada, não de agora. */
  stale?: boolean
  /** Raio de incerteza em metros. ~2000 quando o usuário só liberou a localização aproximada. */
  accuracy?: number
}

const LAST_POS_KEY = 'lc-last-pos'
const LAST_POS_MAX_AGE = 6 * 60 * 60_000

type GeoFailure = 'denied' | 'disabled' | 'timeout' | 'other'

/** Plugin no Android: code "OS-PLUG-GLOC-0003"; navegador: code numérico do GeolocationPositionError. */
function classifyGeoError(err: unknown): GeoFailure {
  const e = err as { code?: unknown; message?: unknown }
  if (typeof e?.code === 'number') return e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'other'
  const code = Number(/GLOC-(d+)/.exec(String(e?.code ?? ''))?.[1] ?? NaN)
  const msg = String(e?.message ?? err).toLowerCase()
  if (code === 3 || msg.includes('denied')) return 'denied'
  if (code === 7 || code === 9 || code === 17 || msg.includes('not enabled') || msg.includes('turned off')) return 'disabled'
  if (code === 10 || msg.includes('in time') || msg.includes('timeout')) return 'timeout'
  return 'other'
}

/**
 * Posição atual em até duas tentativas. A primeira (econômica, aceita posição de até
 * 10 min) costuma responder em 1–2 s, mas às vezes não responde nunca — em lugar
 * fechado a localização por rede pode não sair. Aí tenta o GPS com mais folga e, se
 * nada vier, usa a última posição conhecida.
 */
export async function currentPosition(onStage?: (stage: NearbyStage) => void): Promise<Coords> {
  const attempts = [
    { stage: 'locating' as const, options: { enableHighAccuracy: false, timeout: 8_000, maximumAge: 10 * 60_000 } },
    { stage: 'locating-gps' as const, options: { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10 * 60_000 } },
  ]
  for (const { stage, options } of attempts) {
    onStage?.(stage)
    try {
      const pos = await Geolocation.getCurrentPosition(options)
      const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }
      writeCache(LAST_POS_KEY, { ...coords, at: Date.now() })
      return coords
    } catch (err) {
      const failure = classifyGeoError(err)
      if (failure === 'denied') throw new LocationError('A permissão de localização foi negada. Dá para liberar em Configurações › Apps › Deu Quanto? › Permissões.')
      if (failure === 'disabled') throw new LocationError('A localização do celular está desligada. Ligue e tente de novo.')
      // timeout ou outro: segue para a próxima tentativa
    }
  }
  const last = readCache<Coords & { at: number }>(LAST_POS_KEY)
  if (last && Date.now() - last.at < LAST_POS_MAX_AGE) return { lat: last.lat, lon: last.lon, stale: true }
  throw new LocationError('O celular não conseguiu achar sua localização agora (é comum em lugar fechado). Tente de novo perto de uma janela ou use "Digitar nome".')
}

// O servidor público do Overpass limita consultas por aparelho: duas seguidas e a
// terceira volta 429 depois de ~15 s. Por isso: consulta leve, cache por região
// (supermercado não muda de lugar) e um segundo servidor de reserva.
const OVERPASS_SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
const RADIUS = 4000
const NEARBY_CACHE_KEY = 'lc-nearby-v1'
const NEARBY_TTL = 14 * 24 * 60 * 60_000
/** Já buscou a menos disso daqui? Reaproveita a busca. */
const REUSE_WITHIN = 1500

type RawMarket = Omit<NearbyMarket, 'distance'>
interface CachedArea {
  lat: number
  lon: number
  at: number
  markets: RawMarket[]
}

function parseOverpass(data: unknown): RawMarket[] {
  const { elements, remark } = data as { elements?: OsmElement[]; remark?: string }
  // Erro de execução do Overpass (memória, timeout) vem como 200 com a lista vazia e o
  // motivo em "remark" — tratar como sucesso mostraria "nenhum mercado" e iria pro cache.
  if (remark && !elements?.length) throw new Error(`Overpass: ${remark}`)
  const markets: RawMarket[] = []
  for (const el of elements ?? []) {
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    const tags = el.tags ?? {}
    if (lat == null || lon == null || !tags.name) continue
    const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ')
    markets.push({ osmId: `${el.type}/${el.id}`, name: tags.name, address: street || tags['addr:suburb'] || undefined, lat, lon })
  }
  return markets
}

async function fetchOverpass(lat: number, lon: number, onStage?: (stage: NearbyStage) => void): Promise<RawMarket[]> {
  // timeout/maxsize menores que o padrão (180 s / 512 MB) tornam a consulta "barata" e o
  // servidor libera a vaga antes. Não baixar muito o maxsize: com 2 MB a busca num
  // raio de 4 km em São Paulo já estoura e volta vazia.
  const query = `[out:json][timeout:15][maxsize:67108864];nwr["shop"~"^(supermarket|wholesale)$"]["name"](around:${RADIUS},${lat},${lon});out center tags 60;`
  let lastError: unknown
  for (const [i, server] of OVERPASS_SERVERS.entries()) {
    onStage?.(i === 0 ? 'searching' : 'searching-backup')
    const url = `${server}?data=${encodeURIComponent(query)}`
    try {
      return parseOverpass(await getJson(url, url, 20_000))
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

export async function nearbyMarkets(lat: number, lon: number, onStage?: (stage: NearbyStage) => void): Promise<NearbyMarket[]> {
  const areas = (readCache<CachedArea[]>(NEARBY_CACHE_KEY) ?? []).filter((a) => Date.now() - a.at < NEARBY_TTL)
  const hit = areas.find((a) => distanceMeters(lat, lon, a.lat, a.lon) < REUSE_WITHIN)
  let raw: RawMarket[]
  if (hit) {
    raw = hit.markets
  } else {
    raw = await fetchOverpass(lat, lon, onStage)
    // Vazio não vai pro cache: pode ser mapa incompleto ali, e vale tentar de novo depois.
    if (raw.length > 0) writeCache(NEARBY_CACHE_KEY, [{ lat, lon, at: Date.now(), markets: raw }, ...areas].slice(0, 12))
  }
  return raw
    .map((m) => ({ ...m, distance: distanceMeters(lat, lon, m.lat, m.lon) }))
    .filter((m) => m.distance <= RADIUS)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 20)
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}
