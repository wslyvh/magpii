import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  expect: {
    timeout: 90_000,
  },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
})
