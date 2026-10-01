import { formatCode, type AndroidRelease } from '../../shared/protocol.ts'

/**
 * Páginas públicas do domínio. Quem toca no link de convite no WhatsApp cai aqui quando o
 * Android não abre o app direto: o botão usa um link `intent://`, que o Chrome entrega ao
 * app instalado (ou manda baixar, se não tiver).
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
  :root { --bg:#f5f6f1; --card:#fff; --ink:#1b1f19; --muted:#697064; --line:#e3e6dc; --brand:#1e7a46; --brand-soft:#e2f1e7; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { :root { --bg:#121511; --card:#1c201b; --ink:#eceee9; --muted:#a3a99e; --line:#2c312a; --brand:#3fae6b; --brand-soft:#1d3325; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100dvh; background:var(--bg); color:var(--ink); font:16px/1.5 system-ui, -apple-system, Roboto, sans-serif; display:flex; justify-content:center; padding:32px 16px; }
  main { width:100%; max-width:420px; }
  .logo { width:72px; height:72px; border-radius:22px; background:var(--brand); display:grid; place-items:center; font-size:38px; margin:0 auto 16px; }
  h1 { font-size:24px; margin:0 0 6px; text-align:center; letter-spacing:-.02em; }
  p { color:var(--muted); margin:0 0 16px; text-align:center; }
  .card { background:var(--card); border-radius:24px; padding:20px; margin-top:20px; box-shadow:0 1px 3px rgba(0,0,0,.06); }
  .code { font:800 34px/1 ui-monospace, monospace; letter-spacing:.12em; text-align:center; background:var(--brand-soft); color:var(--brand); border-radius:16px; padding:16px; margin:8px 0 4px; }
  .btn { display:block; text-align:center; text-decoration:none; font-weight:700; border-radius:16px; padding:15px; margin-top:12px; }
  .primary { background:var(--brand); color:#fff; }
  .secondary { background:var(--bg); color:var(--ink); border:1px solid var(--line); }
  small { display:block; color:var(--muted); text-align:center; margin-top:12px; font-size:13px; }
</style>
</head>
<body><main>${body}</main></body>
</html>`
}

const header = (title: string, subtitle: string) => `<div class="logo" aria-hidden="true">🛒</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p>`

function downloadBlock(release: AndroidRelease, primary: boolean): string {
  if (!release.available) return '<small>O app ainda não está disponível para download.</small>'
  const size = release.sizeBytes ? ` · ${(release.sizeBytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : ''
  return `<a class="btn ${primary ? 'primary' : 'secondary'}" href="${release.downloadUrl}">Baixar o app (versão ${esc(release.version ?? '')}${size})</a>
<small>Na primeira vez o Android pede para permitir instalar apps pelo navegador. A atualização instala por cima e mantém suas listas.</small>`
}

export function homePage(release: AndroidRelease): string {
  return layout(
    'Deu Quanto?',
    `${header('Deu Quanto?', 'O que você esperava × o que você pagou. Lista de compras com preço estimado e preço da gôndola.')}
<div class="card">${downloadBlock(release, true)}</div>`,
  )
}

export function invitePage(opts: { code: string; listName: string | null; ownerName: string | null; androidPackage: string; release: AndroidRelease; publicUrl: string }): string {
  const { code, listName, ownerName, androidPackage, release, publicUrl } = opts
  if (!listName) {
    return layout(
      'Convite inválido · Deu Quanto?',
      `${header('Convite não encontrado', 'Esse código não existe mais — quem compartilhou pode ter parado de compartilhar ou gerado um código novo.')}
<div class="card">${downloadBlock(release, false)}</div>`,
    )
  }
  const fallback = encodeURIComponent(`${publicUrl}/`)
  const intent = `intent://c/${code}#Intent;scheme=deuquanto;package=${androidPackage};S.browser_fallback_url=${fallback};end`
  const who = ownerName ? `${ownerName} compartilhou` : 'Compartilharam'
  return layout(
    `${listName} · Deu Quanto?`,
    `${header(listName, `${who} esta lista de compras com você.`)}
<div class="card">
  <a class="btn primary" href="${intent}">Abrir no Deu Quanto?</a>
  <small>Se o app não abrir, abra o Deu Quanto?, toque em <b>Entrar</b> (no alto da tela) e digite:</small>
  <div class="code">${esc(formatCode(code))}</div>
</div>
<div class="card">${downloadBlock(release, false)}</div>`,
  )
}
