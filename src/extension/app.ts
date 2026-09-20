import { detectText, type ContextualDetector } from '../core/detect'
import { maskText, toDisplaySegments } from '../core/mask'
import type { Detection } from '../core/types'

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
    <div class="app-shell">
      <header class="app-header">
        <div class="brand-lockup">
          <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
          <div>
            <h1 class="wordmark">Magpii</h1>
            <p class="product-line">Healthcare text cleaner</p>
          </div>
        </div>
        <div class="local-badge"><span aria-hidden="true"></span>Local only</div>
      </header>

      <section class="privacy-note" aria-label="Privacy guarantee">
        <strong>Your text stays in this browser.</strong>
        <span>No uploads, accounts, or history.</span>
      </section>

      <section class="workspace-section input-section">
        <div class="section-heading">
          <label for="source-text">Sensitive text</label>
          <span id="model-status" data-testid="model-status">Loading detector locally…</span>
        </div>
        <textarea
          id="source-text"
          data-testid="input"
          rows="8"
          spellcheck="false"
          placeholder="Paste a clinical note, referral, or patient message…"
        ></textarea>
        <button class="button button-primary" data-testid="detect" type="button" disabled>
          <span class="button-icon" aria-hidden="true">⌁</span>
          Detect identifiers
        </button>
      </section>

      <section class="workspace-section" data-testid="preview-section" hidden>
        <div class="section-heading">
          <h2>Detected identifiers</h2>
          <span id="detection-count"></span>
        </div>
        <div class="preview" data-testid="preview" aria-label="Detected text preview"></div>
        <button class="button button-primary" data-testid="mask" type="button">Mask detected values</button>
      </section>

      <section class="workspace-section" data-testid="output-section" hidden>
        <div class="section-heading">
          <label for="masked-output">Cleaned output</label>
          <span>Ready to use</span>
        </div>
        <textarea id="masked-output" data-testid="output" rows="7" spellcheck="false"></textarea>
        <button class="button button-secondary" data-testid="copy" type="button">Copy cleaned text</button>
      </section>

      <p class="alert" role="alert" hidden></p>
      <p class="sr-status" role="status" aria-live="polite"></p>
      <footer>Rampart + validated local checks</footer>
    </div>
  `

  const input = required<HTMLTextAreaElement>(root, '[data-testid="input"]')
  const output = required<HTMLTextAreaElement>(root, '[data-testid="output"]')
  const detectButton = required<HTMLButtonElement>(root, '[data-testid="detect"]')
  const maskButton = required<HTMLButtonElement>(root, '[data-testid="mask"]')
  const copyButton = required<HTMLButtonElement>(root, '[data-testid="copy"]')
  const previewSection = required<HTMLElement>(root, '[data-testid="preview-section"]')
  const outputSection = required<HTMLElement>(root, '[data-testid="output-section"]')
  const preview = required<HTMLElement>(root, '[data-testid="preview"]')
  const modelStatus = required<HTMLElement>(root, '[data-testid="model-status"]')
  const detectionCount = required<HTMLElement>(root, '#detection-count')
  const alert = required<HTMLElement>(root, '[role="alert"]')
  const liveStatus = required<HTMLElement>(root, '[role="status"]')

  let detections: Detection[] = []
  let inputVersion = 0
  let busy = false

  function setAlert(message?: string): void {
    alert.textContent = message ?? ''
    alert.hidden = !message
  }

  function updateDetectButton(): void {
    detectButton.disabled = busy || input.value.trim().length === 0
  }

  function invalidateResults(): void {
    detections = []
    preview.replaceChildren()
    output.value = ''
    previewSection.hidden = true
    outputSection.hidden = true
    liveStatus.textContent = ''
  }

  function renderPreview(text: string): void {
    const fragment = document.createDocumentFragment()
    for (const segment of toDisplaySegments(text, detections)) {
      if (!segment.detection) {
        fragment.append(document.createTextNode(segment.text))
        continue
      }

      const mark = document.createElement('mark')
      mark.dataset.type = segment.detection.type
      mark.className = `entity entity-${segment.detection.type.toLowerCase().replace('_', '-')}`
      mark.setAttribute('aria-label', `${segment.text}, ${segment.detection.type}`)

      const value = document.createElement('span')
      value.className = 'entity-value'
      value.textContent = segment.text
      const label = document.createElement('span')
      label.className = 'entity-label'
      label.setAttribute('aria-hidden', 'true')
      label.textContent = segment.detection.type
      mark.append(value, label)
      fragment.append(mark)
    }
    preview.replaceChildren(fragment)
  }

  input.addEventListener('input', () => {
    inputVersion += 1
    invalidateResults()
    setAlert()
    updateDetectButton()
  })

  detectButton.addEventListener('click', () => {
    const text = input.value
    const version = inputVersion
    busy = true
    updateDetectButton()
    setAlert()
    liveStatus.textContent = 'Detecting identifiers locally.'
    modelStatus.textContent = 'Detecting locally…'

    void (async () => {
      try {
        await detector.warmup()
        const result = await detectText(text, detector)
        if (version !== inputVersion) return

        detections = result
        renderPreview(text)
        previewSection.hidden = false
        outputSection.hidden = true
        detectionCount.textContent = `${result.length} found`
        modelStatus.textContent = 'Ready locally'
        liveStatus.textContent = result.length
          ? `${result.length} identifiers detected.`
          : 'No supported identifiers detected.'
      } catch (error) {
        if (version !== inputVersion) return
        invalidateResults()
        const message = error instanceof Error ? error.message : 'Local detection failed.'
        setAlert(`Detection failed locally: ${message}`)
        modelStatus.textContent = 'Local detector needs retry'
      } finally {
        busy = false
        updateDetectButton()
      }
    })()
  })

  maskButton.addEventListener('click', () => {
    output.value = maskText(input.value, detections)
    outputSection.hidden = false
    liveStatus.textContent = 'Detected values masked.'
  })

  copyButton.addEventListener('click', () => {
    setAlert()
    void writeClipboard(output.value)
      .then(() => {
        liveStatus.textContent = 'Cleaned text copied.'
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Clipboard access failed.'
        setAlert(`Copy failed: ${message}`)
      })
  })

  updateDetectButton()
  void detector
    .warmup()
    .then(() => {
      modelStatus.textContent = 'Ready locally'
    })
    .catch(() => {
      modelStatus.textContent = 'Loads locally when you detect'
    })

  return {
    destroy(): void {
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
