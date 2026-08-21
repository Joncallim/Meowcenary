import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
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
