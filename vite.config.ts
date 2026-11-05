import { defineConfig } from 'vite';

// Phaser's arcade-only build drops Matter.js etc. (we only use Arcade physics),
// which keeps the shipped bundle noticeably smaller. Types still come from "phaser".
export default defineConfig({
  resolve: {
    alias: { phaser: 'phaser/dist/phaser-arcade-physics.min.js' },
  },
  build: {
    target: 'es2022',
    minify: true,
    sourcemap: false,
    assetsInlineLimit: 0, // art stays as separate cacheable files
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Phaser rarely changes: keep it in its own long-cached chunk so game edits don't re-download it.
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  server: { port: 5173 },
});
