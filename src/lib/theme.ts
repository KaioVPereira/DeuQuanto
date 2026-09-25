import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { isNative } from './native'

export type ThemeMode = 'light' | 'dark' | 'system'
export type Accent = 'verde' | 'rosa' | 'azul' | 'roxo' | 'grafite'

export const ACCENTS: { id: Accent; name: string }[] = [
  { id: 'verde', name: 'Verde' },
  { id: 'rosa', name: 'Rosa' },
  { id: 'azul', name: 'Azul' },
  { id: 'roxo', name: 'Roxo' },
  { id: 'grafite', name: 'Grafite' },
]

/** Cópia síncrona da escolha, lida pelo script do index.html antes do React subir. */
export const THEME_CACHE_KEY = 'lc-theme'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return darkQuery().matches ? 'dark' : 'light'
  return mode
}

export function applyTheme(mode: ThemeMode, accent: Accent) {
  const resolved = resolveMode(mode)
  const root = document.documentElement
  root.dataset.mode = resolved
  root.dataset.accent = accent
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ mode, accent }))
  } catch {
    // Só serve para evitar o piscar na abertura; sem ele o tema vem logo depois.
  }
  const bg = getComputedStyle(root).getPropertyValue('--color-bg').trim()
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  if (isNative) {
    // Dark = ícones claros na barra de status, para aparecerem sobre o fundo escuro.
    void SystemBars.setStyle({ style: resolved === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
  }
}

/** No modo automático, acompanha o celular trocando de claro para escuro com o app aberto. */
export function watchSystemMode(onChange: () => void): () => void {
  const query = darkQuery()
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
