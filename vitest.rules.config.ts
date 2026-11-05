import { defineConfig } from 'vitest/config';

// Chạy bằng: npm run test:rules (cần Firebase Emulator + Java)
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/security-rules/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
