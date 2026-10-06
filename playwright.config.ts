import { defineConfig, devices } from '@playwright/test';

/** اختبارات من طرف لطرف على النسخة المبنية (vite preview) بمتصفح حقيقي وIndexedDB حقيقية. */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    serviceWorkers: 'block', // لا نختبر التخزين المؤقت هنا؛ فقط سلوك التطبيق وبياناته
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
