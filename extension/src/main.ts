import './styles.css'
import { createBrowserDetector } from '@intheopen/magpii/browser'
import { mountMagpii } from './app'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('Magpii app root is missing')

const app = mountMagpii(root, {
  createDetector: () =>
    createBrowserDetector({
      assetBaseUrl: '/magpii/',
    }),
  writeClipboard: (text) => navigator.clipboard.writeText(text),
})

window.addEventListener('beforeunload', () => app.destroy(), { once: true })
