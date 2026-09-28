import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

function resolveBuildSha(): string {
  const supplied = process.env.MEOWCENARY_BUILD_SHA?.trim();
  if (supplied && /^[0-9a-f]{40}$/.test(supplied)) return supplied;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const buildSha = resolveBuildSha();

export default defineConfig({
  plugins: [{
    name: 'meowcenary-build-identity',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'meowcenary-build', content: buildSha }, injectTo: 'head' }];
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-meta.json',
        source: `${JSON.stringify({ commit: buildSha })}\n`,
      });
    },
  }],
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
