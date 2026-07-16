import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared') }
  },
  test: {
    // los servicios corren git de verdad contra repos temporales
    environment: 'node',
    include: ['src/main/__tests__/**/*.test.ts'],
    // crear repos y correr git es mas lento que un test puro
    testTimeout: 20_000
  }
})
