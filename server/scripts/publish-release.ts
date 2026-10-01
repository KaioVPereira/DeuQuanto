import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { openDb } from '../src/db.ts'
import { publishRelease } from '../src/releases.ts'

/**
 * Registra uma versão do APK (o arquivo já precisa estar em APK_DIR). No servidor:
 *
 *   docker exec deuquanto-sync node scripts/publish-release.ts \
 *     --version 1.1.0 --code 2 --file deu-quanto-1.1.0.apk --notes "O que mudou"
 *
 * Em --notes, "\n" vira quebra de linha.
 */
const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    code: { type: 'string' },
    file: { type: 'string' },
    notes: { type: 'string' },
  },
})

const dataDir = process.env.DATA_DIR ?? join(import.meta.dirname, '..', 'data')
const apkDir = process.env.APK_DIR ?? join(dataDir, 'apk')
const code = Number(values.code)
if (!values.version || !Number.isInteger(code) || code < 1 || !values.file) {
  console.error('Uso: --version 1.1.0 --code 2 --file deu-quanto-1.1.0.apk [--notes "..."]')
  process.exit(1)
}
if (!existsSync(join(apkDir, values.file))) {
  console.error(`Arquivo não encontrado em ${apkDir}: ${values.file}`)
  process.exit(1)
}

const db = openDb(join(dataDir, 'deuquanto.db'))
publishRelease(db, values.version, code, values.file, values.notes?.replace(/\\n/g, '\n') ?? null)
console.log(`Publicada a versão ${values.version} (code ${code}).`)
