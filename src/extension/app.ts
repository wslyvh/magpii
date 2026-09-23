import { detectText, type ContextualDetector } from '../core/detect'
import { maskText } from '../core/mask'
import type { Detection } from '../core/types'

const REPO_URL = 'https://github.com/wslyvh/magpii-extension'
const PRIVACY_URL = 'https://www.intheopen.cc/projects/magpii#privacy'

export type UiDetector = ContextualDetector & {
  warmup(): Promise<void>
  dispose(): void
}

type AppDependencies = {
  detector: UiDetector
  writeClipboard(text: string): Promise<void>
}

export function mountMagpii(
  root: HTMLElement,
  { detector, writeClipboard }: AppDependencies,
): { destroy(): void } {
  root.innerHTML = `
    <div class="mx-auto min-h-screen w-full max-w-[560px] p-4">
      <header class="mb-4 flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-stretch gap-3">
          <div class="w-12 shrink-0 overflow-hidden rounded-field">
            <img class="h-full w-full object-cover" src="/icons/icon.png" alt="" />
          </div>
          <div class="min-w-0">
            <h1 class="text-2xl font-bold leading-none tracking-tight">Magpii</h1>
            <p class="tagline mt-1 text-sm text-base-content/60">Keep personal data out of AI</p>
          </div>
        </div>
        <button class="btn btn-sm h-9 min-h-9 w-9 shrink-0 rounded-field p-0" data-testid="about" type="button" aria-label="About Magpii" aria-haspopup="dialog" aria-controls="about-dialog">
          ?
        </button>
      </header>

      <section class="card mt-3 border border-base-300 bg-base-100">
        <div class="card-body gap-2 p-4">
          <div class="flex items-baseline justify-between gap-3">
            <label class="text-sm font-bold" for="source-text">Sensitive text</label>
            <span class="font-mono text-[10px] uppercase tracking-wide text-base-content/50" id="model-status" data-testid="model-status">Loading detector locally…</span>
          </div>
          <textarea
            id="source-text"
            class="textarea textarea-bordered w-full"
            data-testid="input"
            rows="8"
            spellcheck="false"
            placeholder="Paste text containing personal information…"
          ></textarea>
          <button class="btn btn-primary btn-block min-h-11" data-testid="clean" type="button" disabled>
            Clean text
          </button>
        </div>
      </section>

      <section class="card mt-3 border border-base-300 bg-base-100" data-testid="found-section" hidden>
        <div class="card-body gap-2 p-4">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-sm font-bold">Found</h2>
            <span class="font-mono text-[10px] uppercase tracking-wide text-base-content/50" id="detection-count"></span>
          </div>
          <div class="flex flex-wrap gap-2" data-testid="found" aria-label="Found identifiers"></div>
        </div>
      </section>

      <section class="card mt-3 border border-base-300 bg-base-100" data-testid="output-section" hidden>
        <div class="card-body gap-2 p-4">
          <div class="flex items-baseline justify-between gap-3">
            <label class="text-sm font-bold" for="masked-output">Cleaned output</label>
          </div>
          <textarea id="masked-output" class="textarea textarea-bordered w-full" data-testid="output" rows="9" spellcheck="false"></textarea>
          <button class="btn btn-outline btn-block min-h-11" data-testid="copy" type="button">Copy text</button>
        </div>
      </section>

      <p class="alert alert-error mt-3" role="alert" hidden></p>
      <p class="sr-status" role="status" aria-live="polite"></p>

      <dialog class="modal" id="about-dialog" data-testid="about-dialog">
        <div class="modal-box">
          <h2 class="text-lg font-bold">About Magpii</h2>
          <p class="mt-3">Magpii detects and masks personal information before you use sensitive text with ChatGPT, Claude, or other AI tools.</p>
          <p class="mt-3">Everything runs locally in your browser. Your text stays on your device.</p>
          <p class="mt-3">The current version detects common identifiers such as names, addresses, email addresses, phone numbers, BSNs, IBANs, and payment card numbers.</p>
          <h3 class="mt-4 text-sm font-bold">Privacy</h3>
          <ul class="mt-2 list-disc space-y-2 pl-5 text-sm">
            <li><strong>Local-first.</strong> Detection runs on your device.</li>
            <li><strong>Open source.</strong> The code is public and can be inspected, tested, and improved.</li>
            <li><strong>No account.</strong> Use Magpii without creating an account.</li>
            <li><strong>Your data is yours.</strong> Your text is never read, stored, or sent anywhere. There are no Magpii servers.</li>
          </ul>
          <p class="mt-4 flex flex-col gap-1">
            <a class="link link-primary" href="${REPO_URL}" target="_blank" rel="noreferrer noopener">View the source on GitHub</a>
            <a class="link link-primary" href="${PRIVACY_URL}" target="_blank" rel="noreferrer noopener">Privacy</a>
          </p>
          <form method="dialog" class="modal-action">
            <button class="btn" type="submit">Close</button>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="submit">Close</button>
        </form>
      </dialog>
    </div>
  `

  const input = required<HTMLTextAreaElement>(root, '[data-testid="input"]')
  const output = required<HTMLTextAreaElement>(root, '[data-testid="output"]')
  const cleanButton = required<HTMLButtonElement>(root, '[data-testid="clean"]')
  const copyButton = required<HTMLButtonElement>(root, '[data-testid="copy"]')
  const aboutButton = required<HTMLButtonElement>(root, '[data-testid="about"]')
  const aboutDialog = required<HTMLDialogElement>(root, '[data-testid="about-dialog"]')
  const foundSection = required<HTMLElement>(root, '[data-testid="found-section"]')
  const outputSection = required<HTMLElement>(root, '[data-testid="output-section"]')
  const found = required<HTMLElement>(root, '[data-testid="found"]')
  const modelStatus = required<HTMLElement>(root, '[data-testid="model-status"]')
  const detectionCount = required<HTMLElement>(root, '#detection-count')
  const alert = required<HTMLElement>(root, '[role="alert"]')
  const liveStatus = required<HTMLElement>(root, '[role="status"]')

  let inputVersion = 0
  let busy = false

  function setAlert(message?: string): void {
    alert.textContent = message ?? ''
    alert.hidden = !message
  }

  function updateCleanButton(): void {
    cleanButton.disabled = busy || input.value.trim().length === 0
  }

  function invalidateResults(): void {
    found.replaceChildren()
    output.value = ''
    foundSection.hidden = true
    outputSection.hidden = true
    liveStatus.textContent = ''
  }

  function renderBadges(text: string, detections: readonly Detection[]): void {
    const fragment = document.createDocumentFragment()
    if (detections.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'text-sm text-base-content/60'
      empty.textContent = 'No identifiers found.'
      fragment.append(empty)
    } else {
      for (const detection of detections) {
        const value = text.slice(detection.start, detection.end)
        const badge = document.createElement('span')
        badge.className = `pii-badge entity-${detection.type.toLowerCase().replace('_', '-')}`
        badge.dataset.type = detection.type
        badge.title = value

        const type = document.createElement('span')
        type.className = 'badge-type'
        type.textContent = detection.type
        const textNode = document.createElement('span')
        textNode.className = 'badge-value'
        textNode.textContent = value
        badge.append(type, textNode)
        fragment.append(badge)
      }
    }
    found.replaceChildren(fragment)
  }

  input.addEventListener('input', () => {
    inputVersion += 1
    invalidateResults()
    setAlert()
    updateCleanButton()
  })

  cleanButton.addEventListener('click', () => {
    const text = input.value
    const version = inputVersion
    busy = true
    updateCleanButton()
    setAlert()
    liveStatus.textContent = 'Cleaning text locally.'
    modelStatus.textContent = 'Cleaning locally…'

    void (async () => {
      try {
        await detector.warmup()
        const result = await detectText(text, detector)
        if (version !== inputVersion) return

        renderBadges(text, result)
        output.value = maskText(text, result)
        foundSection.hidden = false
        outputSection.hidden = false
        detectionCount.textContent = `${result.length} found`
        modelStatus.textContent = 'Ready locally'
        liveStatus.textContent = result.length
          ? `${result.length} identifiers found and masked.`
          : 'No supported identifiers found.'
      } catch (error) {
        if (version !== inputVersion) return
        invalidateResults()
        const message = error instanceof Error ? error.message : 'Local detection failed.'
        setAlert(`Cleaning failed locally: ${message}`)
        modelStatus.textContent = 'Local detector needs retry'
      } finally {
        busy = false
        updateCleanButton()
      }
    })()
  })

  copyButton.addEventListener('click', () => {
    setAlert()
    void writeClipboard(output.value)
      .then(() => {
        liveStatus.textContent = 'Text copied.'
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Clipboard access failed.'
        setAlert(`Copy failed: ${message}`)
      })
  })

  aboutButton.addEventListener('click', () => {
    if (aboutDialog.open) aboutDialog.close()
    else aboutDialog.showModal()
  })

  aboutDialog.addEventListener('click', (event) => {
    if (event.target === aboutDialog) aboutDialog.close()
  })

  updateCleanButton()
  void detector
    .warmup()
    .then(() => {
      modelStatus.textContent = 'Ready locally'
    })
    .catch(() => {
      modelStatus.textContent = 'Loads locally when you clean'
    })

  return {
    destroy(): void {
      if (aboutDialog.open) aboutDialog.close()
      detector.dispose()
      root.replaceChildren()
    },
  }
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Missing UI element: ${selector}`)
  return element
}
