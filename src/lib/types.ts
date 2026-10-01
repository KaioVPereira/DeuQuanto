export type Unit = 'un' | 'kg' | 'g' | 'L' | 'pct' | 'cx'

export const UNITS: { value: Unit; label: string; decimal: boolean }[] = [
  { value: 'un', label: 'un', decimal: false },
  { value: 'kg', label: 'kg', decimal: true },
  { value: 'g', label: 'g', decimal: false },
  { value: 'L', label: 'L', decimal: true },
  { value: 'pct', label: 'pct', decimal: false },
  { value: 'cx', label: 'cx', decimal: false },
]

/** Uma "sublista": área do mercado (Limpeza, Bebidas...). */
export interface Sector {
  id: string
  name: string
  emoji: string
}

export interface ListItem {
  id: string
  /** Chave normalizada do produto no catálogo (ver `productKey`). */
  productKey: string
  name: string
  sectorId: string
  unit: Unit
  /** Quantidade planejada. */
  qty: number
  /** Preço unitário estimado, em centavos. */
  expectedPrice: number | null
  /** Preenchidos quando o item é confirmado no mercado. */
  checked: boolean
  actualQty: number | null
  actualPrice: number | null
  checkedAt: string | null
  /** Lista compartilhada: membro que adicionou (null = já estava na lista quando foi compartilhada). */
  createdBy?: string | null
}

export interface ShareMember {
  id: string
  name: string
  isOwner: boolean
}

/** Presente quando a lista está compartilhada (ou esteve — ver `ended`). */
export interface ListShare {
  /** Id da lista no servidor (o id local continua o mesmo de antes de compartilhar). */
  remoteId: string
  token: string
  /** Quem é este celular dentro da lista. */
  memberId: string
  isOwner: boolean
  code: string
  /** Até onde este celular já recebeu as alterações. */
  seq: number
  members: ShareMember[]
  lastSyncAt: string | null
  /** A dona parou de compartilhar ou te tiraram: a lista fica como cópia só deste celular. */
  ended?: 'closed' | 'removed' | null
}

export interface ShoppingList {
  id: string
  name: string
  /** Data da compra, YYYY-MM-DD. */
  date: string
  createdAt: string
  finishedAt: string | null
  /** Onde pretende comprar; ao finalizar vira onde comprou de fato. Ausente em listas antigas. */
  marketId?: string | null
  items: ListItem[]
  share?: ListShare | null
}

export interface Market {
  id: string
  name: string
  /** Endereço curto (bairro/rua), quando veio do mapa. */
  address?: string
  /** Id do OpenStreetMap, para não duplicar o mesmo mercado achado pelo GPS. */
  osmId?: string
}

export interface PricePoint {
  /** Centavos por unidade. */
  price: number
  date: string
  listId: string
  marketId?: string | null
}

/** Produto achado no catálogo online de um supermercado. */
export interface WebProduct {
  id: string
  name: string
  image: string
  /** Centavos; null quando está indisponível online. */
  price: number | null
  store: string
}

export interface WebPriceRef {
  price: number
  name: string
  store: string
  at: string
}

/**
 * Memória por produto, compartilhada entre listas: é daqui que sai a sugestão de setor
 * e de preço quando o mesmo produto aparece de novo.
 */
export interface CatalogEntry {
  key: string
  name: string
  sectorId: string
  unit: Unit
  lastExpected: number | null
  /** Preços efetivamente pagos, mais recente primeiro (limitado). */
  paid: PricePoint[]
  timesUsed: number
  /** URL da foto escolhida para o produto. */
  image?: string | null
  /** Preço do produto escolhido no catálogo online, como referência. */
  webRef?: WebPriceRef | null
}
