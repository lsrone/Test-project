import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { youtubePlugin } from './server/youtube.mjs'

export default defineConfig({ plugins: [react(), youtubePlugin()] })
