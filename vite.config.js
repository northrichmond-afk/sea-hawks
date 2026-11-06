import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' lets the site work from https://<user>.github.io/<repo>/
export default defineConfig({
  plugins: [react()],
  base: './',
})
