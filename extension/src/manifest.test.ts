import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

const manifestUrl = new URL('../public/manifest.json', import.meta.url)

describe('extension manifest privacy boundary', () => {
  it('requests only the Chrome side panel permission and no host access', async () => {
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8')) as {
      permissions?: string[]
      host_permissions?: string[]
    }

    expect(manifest.permissions).toEqual(['sidePanel'])
    expect(manifest.host_permissions ?? []).toEqual([])
  })
})
