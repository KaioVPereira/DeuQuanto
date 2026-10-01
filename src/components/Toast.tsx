import { useEffect } from 'react'
import { Users } from 'lucide-react'
import { useSyncStatus } from '@/sync/engine'

/** Aviso do que outra pessoa mudou numa lista compartilhada ("Ana adicionou 3 itens"). */
export function Toast() {
  const toast = useSyncStatus((s) => s.toast)
  const dismiss = useSyncStatus((s) => s.dismissToast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(dismiss, 5_000)
    return () => clearTimeout(t)
  }, [toast, dismiss])
  if (!toast) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4" style={{ top: 'calc(var(--sat) + 0.75rem)' }}>
      <button
        key={toast.id}
        onClick={dismiss}
        className="animate-fade pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-left text-sm font-medium text-bg shadow-xl"
      >
        <Users size={18} className="shrink-0" />
        {toast.text}
      </button>
    </div>
  )
}
