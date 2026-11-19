import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// The Python engine's core files ship inside the app (served by electron/pyodide-protocol.ts), so Python
// practicals run with no internet. Only the five files the engine needs are copied.
function bundlePyodideCore(): Plugin {
  const files = ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']
  return {
    name: 'bundle-pyodide-core',
    apply: 'build',
    closeBundle() {
      const from = path.resolve(__dirname, 'node_modules/pyodide')
      const to = path.resolve(__dirname, 'dist/pyodide')
      fs.mkdirSync(to, { recursive: true })
      for (const f of files) fs.copyFileSync(path.join(from, f), path.join(to, f))
    },
  }
}

export default defineConfig({
  plugins: [react(), bundlePyodideCore()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          monaco: ['@monaco-editor/react', 'monaco-editor'],
          charts: ['recharts'],
          formulas: ['hyperformula'],
        }
      }
    },
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 5173, strictPort: true },
  optimizeDeps: { exclude: ['@monaco-editor/react'] },
})
