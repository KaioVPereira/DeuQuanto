import type { AndroidRelease, ApiError, JoinResponse, ShareRequest, ShareResponse, SyncRequest, SyncResponse } from '../../shared/protocol'

/**
 * Servidor das listas compartilhadas e das versões do app. No navegador (dev) as rotas
 * passam pelo proxy do Vite para o servidor local (veja vite.config.ts).
 */
export const SYNC_URL: string = import.meta.env.VITE_SYNC_URL ?? (import.meta.env.DEV ? '' : 'https://deuquanto.gamestrackers.com')

/** Endereço que vai no convite (no dev, o próprio servidor local). */
export const inviteUrl = (code: string) => `${SYNC_URL || window.location.origin}/c/${code}`

const TIMEOUT = 12_000

export class ApiHttpError extends Error {
  status: number
  code: ApiError['error'] | 'internal'
  constructor(status: number, body: Partial<ApiError> | null) {
    super(body?.message ?? `HTTP ${status}`)
    this.status = status
    this.code = body?.error ?? 'internal'
  }
}

/** Sem internet / servidor fora: o app segue funcionando e tenta de novo depois. */
export class OfflineError extends Error {}

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SYNC_URL}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT),
    })
  } catch {
    throw new OfflineError('Sem conexão com o servidor.')
  }
  const data = (await res.json().catch(() => null)) as unknown
  // 502/503/504: o Caddy respondendo com o servidor fora do ar — trata como sem conexão.
  if (res.status >= 502) throw new OfflineError('Servidor indisponível.')
  if (!res.ok) throw new ApiHttpError(res.status, data as Partial<ApiError> | null)
  return data as T
}

export const api = {
  share: (req: ShareRequest) => call<ShareResponse>('POST', '/api/lists', req),
  join: (code: string, deviceId: string, name: string) => call<JoinResponse>('POST', '/api/join', { code, deviceId, name }),
  sync: (remoteId: string, token: string, req: SyncRequest) => call<SyncResponse>('POST', `/api/lists/${remoteId}/sync`, req, token),
  newCode: (remoteId: string, token: string) => call<{ code: string }>('POST', `/api/lists/${remoteId}/code`, {}, token),
  leave: (remoteId: string, token: string) => call<{ ok: true }>('POST', `/api/lists/${remoteId}/leave`, {}, token),
  removeMember: (remoteId: string, token: string, memberId: string) => call<{ ok: true }>('DELETE', `/api/lists/${remoteId}/members/${memberId}`, undefined, token),
  androidRelease: () => call<AndroidRelease>('GET', '/api/app/android'),
}

export const downloadUrl = (path: string) => `${SYNC_URL || window.location.origin}${path}`
