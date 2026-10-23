import { configDefaults, defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  // Cada test levanta su propio Postgres en memoria (PGlite) y lo migra: tarda 2–3 s y en paralelo
  // superaba el límite de 5 s por defecto, aunque el test en sí pasara. Lo mismo con los hooks (10 s por defecto):
  // hay archivos que la levantan en un beforeEach.
  test: {
    environment: 'node', testTimeout: 30_000, hookTimeout: 30_000, exclude: [...configDefaults.exclude, 'aws-backend/**'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
