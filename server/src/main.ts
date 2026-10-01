import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { openDb } from './db.ts'
import { authenticate, cleanup, joinList, leave, regenerateCode, removeMember, shareList, sync, SyncError } from './sync.ts'
import { androidDownload, androidRelease } from './releases.ts'
import { homePage, invitePage } from './pages.ts'
import { normalizeCode, type JoinRequest, type ShareRequest, type SyncRequest } from '../../shared/protocol.ts'

/**
 * Servidor de sincronização do Deu Quanto? — sem dependências: http, sqlite e TypeScript
 * vêm do próprio Node (24+). Atrás do Caddy do Games Trackers, que cuida do HTTPS.
 */
const PORT = Number(process.env.PORT ?? 8787)
const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dirname, '..', 'data')
const APK_DIR = process.env.APK_DIR ?? join(DATA_DIR, 'apk')
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE ?? 'com.listadecompras.app'
/** SHA-256 do certificado que assina o APK (vários separados por vírgula) — para os App Links. */
const ANDROID_CERTS = (process.env.ANDROID_CERT_SHA256 ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const MAX_BODY = 2 * 1024 * 1024

const db = openDb(join(DATA_DIR, 'deuquanto.db'))

// ---------- Limite de tentativas (em memória: um contêiner só) ----------

const buckets = new Map<string, { count: number; resetAt: number }>()
function limited(key: string, max: number, windowMs: number): boolean {
  const t = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < t) {
    buckets.set(key, { count: 1, resetAt: t + windowMs })
    return false
  }
  b.count++
  return b.count > max
}
setInterval(() => {
  const t = Date.now()
  for (const [k, b] of buckets) if (b.resetAt < t) buckets.delete(k)
}, 60_000).unref()

const clientIp = (req: IncomingMessage) => (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() || req.socket.remoteAddress || '?'

// ---------- Respostas ----------

function send(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(json)
}

function html(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(body)
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new SyncError(413, 'invalid', 'Requisição grande demais.')
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T
  } catch {
    throw new SyncError(400, 'invalid', 'JSON inválido.')
  }
}

const bearer = (req: IncomingMessage) => {
  const h = req.headers.authorization
  return h?.startsWith('Bearer ') ? h.slice(7) : null
}

// ---------- Rotas ----------

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x')
  const path = url.pathname
  const method = req.method ?? 'GET'
  const ip = clientIp(req)

  if (method === 'GET' && path === '/api/health') return send(res, 200, { ok: true })

  // Compartilhar uma lista que já existe no celular.
  if (method === 'POST' && path === '/api/lists') {
    if (limited(`share:${ip}`, 30, 3_600_000)) return send(res, 429, { error: 'rate_limited' })
    return send(res, 200, shareList(db, await readJson<ShareRequest>(req)))
  }

  if (method === 'POST' && path === '/api/join') {
    const body = await readJson<JoinRequest>(req)
    const code = normalizeCode(String(body?.code ?? ''))
    // Conta só as tentativas erradas: quem tem o código certo nunca é barrado.
    if ((buckets.get(`join:${ip}`)?.count ?? 0) >= 15) return send(res, 429, { error: 'rate_limited', message: 'Muitas tentativas. Espere alguns minutos.' })
    const joined = joinList(db, code, body?.deviceId, body?.name)
    if (!joined) {
      limited(`join:${ip}`, 15, 600_000)
      return send(res, 404, { error: 'not_found', message: 'Código não encontrado.' })
    }
    return send(res, 200, joined)
  }

  const listRoute = path.match(/^\/api\/lists\/([0-9a-f-]{36})(\/.*)?$/)
  if (listRoute) {
    const [, listId, rest = ''] = listRoute
    const member = authenticate(db, listId, bearer(req))
    if (method === 'POST' && rest === '/sync') return send(res, 200, sync(db, member, await readJson<SyncRequest>(req)))
    if (method === 'POST' && rest === '/code') return send(res, 200, { code: regenerateCode(db, member) })
    if (method === 'POST' && rest === '/leave') {
      leave(db, member)
      return send(res, 200, { ok: true })
    }
    const memberRoute = rest.match(/^\/members\/([0-9a-f-]{36})$/)
    if (method === 'DELETE' && memberRoute) {
      removeMember(db, member, memberRoute[1])
      return send(res, 200, { ok: true })
    }
    return send(res, 404, { error: 'not_found' })
  }

  if (method === 'GET' && path === '/api/app/android') return send(res, 200, androidRelease(db, APK_DIR))

  if (method === 'GET' && path === '/api/app/android/download') {
    const file = androidDownload(db, APK_DIR)
    if (!file) return send(res, 404, { error: 'not_found' })
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': file.size,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'Cache-Control': 'no-store',
    })
    createReadStream(file.path).pipe(res)
    return
  }

  // App Links: com isto o Android abre https://<domínio>/c/... direto no app.
  if (method === 'GET' && path === '/.well-known/assetlinks.json') {
    return send(res, 200, [
      { relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: ANDROID_CERTS } },
    ])
  }

  const invite = path.match(/^\/c\/([A-Za-z0-9-]{4,12})\/?$/)
  if (method === 'GET' && invite) {
    const code = normalizeCode(invite[1])
    const list = db.prepare('SELECT id FROM lists WHERE code = ? AND closed_at IS NULL').get(code) as { id: string } | undefined
    let listName: string | null = null
    let ownerName: string | null = null
    if (list) {
      const header = db.prepare("SELECT fields FROM entities WHERE list_id = ? AND kind = 'list'").get(list.id) as { fields: string } | undefined
      listName = header ? (JSON.parse(header.fields) as { name?: string }).name || 'Lista de compras' : 'Lista de compras'
      ownerName = (db.prepare('SELECT name FROM members WHERE list_id = ? AND is_owner = 1').get(list.id) as { name: string } | undefined)?.name ?? null
    }
    return html(res, list ? 200 : 404, invitePage({ code, listName, ownerName, androidPackage: ANDROID_PACKAGE, release: androidRelease(db, APK_DIR), publicUrl: PUBLIC_URL }))
  }

  if (method === 'GET' && path === '/') return html(res, 200, homePage(androidRelease(db, APK_DIR)))

  return send(res, 404, { error: 'not_found' })
}

const server = createServer((req, res) => {
  // O app chama de https://localhost (WebView do Capacitor). Sem cookies: a autorização é o
  // token no cabeçalho, então liberar qualquer origem não abre nada.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  route(req, res).catch((err: unknown) => {
    if (err instanceof SyncError) return send(res, err.status, { error: err.code, message: err.message })
    console.error(new Date().toISOString(), req.method, req.url, err)
    if (!res.headersSent) send(res, 500, { error: 'internal' })
    else res.end()
  })
})

server.listen(PORT, () => console.log(`deuquanto-sync ouvindo na porta ${PORT} (dados em ${DATA_DIR})`))

cleanup(db)
setInterval(() => cleanup(db), 86_400_000).unref()

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close()
    db.close()
    process.exit(0)
  })
}
