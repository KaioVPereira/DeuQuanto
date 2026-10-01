import { CheckCircle2, Download, ShoppingBasket, Sparkles } from 'lucide-react'
import { Header } from '@/components/ui'
import { useAppUpdate } from '@/lib/appUpdate'
import { isNative } from '@/lib/native'
import { formatDate } from '@/lib/format'
import { downloadUrl } from '@/sync/api'

/**
 * Ajustes → Aplicativo: a versão mais nova publicada (tabela app_releases no servidor) e o
 * link para baixar. No APK compara com a instalada; no navegador só oferece o download.
 */
export function AppPage() {
  const { latest, installed, updateAvailable, loading } = useAppUpdate()

  return (
    <div className="min-h-dvh pb-10">
      <Header back title="Aplicativo" />
      <div className="px-4 pt-1">
        <div className="rounded-3xl bg-card p-5 shadow-sm shadow-black/5">
          <div className="flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-[20px] bg-brand text-on-brand" aria-hidden>
              <ShoppingBasket size={30} strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <div className="text-lg font-extrabold tracking-tight">Deu Quanto? para Android</div>
              <div className="text-sm text-muted">
                {isNative ? (
                  <>
                    Instalada neste celular: versão <span className="font-semibold text-ink">{installed?.version ?? '—'}</span>
                  </>
                ) : (
                  'O que você esperava × o que você pagou.'
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="mt-4 h-24 animate-pulse rounded-2xl bg-bg" />
          ) : !latest ? (
            <p className="mt-4 rounded-2xl bg-bg px-4 py-3 text-sm text-muted">Não deu para ver a versão mais nova agora (sem internet ou nenhuma versão publicada).</p>
          ) : (
            <>
              {isNative &&
                (updateAvailable ? (
                  <div className="mt-4 flex items-center gap-2 rounded-2xl bg-over-soft px-4 py-3 text-sm font-semibold text-over">
                    <Sparkles size={16} className="shrink-0" /> Nova versão {latest.version} disponível
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-2 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-strong">
                    <CheckCircle2 size={16} className="shrink-0" /> Você está na versão mais nova
                  </div>
                ))}

              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat label="Mais recente" value={latest.version ?? '—'} />
                <Stat label="Publicada" value={latest.publishedAt ? formatDate(latest.publishedAt).slice(0, 5) : '—'} />
                <Stat label="Tamanho" value={latest.sizeBytes ? `${(latest.sizeBytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : '—'} />
              </dl>

              {latest.notes && (
                <div className="mt-4">
                  <div className="text-sm font-semibold">O que mudou</div>
                  <p className="mt-1 text-sm whitespace-pre-line text-muted">{latest.notes}</p>
                </div>
              )}

              {/* Sem o atributo `download`: no APK o link vai para o navegador do celular, que baixa e oferece instalar. */}
              <a
                href={downloadUrl(latest.downloadUrl)}
                className={`mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 font-semibold active:scale-[0.98] ${
                  isNative && !updateAvailable ? 'bg-bg text-ink' : 'bg-brand text-on-brand'
                }`}
              >
                <Download size={18} /> {isNative && !updateAvailable ? 'Baixar de novo' : `Baixar versão ${latest.version}`}
              </a>
              <p className="mt-3 text-xs text-muted">
                Na primeira vez o Android pede para permitir instalar apps pelo navegador. A atualização instala por cima e mantém suas listas.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-bg px-2 py-2.5">
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="tabular text-[15px] font-bold">{value}</dd>
    </div>
  )
}
