import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lockPath = resolve(root, 'model-lock.json')
const lock = JSON.parse(await readFile(lockPath, 'utf8'))
const verifyOnly = process.argv.includes('--verify')
let lockChanged = false

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

for (const [file, expectedHash] of Object.entries(lock.files)) {
  const target = resolve(root, 'public/models/rampart', file)
  let bytes

  try {
    bytes = await readFile(target)
  } catch {
    if (verifyOnly) throw new Error(`Missing model asset: ${file}. Run yarn model:fetch.`)
  }

  if (bytes && expectedHash && sha256(bytes) === expectedHash) {
    console.log(`verified ${file}`)
    continue
  }

  if (verifyOnly) {
    throw new Error(`Model asset checksum mismatch: ${file}. Run yarn model:fetch.`)
  }

  const encodedFile = file.split('/').map(encodeURIComponent).join('/')
  const url = `https://huggingface.co/${lock.model}/resolve/${lock.revision}/${encodedFile}?download=true`
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Failed to fetch ${file}: HTTP ${response.status}`)

  bytes = Buffer.from(await response.arrayBuffer())
  const actualHash = sha256(bytes)
  if (expectedHash && actualHash !== expectedHash) {
    throw new Error(`Downloaded checksum mismatch for ${file}`)
  }

  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.tmp`
  await writeFile(temporary, bytes)
  await rename(temporary, target)
  await rm(temporary, { force: true })

  if (!expectedHash) {
    lock.files[file] = actualHash
    lockChanged = true
  }
  console.log(`fetched ${file}`)
}

if (lockChanged) {
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  console.log('recorded model checksums')
}
