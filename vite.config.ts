import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1' },
  build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'charts', test: /node_modules[\\/]recharts/ }, { name: 'import-codec', test: /node_modules[\\/](pako|luaparse)/ }] } } } },
})
