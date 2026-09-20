import './styles.css'
import { createRampartClient } from '../inference/rampartClient'
import { mountMagpii } from './app'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('Magpii app root is missing')

const app = mountMagpii(root, {
  detector: createRampartClient(),
  writeClipboard: (text) => navigator.clipboard.writeText(text),
})

window.addEventListener('beforeunload', () => app.destroy(), { once: true })
