import { useEffect, useRef, useState } from 'react'
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '@/store/store'
import { initBackButton } from '@/lib/native'
import { applyTheme, watchSystemMode } from '@/lib/theme'
import { SettingsPage } from '@/pages/SettingsPage'
import { HomePage } from '@/pages/HomePage'
import { ListPage } from '@/pages/ListPage'
import { SectorPage } from '@/pages/SectorPage'
import { SectorsPage } from '@/pages/SectorsPage'

export function App() {
  const hydrated = useHydrated()
  useThemeSync(hydrated)
  if (!hydrated) return null
  return (
    <HashRouter>
      <BackButton />
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/lista/:id" element={<ListPage />} />
        <Route path="/lista/:id/setor/:sectorId" element={<SectorPage />} />
        <Route path="/setores" element={<SectorsPage />} />
        <Route path="/ajustes" element={<SettingsPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </HashRouter>
  )
}

/** Os dados vêm do armazenamento do aparelho de forma assíncrona; espera antes de desenhar. */
function useHydrated() {
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated())
  useEffect(() => {
    if (hydrated) return
    const unsubscribe = useStore.persist.onFinishHydration(() => setHydrated(true))
    // A leitura do armazenamento começa antes do React montar. Se ela terminou entre o
    // primeiro render e este efeito, o evento já passou — sem esta checagem a tela
    // ficava em branco para sempre.
    if (useStore.persist.hasHydrated()) setHydrated(true)
    return unsubscribe
  }, [hydrated])
  return hydrated
}

/** Aplica o tema salvo e, no automático, acompanha o celular mudando de modo. */
function useThemeSync(hydrated: boolean) {
  const { themeMode, accent } = useStore((s) => s.settings)
  useEffect(() => {
    // Antes de hidratar o store vale o que o index.html já aplicou do cache.
    if (!hydrated) return
    applyTheme(themeMode, accent)
    if (themeMode !== 'system') return
    return watchSystemMode(() => applyTheme(themeMode, accent))
  }, [hydrated, themeMode, accent])
}

function BackButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const path = useRef(location.pathname)
  path.current = location.pathname
  useEffect(() => initBackButton(() => path.current === '/', () => navigate(-1)), [navigate])
  return null
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
