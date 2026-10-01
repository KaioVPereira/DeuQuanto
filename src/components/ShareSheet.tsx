import { useState } from 'react'
import { Check, Copy, Crown, Loader2, RefreshCw, Send, UserMinus, Users } from 'lucide-react'
import { Share } from '@capacitor/share'
import { formatCode } from '../../shared/protocol'
import { Sheet } from './Sheet'
import { Label, TextField } from './inputs'
import { PrimaryButton, SecondaryButton } from './ui'
import { useStore } from '@/store/store'
import { api, ApiHttpError, inviteUrl, OfflineError } from '@/sync/api'
import { snapshot } from '@/sync/ops'
import { syncList, useSyncStatus } from '@/sync/engine'
import type { ShoppingList } from '@/lib/types'

/** Mensagem de erro para quem está usando, não para quem programou. */
export function errorText(err: unknown): string {
  if (err instanceof OfflineError) return 'Sem conexão com a internet. Tente de novo quando conectar.'
  if (err instanceof ApiHttpError) {
    if (err.code === 'rate_limited') return 'Muitas tentativas seguidas. Espere alguns minutos.'
    if (err.message && !err.message.startsWith('HTTP')) return err.message
  }
  return 'Não deu certo agora. Tente de novo.'
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 10) return 'agora'
  if (s < 60) return `há ${s} s`
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86_400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86_400)} dias`
}

export function ShareSheet({ list, open, onClose }: { list: ShoppingList; open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <Sheet open onClose={onClose} title={list.share?.ended ? 'Compartilhamento encerrado' : list.share ? 'Lista compartilhada' : 'Compartilhar lista'}>
      {list.share?.ended ? <Ended list={list} onClose={onClose} /> : list.share ? <Shared list={list} onClose={onClose} /> : <StartSharing list={list} />}
    </Sheet>
  )
}

function StartSharing({ list }: { list: ShoppingList }) {
  const device = useStore((s) => s.device)
  const setDeviceName = useStore((s) => s.setDeviceName)
  const startSharing = useStore((s) => s.startSharing)
  const [name, setName] = useState(device?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const share = async () => {
    setBusy(true)
    setError(null)
    try {
      const me = setDeviceName(name)
      const s = useStore.getState()
      const current = s.lists.find((l) => l.id === list.id) ?? list
      const res = await api.share({ deviceId: me.id, name: me.name, entities: snapshot(current, s.sectors, s.markets, s.catalog) })
      startSharing(list.id, res)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5 pb-2">
      <div className="flex gap-3 rounded-2xl bg-brand-soft p-4 text-brand-strong">
        <Users size={22} className="mt-0.5 shrink-0" />
        <p className="text-sm">
          Quem entrar vê e edita esta lista no próprio celular: o que um adiciona, remove ou põe no carrinho aparece para o outro em segundos. Seus preços
          pagos e o seu catálogo continuam só seus.
        </p>
      </div>
      <div>
        <Label>Seu nome (aparece para quem entrar)</Label>
        <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ana" autoCapitalize="words" maxLength={40} />
      </div>
      {error && <p className="rounded-2xl bg-over-soft px-4 py-3 text-sm font-medium text-over">{error}</p>}
      <PrimaryButton disabled={!name.trim() || busy} onClick={share} className="flex items-center justify-center gap-2">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} {busy ? 'Gerando convite…' : 'Gerar convite'}
      </PrimaryButton>
    </div>
  )
}

function Shared({ list, onClose }: { list: ShoppingList; onClose: () => void }) {
  const share = list.share!
  const device = useStore((s) => s.device)
  const pending = useStore((s) => s.outbox[list.id]?.length ?? 0)
  const updateShare = useStore((s) => s.updateShare)
  const unshare = useStore((s) => s.unshare)
  const status = useSyncStatus((s) => s.byList[list.id]?.state)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const url = inviteUrl(share.code)

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Não consegui copiar. Passe o código acima.')
    }
  }

  const sendInvite = async () => {
    const who = device?.name ? `${device.name} te convidou` : 'Você foi convidado'
    const text = `${who} para a lista “${list.name}” no Deu Quanto? Toque no link para abrir (ou digite o código ${formatCode(share.code)} no app):`
    try {
      await Share.share({ title: list.name, text, url, dialogTitle: 'Enviar convite' })
    } catch {
      // Cancelou, ou o navegador não tem compartilhamento: copia o link.
      if (!(await Share.canShare()).value) await copy()
    }
  }

  const statusText =
    pending > 0
      ? status === 'offline'
        ? `${pending === 1 ? '1 alteração esperando' : `${pending} alterações esperando`} internet`
        : 'Enviando alterações…'
      : status === 'offline'
        ? 'Sem conexão — mostrando a última versão recebida'
        : status === 'error'
          ? 'Falha ao sincronizar — tentando de novo'
          : `Sincronizado ${relativeTime(share.lastSyncAt)}`

  return (
    <div className="space-y-5 pb-2">
      <div className="rounded-3xl bg-bg p-4 text-center">
        <div className="text-sm text-muted">Código do convite</div>
        <div className="tabular my-1 font-mono text-4xl font-extrabold tracking-[0.15em] text-brand-strong">{formatCode(share.code)}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={sendInvite} className="flex items-center justify-center gap-2 rounded-2xl bg-brand py-3 font-semibold text-on-brand active:bg-brand-press">
            <Send size={18} /> Enviar
          </button>
          <button onClick={copy} className="flex items-center justify-center gap-2 rounded-2xl bg-card py-3 font-semibold active:bg-line">
            {copied ? <Check size={18} className="text-brand" /> : <Copy size={18} />} {copied ? 'Copiado' : 'Copiar link'}
          </button>
        </div>
      </div>

      <div>
        <Label>Na lista ({share.members.length})</Label>
        <div className="divide-y divide-line rounded-2xl border border-line">
          {share.members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  {m.name}
                  {m.id === share.memberId && <span className="font-normal text-muted"> (você)</span>}
                </div>
                {m.isOwner && (
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <Crown size={12} /> compartilhou a lista
                  </div>
                )}
              </div>
              {share.isOwner && !m.isOwner && (
                <button
                  disabled={!!busy}
                  onClick={() => {
                    if (!window.confirm(`Tirar ${m.name} da lista? A pessoa fica com uma cópia, mas não vê mais as alterações.`)) return
                    void act(`rm:${m.id}`, async () => {
                      await api.removeMember(share.remoteId, share.token, m.id)
                      await syncList(list.id)
                    })
                  }}
                  className="rounded-full p-2 text-muted active:bg-bg"
                  aria-label={`Tirar ${m.name}`}
                >
                  {busy === `rm:${m.id}` ? <Loader2 size={18} className="animate-spin" /> : <UserMinus size={18} />}
                </button>
              )}
            </div>
          ))}
        </div>
        {share.members.length === 1 && <p className="mt-2 px-1 text-sm text-muted">Ninguém entrou ainda. Mande o convite pelo WhatsApp.</p>}
        <p className="mt-2 px-1 text-sm text-muted">{statusText}</p>
      </div>

      {error && <p className="rounded-2xl bg-over-soft px-4 py-3 text-sm font-medium text-over">{error}</p>}

      <div className="space-y-2">
        {share.isOwner && (
          <SecondaryButton
            disabled={!!busy}
            onClick={() => {
              if (!window.confirm('Gerar um código novo? O convite antigo para de funcionar; quem já entrou continua.')) return
              void act('code', async () => {
                const { code } = await api.newCode(share.remoteId, share.token)
                updateShare(list.id, { code })
              })
            }}
            className="flex items-center justify-center gap-2"
          >
            {busy === 'code' ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} Gerar código novo
          </SecondaryButton>
        )}
        <button
          disabled={!!busy}
          onClick={() => {
            const msg = share.isOwner
              ? 'Parar de compartilhar? Ninguém mais vê as alterações; quem entrou fica com uma cópia. A lista continua no seu celular.'
              : 'Sair da lista? Ela continua no seu celular como uma cópia, mas você não vê mais as alterações.'
            if (!window.confirm(msg)) return
            void act('leave', async () => {
              await api.leave(share.remoteId, share.token)
              unshare(list.id)
              onClose()
            })
          }}
          className="w-full rounded-2xl px-4 py-3.5 font-semibold text-over active:bg-over-soft disabled:opacity-40"
        >
          {busy === 'leave' ? 'Saindo…' : share.isOwner ? 'Parar de compartilhar' : 'Sair da lista'}
        </button>
      </div>
    </div>
  )
}

function Ended({ list, onClose }: { list: ShoppingList; onClose: () => void }) {
  const unshare = useStore((s) => s.unshare)
  const owner = list.share?.members.find((m) => m.isOwner)?.name
  return (
    <div className="space-y-5 pb-2">
      <p className="text-muted">
        {list.share?.ended === 'removed'
          ? 'Você foi tirado desta lista.'
          : `${owner ?? 'Quem compartilhou'} parou de compartilhar esta lista.`}{' '}
        Ela continua aqui como uma cópia só sua, do jeito que estava na última sincronização.
      </p>
      <PrimaryButton
        onClick={() => {
          unshare(list.id)
          onClose()
        }}
      >
        Entendi
      </PrimaryButton>
    </div>
  )
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand-strong" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}
