import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { archivePlugin } from './server/archive.mjs'
import { youtubeSearchPlugin } from './server/youtube-search.mjs'

export default defineConfig({ plugins: [react(), archivePlugin(), youtubeSearchPlugin()] })
