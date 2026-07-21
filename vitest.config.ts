import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    // los servicios corren git de verdad contra repos temporales; las libs
    // puras del renderer (graph, ansi, format, gitError, i18n) son node-safe
    environment: 'node',
    include: ['src/main/__tests__/**/*.test.ts', 'src/renderer/src/lib/__tests__/**/*.test.ts'],
    // crear repos y correr git es mas lento que un test puro
    testTimeout: 20_000
  }
})
