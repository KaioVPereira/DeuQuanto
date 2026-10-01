import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, Users } from 'lucide-react'
import { CODE_LENGTH, formatCode, normalizeCode } from '../../shared/protocol'
import { Header, PrimaryButton } from '@/components/ui'
import { Label, TextField } from '@/components/inputs'
import { errorText } from '@/components/ShareSheet'
import { useStore } from '@/store/store'
import { api, ApiHttpError } from '@/sync/api'

/** Entrar numa lista compartilhada: pelo link do convite (já vem com o código) ou digitando. */
export function JoinPage() {
  const { code: fromLink } = useParams()
  const navigate = useNavigate()
  const device = useStore((s) => s.device)
  const setDeviceName = useStore((s) => s.setDeviceName)
  const joinShared = useStore((s) => s.joinShared)
  const [code, setCode] = useState(fromLink ? formatCode(normalizeCode(fromLink)) : '')
  const [name, setName] = useState(device?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clean = normalizeCode(code)
  const valid = clean.length === CODE_LENGTH && !!name.trim()

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      const me = setDeviceName(name)
      const res = await api.join(clean, me.id, me.name)
      const listId = joinShared(res)
      navigate(`/lista/${listId}`, { replace: true })
    } catch (err) {
      setError(err instanceof ApiHttpError && err.code === 'not_found' ? 'Código não encontrado. Confira com quem te convidou — ele pode ter gerado um código novo.' : errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh pb-10">
      <Header back title="Entrar numa lista" />
      <div className="space-y-5 px-4 pt-2">
        <div className="flex gap-3 rounded-2xl bg-brand-soft p-4 text-brand-strong">
          <Users size={22} className="mt-0.5 shrink-0" />
          <p className="text-sm">A lista aparece aqui e tudo que vocês mudarem — itens, quantidades, o que já foi para o carrinho — fica igual nos dois celulares.</p>
        </div>
        <div>
          <Label>Código do convite</Label>
          <TextField
            value={code}
            onChange={(e) => {
              const c = normalizeCode(e.target.value).slice(0, CODE_LENGTH)
              setCode(c.length > 3 ? formatCode(c.padEnd(6, ' ')).trim() : c)
            }}
            placeholder="K7P-4QX"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="tabular text-center font-mono text-2xl font-bold tracking-[0.15em]"
          />
        </div>
        <div>
          <Label>Seu nome (aparece para quem está na lista)</Label>
          <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Kaio" autoCapitalize="words" maxLength={40} />
        </div>
        {error && <p className="rounded-2xl bg-over-soft px-4 py-3 text-sm font-medium text-over">{error}</p>}
        <PrimaryButton disabled={!valid || busy} onClick={join} className="flex items-center justify-center gap-2">
          {busy && <Loader2 size={18} className="animate-spin" />} {busy ? 'Entrando…' : 'Entrar na lista'}
        </PrimaryButton>
      </div>
    </div>
  )
}
