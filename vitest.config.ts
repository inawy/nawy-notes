import { defineConfig } from 'vitest/config';

// إعداد مستقل عن vite.config.ts: لا نحتاج إضافات PWA وTailwind في الاختبارات.
// اختبارات node:test القديمة (tests/*.test.ts) تعمل بـ `npm run test:node`.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
