import type { Page } from '@playwright/test'
export async function mockYouTube(page: Page, { total = 120, fail = false } = {}) {
  const queries: string[] = []
  await page.route('https://i.ytimg.com/**', (route) =>
    route.fulfill({ path: 'public/app-icon-192.png' }),
  )
  await page.route('**/api/youtube/search?**', (route) => {
    const url = new URL(route.request().url()),
      q = url.searchParams.get('q') || ''
    queries.push(q)
    if (fail)
      return route.fulfill({
        status: 502,
        json: { message: 'Не удалось получить результаты YouTube.' },
      })
    const offset = Number(url.searchParams.get('pageToken') || 0)
    return route.fulfill({
      json: {
        items: Array.from({ length: Math.min(20, total - offset) }, (_, i) => ({
          id: `vid${String(offset + i).padStart(8, '0')}`,
          title: offset + i === 0 ? 'ØDEN — Blink' : `YouTube song ${offset + i}`,
          channel: 'ØDEN - Topic',
          duration: 170 + i,
        })),
        nextPageToken: offset + 20 < total ? String(offset + 20) : undefined,
      },
    })
  })
  return queries
}
