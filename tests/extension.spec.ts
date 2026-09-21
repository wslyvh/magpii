import { expect, test, chromium, type BrowserContext, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let context: BrowserContext
let page: Page
let userDataDir: string
const remoteRequests: string[] = []

async function openExtension(): Promise<{ context: BrowserContext; page: Page }> {
  const extensionPath = join(process.cwd(), 'dist')
  userDataDir = await mkdtemp(join(tmpdir(), 'magpii-playwright-'))
  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  })

  let serviceWorker = browserContext.serviceWorkers()[0]
  if (!serviceWorker) serviceWorker = await browserContext.waitForEvent('serviceworker')
  const extensionId = new URL(serviceWorker.url()).host
  const extensionOrigin = `chrome-extension://${extensionId}`
  browserContext.on('request', (request) => {
    if (/^https?:/.test(request.url())) remoteRequests.push(request.url())
  })

  const extensionPage = await browserContext.newPage()
  await extensionPage.goto(`${extensionOrigin}/sidepanel.html`)
  return { context: browserContext, page: extensionPage }
}

test.beforeAll(async () => {
  ;({ context, page } = await openExtension())
})

test.afterAll(async () => {
  await context?.close()
  if (userDataDir) await rm(userDataDir, { recursive: true, force: true })
})

test('loads bundled Rampart and masks Dutch identifiers', async () => {
  const input =
    'Jan de Vries, geboren op 14-03-1968, woont aan de Zijlweg 12 in Haarlem. De vergadering blijft staan.'

  await expect(page.locator('[data-testid="model-status"]')).toContainText('Ready locally')
  await expect(page.locator('h1')).toHaveText('Magpii')
  await page.getByTestId('input').fill(input)
  await page.getByTestId('detect').click()
  await expect(page.getByTestId('preview-section')).toBeVisible()

  await expect(page.locator('mark[data-type="PERSON"] .entity-value')).toHaveText('Jan de Vries')
  await expect(page.locator('mark[data-type="ADDRESS"] .entity-value')).toHaveText(
    'Zijlweg 12 in Haarlem',
  )
  await expect(page.getByTestId('preview')).toContainText('De vergadering blijft staan')
  await expect(page.getByTestId('preview')).toContainText('14-03-1968')

  await page.getByTestId('mask').click()
  await expect(page.getByTestId('output')).toHaveValue(
    '[PERSON], geboren op 14-03-1968, woont aan de [ADDRESS]. De vergadering blijft staan.',
  )
  for (const button of await page.locator('.button:visible').all()) {
    const box = await button.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
  expect(remoteRequests).toEqual([])
})

test('runs all five structured detectors and copies the cleaned output', async () => {
  const input =
    'Mail jan@example.nl, bel 06-12345678, BSN 111222333, IBAN NL91 ABNA 0417 1643 00, kaart 4111 1111 1111 1111. Document 500.'

  await page.getByTestId('input').fill(input)
  await page.getByTestId('detect').click()
  await expect(page.getByTestId('preview-section')).toBeVisible()

  const types = await page.locator('mark[data-type]').evaluateAll((marks) =>
    marks.map((mark) => mark.getAttribute('data-type')),
  )
  expect(new Set(types)).toEqual(
    new Set(['EMAIL', 'PHONE', 'BSN', 'IBAN', 'CREDIT_CARD']),
  )

  await page.getByTestId('mask').click()
  const expected =
    'Mail [EMAIL], bel [PHONE], BSN [BSN], IBAN [IBAN], kaart [CREDIT_CARD]. Document 500.'
  await expect(page.getByTestId('output')).toHaveValue(expected)
  await page.getByTestId('copy').click()
  await expect(page.getByRole('status')).toContainText('copied')
  expect(remoteRequests).toEqual([])

  await page.screenshot({
    path: 'test-results/magpii-sidepanel.png',
    fullPage: true,
  })
})
