import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
export async function mockArchive(
  page: Page,
  options: { title?: string; artist?: string; genre?: string; total?: number; fail?: boolean } = {},
) {
  const queries: string[] = []
  const audio = await readFile('public/audio/blue-hour.mp3')
  await page.route(
    (url) => url.hostname === 'archive.org' || url.pathname.startsWith('/api/archive/'),
    async (route) => {
      const url = new URL(route.request().url())
      const cors = { 'access-control-allow-origin': '*' }
      if (['/api/archive/search', '/advancedsearch.php'].includes(url.pathname)) {
        queries.push(url.searchParams.get('q') || '')
        if (options.fail) return route.fulfill({ status: 502, json: {} })
        const number = Number(url.searchParams.get('page') || 1),
          total = options.total ?? 8
        return route.fulfill({
          headers: cors,
          json: {
            response: {
              numFound: total,
              docs: Array.from(
                { length: Math.min(24, Math.max(0, total - (number - 1) * 24)) },
                (_, n) => ({
                  identifier: `search-${(number - 1) * 24 + n}`,
                  title: `Audio album ${(number - 1) * 24 + n}`,
                  creator: options.artist || 'Open Artist',
                }),
              ),
            },
          },
        })
      }
      if (url.pathname.includes('/metadata/')) {
        const id = url.pathname.split('/').at(-1)!
        const n = Number(id.split('-').at(-1)) || 0
        return route.fulfill({
          headers: cors,
          json: {
            metadata: {
              creator: options.artist || 'Open Artist',
              subject: options.genre || 'ambient',
              licenseurl: 'https://creativecommons.org/licenses/by/4.0/',
            },
            files: [
              {
                name: 'song.mp3',
                title: n === 0 ? options.title || 'Ocean Lights' : `Discovery ${n}`,
                length: '0:48',
              },
            ],
          },
        })
      }
      if (url.pathname.includes('/artwork/') || url.pathname.includes('/services/img/'))
        return route.fulfill({ path: 'public/app-icon-192.png', headers: cors })
      if (url.pathname.includes('/audio') || url.pathname.includes('/download/')) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '')
        const start = range ? Number(range[1]) : 0,
          end = range?.[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1
        const body = audio.subarray(start, end + 1)
        return route.fulfill({
          status: range ? 206 : 200,
          body,
          headers: {
            ...cors,
            'content-type': 'audio/mpeg',
            'content-length': String(body.length),
            'accept-ranges': 'bytes',
            ...(range ? { 'content-range': `bytes ${start}-${end}/${audio.length}` } : {}),
          },
        })
      }
      return route.abort()
    },
  )
  return queries
}
