import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Same build layout as the Cost Analysis widget, so `zet pack` can package it for Zoho Creator:
//   app/widget.html  (index file)   app/js/widget.js  (one classic script)   app/css/widget.css
// Creator constraints: relative paths (base './'), one classic deferred script — no ES module, no module preload.
function creatorWidget(): Plugin {
  return {
    name: 'creator-widget',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, '<script defer src="$1"></script>').replace(/<link rel="stylesheet" crossorigin /g, '<link rel="stylesheet" ')
    },
    generateBundle(_, bundle) {
      // Creator's index file is app/widget.html; the dev server keeps using ./index.html.
      const page = bundle['index.html']
      if (page) {
        page.fileName = 'widget.html'
        bundle['widget.html'] = page
        delete bundle['index.html']
      }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), creatorWidget()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173 },
  build: {
    outDir: 'app',
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    target: 'es2018',
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'js/widget.js',
        assetFileNames: 'css/widget[extname]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // node_modules lives in node_modules.nosync (kept out of iCloud); only the project's own tests run
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
