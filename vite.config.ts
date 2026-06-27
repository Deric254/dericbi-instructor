import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          monaco: ['@monaco-editor/react'],
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
