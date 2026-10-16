import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// Replace only provider transport: the application uses its real HTMLAudioElement.
export async function mockYouTubePlayback(page: Page, blockedIds: string[] = []) {
  const audio = await readFile('public/audio/blue-hour.mp3')
  await page.route('**/api/youtube/resolve?**', (route) => {
    const id = new URL(route.request().url()).searchParams.get('id')!
    if (blockedIds.includes(id))
      return route.fulfill({
        status: 503,
        json: {
          message: 'Эта запись ограничена источником. Можно подобрать другую доступную запись.',
        },
      })
    return route.fulfill({ json: { id, audio: `/api/youtube/audio?id=${id}`, duration: 48 } })
  })
  await page.route('**/api/youtube/audio?**', (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '')
    const start = range ? Number(range[1]) : 0,
      end = range?.[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1
    const body = audio.subarray(start, end + 1)
    return route.fulfill({
      status: range ? 206 : 200,
      body,
      headers: {
        'content-type': 'audio/mpeg',
        'content-length': String(body.length),
        'accept-ranges': 'bytes',
        ...(range ? { 'content-range': `bytes ${start}-${end}/${audio.length}` } : {}),
      },
    })
  })
}
