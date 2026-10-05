import { chromium } from '@playwright/test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const extensionPath = join(root, 'dist')
const screenshotPath = join(root, 'store', 'screenshot-1280x800.png')
const demo =
  process.env.MAGPII_DEMO ??
  `This is to confirm the appointment with Jan de Vries, email jan.devries@email.com
Location: Amstel 1, 1011 PN in Amsterdam.

Please pay the deposit to NL91 ABNA 0417 1643 00.

See you next Thursday.`
const ready = { timeout: 120_000 }

const userDataDir = await mkdtemp(join(tmpdir(), 'magpii-store-shot-'))
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
})

try {
  let serviceWorker = context.serviceWorkers()[0]
  if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker')
  const extensionOrigin = `chrome-extension://${new URL(serviceWorker.url()).host}`
  const page = await context.newPage()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`${extensionOrigin}/index.html`)
  await page
    .locator('[data-testid="model-status"]')
    .filter({ hasText: 'Ready locally' })
    .waitFor(ready)
  await page.getByTestId('input').fill(demo)
  await page.getByTestId('clean').click()
  await page.getByTestId('found-section').waitFor(ready)
  await page.getByTestId('output-section').waitFor(ready)
  const found = await page.getByTestId('found').innerText()
  const cleaned = await page.getByTestId('output').inputValue()
  console.log('found:', found.replace(/\s+/g, ' '))
  console.log('output:', cleaned)
  await mkdir(dirname(screenshotPath), { recursive: true })
  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(`wrote ${screenshotPath}`)
} finally {
  await context.close()
  await rm(userDataDir, { recursive: true, force: true })
}
