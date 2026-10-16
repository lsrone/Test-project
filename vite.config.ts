import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { archivePlugin } from './server/archive.mjs'

export default defineConfig({ plugins: [react(), archivePlugin()] })
