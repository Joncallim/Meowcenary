import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
  },
  test: {
    // The zero-allocation poll-path regression test (Epic 19 §6 gate) needs
    // explicit GC between measurement windows. Vitest 3's default pool is
    // 'forks' — execArgv must be set there to reach the worker.
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: ['--expose-gc'],
      },
    },
  },
  build: {
    target: 'es2022',
    // Phaser is the expected large runtime dependency; keep app code separate so
    // future bundle growth is easier to spot.
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
