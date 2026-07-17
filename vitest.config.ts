import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'node', // Worker環境での動作を保証するためデフォルトはNodeとする
      setupFiles: './src/setupTests.ts',
      exclude: [
        '**/node_modules/**',
        '**/.claude/**',
        'dist',
        '.idea',
        '.git',
        '.cache',
        'tests/e2e/**',
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
    },
  }),
)
