import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    hookTimeout: 60000,
    testTimeout: 60000,
    sequence: { concurrent: false },
  },
});
