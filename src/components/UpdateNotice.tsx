import { useState } from 'react'
import { Download, Sparkles } from 'lucide-react'
import { Sheet } from './Sheet'
import { SecondaryButton } from './ui'
import { useStore } from '@/store/store'
import { useAppUpdate } from '@/lib/appUpdate'
import { isNative } from '@/lib/native'
import { downloadUrl } from '@/sync/api'

/**
 * No app, igual ao Pitwall: versão nova publicada aparece numa janela logo na abertura, com o
 * que mudou. "Depois" só volta na próxima versão (a bolinha nos Ajustes continua lá).
 */
export function UpdateNotice() {
  const { latest, installed, updateAvailable } = useAppUpdate()
  const skipped = useStore((s) => (latest ? !!s.tipsSeen[`update-${latest.versionCode}`] : false))
  const dismissTip = useStore((s) => s.dismissTip)
  const [closed, setClosed] = useState(false)

  if (!isNative || !updateAvailable || !latest || skipped || closed) return null
  const later = () => {
    dismissTip(`update-${latest.versionCode}`)
    setClosed(true)
  }

  return (
    <Sheet
      open
      onClose={later}
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={20} className="text-brand" /> Nova versão disponível
        </span>
      }
      footer={
        <div className="space-y-2">
          {/* Sem o atributo `download`: no APK o link vai para o navegador do celular, que baixa e oferece instalar. */}
          <a
            href={downloadUrl(latest.downloadUrl)}
            onClick={() => setClosed(true)}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-base font-semibold text-on-brand active:bg-brand-press"
          >
            <Download size={18} /> Atualizar{latest.sizeBytes ? ` · ${(latest.sizeBytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : ''}
          </a>
          <SecondaryButton onClick={later}>Depois</SecondaryButton>
        </div>
      }
    >
      <div className="space-y-4 pb-1">
        <p className="text-muted">
          A versão <b className="text-ink">{latest.version}</b> do Deu Quanto? está disponível
          {installed && <> (você está na {installed.version})</>}.
        </p>
        {latest.notes && (
          <div className="rounded-2xl bg-bg p-4">
            <div className="text-sm font-semibold">O que mudou</div>
            <p className="mt-1 text-sm whitespace-pre-line text-muted">{latest.notes}</p>
          </div>
        )}
        <p className="text-xs text-muted">A atualização instala por cima e mantém suas listas.</p>
      </div>
    </Sheet>
  )
}
