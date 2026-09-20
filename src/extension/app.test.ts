// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Detection } from '../core/types'
import { mountMagpii, type UiDetector } from './app'

type Harness = {
  root: HTMLElement
  detector: UiDetector
  writeClipboard: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>
}

function setup(modelDetections: Detection[] = []): Harness {
  document.body.innerHTML = '<main id="app"></main>'
  const root = document.querySelector<HTMLElement>('#app')!
  const detector: UiDetector = {
    warmup: vi.fn(async () => undefined),
    detect: vi.fn(async () => modelDetections),
    dispose: vi.fn(),
  }
  const writeClipboard = vi.fn(async () => undefined)
  mountMagpii(root, { detector, writeClipboard })
  return { root, detector, writeClipboard }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function enter(input: HTMLTextAreaElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function click(root: HTMLElement, testId: string): void {
  root.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click()
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Magpii side panel', () => {
  it('exposes the product name as the single level-one heading', () => {
    const { root } = setup()

    const headings = root.querySelectorAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('Magpii')
  })

  it('warms the local model while leaving text entry available', async () => {
    const { root, detector } = setup()

    expect(detector.warmup).toHaveBeenCalledOnce()
    expect(root.querySelector<HTMLTextAreaElement>('[data-testid="input"]')?.disabled).toBe(false)
    await flush()
    expect(root.querySelector('[data-testid="model-status"]')?.textContent).toContain('Ready locally')
  })

  it('runs detection, renders typed highlights, then masks exact spans', async () => {
    const text = 'Jan de Vries mailt arts@example.nl over HbA1c 72 mmol/mol.'
    const name = 'Jan de Vries'
    const { root } = setup([
      {
        start: text.indexOf(name),
        end: text.indexOf(name) + name.length,
        type: 'PERSON',
        source: 'model',
      },
    ])
    await flush()

    const input = root.querySelector<HTMLTextAreaElement>('[data-testid="input"]')!
    enter(input, text)
    click(root, 'detect')
    await flush()

    const marks = [...root.querySelectorAll('mark[data-type]')]
    expect(marks.map((mark) => mark.getAttribute('data-type'))).toEqual(['PERSON', 'EMAIL'])
    expect(root.querySelector('[data-testid="preview"]')?.textContent).toContain('HbA1c 72 mmol/mol')

    click(root, 'mask')
    expect(root.querySelector<HTMLTextAreaElement>('[data-testid="output"]')?.value).toBe(
      '[PERSON] mailt [EMAIL] over HbA1c 72 mmol/mol.',
    )
  })

  it('invalidates detections and output when input changes', async () => {
    const text = 'Jan de Vries'
    const { root } = setup([
      { start: 0, end: text.length, type: 'PERSON', source: 'model' },
    ])
    await flush()

    const input = root.querySelector<HTMLTextAreaElement>('[data-testid="input"]')!
    enter(input, text)
    click(root, 'detect')
    await flush()
    click(root, 'mask')
    enter(input, `${text} gewijzigd`)

    expect(root.querySelector('[data-testid="preview-section"]')?.hasAttribute('hidden')).toBe(true)
    expect(root.querySelector('[data-testid="output-section"]')?.hasAttribute('hidden')).toBe(true)
  })

  it('copies masked output only from the Copy action', async () => {
    const text = 'arts@example.nl'
    const { root, writeClipboard } = setup()
    await flush()

    const input = root.querySelector<HTMLTextAreaElement>('[data-testid="input"]')!
    enter(input, text)
    click(root, 'detect')
    await flush()
    click(root, 'mask')
    click(root, 'copy')
    await flush()

    expect(writeClipboard).toHaveBeenCalledWith('[EMAIL]')
    expect(root.querySelector('[role="status"]')?.textContent).toContain('copied')
  })

  it('shows local inference failures without presenting partial output', async () => {
    document.body.innerHTML = '<main id="app"></main>'
    const root = document.querySelector<HTMLElement>('#app')!
    const detector: UiDetector = {
      warmup: vi.fn(async () => undefined),
      detect: vi.fn(async () => {
        throw new Error('WASM failed')
      }),
      dispose: vi.fn(),
    }
    mountMagpii(root, { detector, writeClipboard: vi.fn() })
    await flush()

    const input = root.querySelector<HTMLTextAreaElement>('[data-testid="input"]')!
    enter(input, 'arts@example.nl')
    click(root, 'detect')
    await flush()

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('WASM failed')
    expect(root.querySelector('[data-testid="preview-section"]')?.hasAttribute('hidden')).toBe(true)
  })
})
