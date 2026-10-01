/**
 * Contrato da sincronização de listas compartilhadas — usado pelo app (src/sync) e pelo
 * servidor (server/src). Só tipos e constantes: o servidor roda TypeScript direto no Node
 * (type stripping), então aqui não pode ter enum nem nada que gere código.
 *
 * Modelo: a lista compartilhada é um conjunto de "entidades" (o cabeçalho da lista, os
 * itens e os setores que eles usam). Cada celular manda só os CAMPOS que mudou (`set`),
 * e o servidor junta campo a campo — ela marcar o leite e você mudar a quantidade do
 * leite não brigam. No mesmo campo, vale a última alteração que CHEGOU no servidor
 * (o relógio do celular não entra na conta). Remover é definitivo: edições num item
 * removido são ignoradas.
 */

export type EntityKind = 'list' | 'item' | 'sector'

/** Id fixo da entidade de cabeçalho (nome, data, mercado, finalizada). */
export const LIST_ENTITY_ID = 'list'

export interface MarketRef {
  name: string
  address?: string
  osmId?: string
}

export interface ListFields {
  name: string
  date: string
  finishedAt: string | null
  market: MarketRef | null
}

export interface ItemFields {
  productKey: string
  name: string
  sectorId: string
  unit: string
  qty: number
  expectedPrice: number | null
  checked: boolean
  actualQty: number | null
  actualPrice: number | null
  checkedAt: string | null
  /** Foto do produto: vai junto porque o catálogo (onde ela mora) é de cada celular. */
  image: string | null
}

export interface SectorFields {
  name: string
  emoji: string
}

/** Uma alteração feita num celular. `opId` torna o reenvio seguro (o servidor ignora repetidas). */
export interface Op {
  opId: string
  kind: EntityKind
  id: string
  set?: Record<string, unknown>
  del?: true
}

export interface Entity {
  kind: EntityKind
  id: string
  fields: Record<string, unknown>
  deleted: boolean
  /** Posição no histórico da lista: o celular pede "o que mudou depois do seq N". */
  seq: number
  createdBy: string | null
  updatedBy: string | null
}

export interface Member {
  id: string
  name: string
  isOwner: boolean
}

/** Item criado em dois celulares sem internet: o servidor junta e avisa qual id sobreviveu. */
export interface Alias {
  from: string
  to: string
}

export interface ShareRequest {
  deviceId: string
  name: string
  entities: { kind: EntityKind; id: string; fields: Record<string, unknown> }[]
}

export interface ShareResponse {
  listId: string
  code: string
  token: string
  memberId: string
  seq: number
  members: Member[]
}

export interface JoinRequest {
  code: string
  deviceId: string
  name: string
}

export interface JoinResponse extends ShareResponse {
  entities: Entity[]
}

export interface SyncRequest {
  since: number
  ops: Op[]
  /** Nome atual do celular (muda o nome do membro se a pessoa trocou em Ajustes). */
  name?: string
}

export interface SyncResponse {
  seq: number
  changes: Entity[]
  members: Member[]
  aliases: Alias[]
  code: string
}

export interface CodeResponse {
  code: string
}

/** Resposta de erro da API. `closed` = a dona parou de compartilhar; `removed` = te tiraram. */
export interface ApiError {
  error: 'closed' | 'removed' | 'unauthorized' | 'not_found' | 'invalid' | 'rate_limited' | 'forbidden'
  message?: string
}

export interface AndroidRelease {
  available: boolean
  version: string | null
  versionCode: number | null
  notes: string | null
  publishedAt: string | null
  sizeBytes: number | null
  downloadUrl: string
}

/** Código de convite: sem 0/O, 1/I/L — dá para ditar e digitar sem confundir. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

/** "k7p 4qx" / "K7P-4QX" → "K7P4QX". */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** "K7P4QX" → "K7P-4QX" (só para mostrar). */
export function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code
}
