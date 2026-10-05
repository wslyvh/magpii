// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Detection } from '@intheopen/magpii'
import { BrowserDetectorClient, type WorkerLike } from '@intheopen/magpii/browser'
import { mountMagpii, type UiDetector } from './app'

// jsdom does not implement the browser modal dialog methods.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open')
    }
  }
})

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
  mountMagpii(root, { createDetector: () => detector, writeClipboard })
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

describe('Magpii UI', () => {
  it('warms the local model while leaving text entry available', async () => {
    const { root, detector } = setup()

    expect(detector.warmup).toHaveBeenCalledOnce()
    expect(root.querySelector<HTMLTextAreaElement>('[data-testid="input"]')?.disabled).toBe(false)
    await flush()
    expect(root.querySelector('[data-testid="model-status"]')?.textContent).toContain(
      'Ready locally',
    )
  })

  it('runs cleaning and shows identifier badges plus masked output', async () => {
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
    click(root, 'clean')
    await flush()

    const badges = [...root.querySelectorAll('[data-testid="found"] [data-type]')]
    expect(badges.map((badge) => badge.getAttribute('data-type'))).toEqual(['PERSON', 'EMAIL'])
    expect(root.querySelector('[data-testid="found"]')?.textContent).toContain('Jan de Vries')
    expect(root.querySelector('[data-testid="found"]')?.textContent).not.toContain(
      'HbA1c 72 mmol/mol',
    )
    expect(root.querySelector('[data-testid="output-section"]')?.hasAttribute('hidden')).toBe(false)
    expect(root.querySelector<HTMLTextAreaElement>('[data-testid="output"]')?.value).toBe(
      '[PERSON] mailt [EMAIL] over HbA1c 72 mmol/mol.',
    )
  })

  it('invalidates detections and output when input changes', async () => {
    const text = 'Jan de Vries'
    const { root } = setup([{ start: 0, end: text.length, type: 'PERSON', source: 'model' }])
    await flush()

    const input = root.querySelector<HTMLTextAreaElement>('[data-testid="input"]')!
    enter(input, text)
    click(root, 'clean')
    await flush()
    enter(input, `${text} gewijzigd`)

    expect(root.querySelector('[data-testid="found-section"]')?.hasAttribute('hidden')).toBe(true)
    expect(root.querySelector('[data-testid="output-section"]')?.hasAttribute('hidden')).toBe(true)
  })

  it('copies masked output only from the Copy action', async () => {
    const text = 'arts@example.nl'
    const { root, writeClipboard } = setup()
    await flush()

    const input = root.querySelector<HTMLTextAreaElement>('[data-testid="input"]')!
    enter(input, text)
    click(root, 'clean')
    await flush()
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
    mountMagpii(root, { createDetector: () => detector, writeClipboard: vi.fn() })
    await flush()

    const input = root.querySelector<HTMLTextAreaElement>('[data-testid="input"]')!
    enter(input, 'arts@example.nl')
    click(root, 'clean')
    await flush()

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('WASM failed')
    expect(root.querySelector('[data-testid="found-section"]')?.hasAttribute('hidden')).toBe(true)
  })

  it('recreates the detector after a fatal worker failure during startup', async () => {
    document.body.innerHTML = '<main id="app"></main>'
    const root = document.querySelector<HTMLElement>('#app')!
    const worker: WorkerLike = {
      onerror: null,
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      terminate: vi.fn(),
    }
    const failed = new BrowserDetectorClient(worker)
    const recovered: UiDetector = {
      warmup: vi.fn(async () => undefined),
      detect: vi.fn(async () => []),
      dispose: vi.fn(),
    }
    const createDetector = vi.fn().mockReturnValueOnce(failed).mockReturnValueOnce(recovered)
    const app = mountMagpii(root, { createDetector, writeClipboard: vi.fn() })

    worker.onerror?.(new ErrorEvent('error', { message: 'Worker load failed', cancelable: true }))
    await flush()
    expect(worker.terminate).toHaveBeenCalledOnce()

    enter(root.querySelector<HTMLTextAreaElement>('[data-testid="input"]')!, 'alex@example.com')
    click(root, 'clean')
    await flush()

    expect(createDetector).toHaveBeenCalledTimes(2)
    expect(root.querySelector<HTMLTextAreaElement>('[data-testid="output"]')?.value).toBe('[EMAIL]')
    expect(root.querySelector('[data-testid="model-status"]')?.textContent).toBe('Ready locally')
    expect(root.querySelector('[role="alert"]')?.hasAttribute('hidden')).toBe(true)
    app.destroy()
    expect(recovered.dispose).toHaveBeenCalledOnce()
  })

  it('retries with a fresh detector after inference fails', async () => {
    document.body.innerHTML = '<main id="app"></main>'
    const root = document.querySelector<HTMLElement>('#app')!
    const failed: UiDetector = {
      warmup: vi.fn(async () => undefined),
      detect: vi.fn(async () => {
        throw new Error('WASM failed')
      }),
      dispose: vi.fn(),
    }
    const recovered: UiDetector = {
      warmup: vi.fn(async () => undefined),
      detect: vi.fn(async () => []),
      dispose: vi.fn(),
    }
    const createDetector = vi.fn().mockReturnValueOnce(failed).mockReturnValueOnce(recovered)
    const app = mountMagpii(root, { createDetector, writeClipboard: vi.fn() })
    await flush()
    enter(root.querySelector<HTMLTextAreaElement>('[data-testid="input"]')!, 'alex@example.com')
    click(root, 'clean')
    await flush()
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('WASM failed')
    expect(failed.dispose).toHaveBeenCalledOnce()

    click(root, 'clean')
    await flush()
    expect(createDetector).toHaveBeenCalledTimes(2)
    expect(root.querySelector<HTMLTextAreaElement>('[data-testid="output"]')?.value).toBe('[EMAIL]')
    expect(root.querySelector('[role="alert"]')?.hasAttribute('hidden')).toBe(true)
    app.destroy()
  })

  it('opens the about dialog from the help button', () => {
    const { root } = setup()
    const dialog = root.querySelector<HTMLDialogElement>('[data-testid="about-dialog"]')!

    click(root, 'about')

    expect(root.querySelector('.tagline')?.textContent).toBe('Keep personal data out of AI')
    expect(dialog.open).toBe(true)
    expect(dialog.textContent).toContain('ChatGPT')
    expect(dialog.textContent).toContain('There are no Magpii servers')
    expect(dialog.querySelector('a[href*="github.com/wslyvh/magpii"]')).toBeTruthy()
    expect(dialog.querySelector('a[href*="intheopen.cc/projects/magpii"]')).toBeTruthy()
  })
})
