import { useEffect, useState } from 'react'
import { App } from '@capacitor/app'
import type { AndroidRelease } from '../../shared/protocol'
import { api } from '@/sync/api'
import { isNative } from './native'

/**
 * Versão do app, igual ao Finanças e ao Games Trackers: a versão mais nova fica no banco do
 * servidor (app_releases); o APK instalado compara o próprio versionCode com ela e, se
 * estiver atrás, oferece o download.
 */

export interface InstalledApp {
  version: string
  build: number
}

let cache: Promise<{ latest: AndroidRelease | null; installed: InstalledApp | null }> | null = null

function load() {
  cache ??= Promise.all([
    api.androidRelease().catch(() => null),
    isNative
      ? App.getInfo()
          .then((info) => ({ version: info.version, build: Number(info.build) || 0 }))
          .catch(() => null)
      : Promise.resolve(null),
  ]).then(([release, installed]) => {
    // Falhou (sem internet)? Tenta de novo na próxima vez que alguém perguntar.
    if (!release) cache = null
    return { latest: release?.available ? release : null, installed }
  })
  return cache
}

export function useAppUpdate() {
  const [state, setState] = useState<{ latest: AndroidRelease | null; installed: InstalledApp | null; loading: boolean }>({ latest: null, installed: null, loading: true })
  useEffect(() => {
    let alive = true
    void load().then((r) => alive && setState({ ...r, loading: false }))
    return () => {
      alive = false
    }
  }, [])
  const updateAvailable = !!(state.installed && state.latest?.versionCode && state.latest.versionCode > state.installed.build)
  return { ...state, updateAvailable }
}
