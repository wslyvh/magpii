import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const store = resolve(root, 'store')
const zipPath = resolve(store, 'magpii.zip')

statSync(resolve(dist, 'manifest.json'))
mkdirSync(store, { recursive: true })
rmSync(zipPath, { force: true })

const result = spawnSync('zip', ['-r', '-X', zipPath, '.', '-x', '*.map', '-x', '*/*.map'], {
  cwd: dist,
  stdio: 'inherit',
})
if (result.status !== 0) process.exit(result.status ?? 1)

console.log(`wrote ${zipPath} (${statSync(zipPath).size} bytes)`)
