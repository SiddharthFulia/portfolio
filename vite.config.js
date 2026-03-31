import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.glb'],
  base: './',
  server: {
    port: 3000,
  },
})
