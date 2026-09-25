import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { pushBackHandler } from '@/lib/native'

interface Props {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/** Painel que sobe de baixo. O voltar do Android fecha ele antes de sair da tela. */
export function Sheet({ open, onClose, title, children, footer }: Props) {
  useEffect(() => {
    if (!open) return
    return pushBackHandler(onClose)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="animate-sheet relative flex max-h-[92dvh] flex-col rounded-t-3xl bg-card shadow-2xl">
        <div className="flex items-center gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0 flex-1 text-lg font-semibold">{title}</div>
          <button onClick={onClose} className="-mr-2 rounded-full p-2 text-muted active:bg-bg" aria-label="Fechar">
            <X size={22} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer ? (
          <div className="border-t border-line px-5 pt-3" style={{ paddingBottom: 'calc(var(--sab) + 0.75rem)' }}>
            {footer}
          </div>
        ) : (
          <div className="pb-safe" />
        )}
      </div>
    </div>,
    document.body,
  )
}
