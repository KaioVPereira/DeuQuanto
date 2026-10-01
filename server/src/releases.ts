import { statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Db } from './db.ts'
import type { AndroidRelease } from '../../shared/protocol.ts'

/**
 * App Android para download, igual ao Finanças e ao Games Trackers: a versão liberada fica
 * na tabela app_releases e o APK em disco (APK_DIR, pasta do servidor montada no contêiner).
 * O app instalado compara o próprio versionCode com o maior daqui.
 */
export const DOWNLOAD_PATH = '/api/app/android/download'

interface ReleaseRow {
  version: string
  version_code: number
  file_name: string
  notes: string | null
  published_at: string
}

function latest(db: Db): ReleaseRow | undefined {
  return db.prepare('SELECT version, version_code, file_name, notes, published_at FROM app_releases ORDER BY version_code DESC LIMIT 1').get() as ReleaseRow | undefined
}

/** Só o nome do arquivo: nada vindo do banco sai da pasta dos APKs. */
function fileFor(release: ReleaseRow, apkDir: string): { path: string; size: number } | null {
  const path = join(apkDir, basename(release.file_name))
  try {
    const st = statSync(path)
    return st.isFile() ? { path, size: st.size } : null
  } catch {
    return null
  }
}

export function androidRelease(db: Db, apkDir: string): AndroidRelease {
  const release = latest(db)
  const file = release && fileFor(release, apkDir)
  if (!release || !file) return { available: false, version: null, versionCode: null, notes: null, publishedAt: null, sizeBytes: null, downloadUrl: DOWNLOAD_PATH }
  return {
    available: true,
    version: release.version,
    versionCode: release.version_code,
    notes: release.notes,
    publishedAt: release.published_at,
    sizeBytes: file.size,
    downloadUrl: DOWNLOAD_PATH,
  }
}

export function androidDownload(db: Db, apkDir: string): { path: string; size: number; fileName: string } | null {
  const release = latest(db)
  const file = release && fileFor(release, apkDir)
  return release && file ? { ...file, fileName: `deu-quanto-${release.version}.apk` } : null
}

export function publishRelease(db: Db, version: string, versionCode: number, fileName: string, notes: string | null) {
  db.prepare('INSERT INTO app_releases (version, version_code, file_name, notes, published_at) VALUES (?, ?, ?, ?, ?)').run(
    version,
    versionCode,
    basename(fileName),
    notes,
    new Date().toISOString(),
  )
}
