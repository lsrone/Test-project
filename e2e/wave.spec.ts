import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.use({ serviceWorkers: 'block' })

async function provider(
  page: Page,
  settings: {
    unavailable: boolean
    slowInitial: boolean
    totalReleases?: number
  } = { unavailable: false, slowInitial: false },
) {
  const searches: string[] = []
  await page.route('https://archive.org/advancedsearch.php?**', (route) => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('q') || ''
    searches.push(query)
    if (settings.unavailable) return route.fulfill({ status: 503, json: {} })
    const kind = query.includes('ambient')
      ? 'focus'
      : query.includes('electronic')
        ? 'energy'
        : 'all'
    const number = Number(url.searchParams.get('page'))
    const total = settings.totalReleases ?? 240
    const length = Math.max(0, Math.min(24, total - (number - 1) * 24))
    return route.fulfill({
      json: {
        response: {
          numFound: total,
          docs: Array.from({ length }, (_, n) => ({
            identifier: `${kind}-${(number - 1) * 24 + n}`,
            title: `Album ${kind}-${(number - 1) * 24 + n}`,
          })),
        },
      },
    })
  })
  await page.route('https://archive.org/metadata/**', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop()!
    if (settings.slowInitial && id.startsWith('all-'))
      await new Promise((resolve) => setTimeout(resolve, 600))
    await route
      .fulfill({
        json: {
          metadata: {
            creator: `Artist ${id}`,
            subject: id.startsWith('energy-') ? 'electronic' : 'ambient',
          },
          files: [0, 1, 2].map((n) => ({
            name: `${n}.mp3`,
            title: `Discovery ${id}-${n}`,
            length: '0:48',
          })),
        },
      })
      .catch(() => {})
  })
  await page.route('https://archive.org/services/img/**', (route) =>
    route.fulfill({ path: 'public/app-icon-192.png' }),
  )
  const audio = await readFile('public/audio/blue-hour.mp3')
  await page.route('https://archive.org/download/**', (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '')
    const start = range ? Number(range[1]) : 0
    const end = range?.[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1
    const body = audio.subarray(start, end + 1)
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: 'audio/mpeg',
      headers: {
        'content-length': String(body.length),
        'accept-ranges': 'bytes',
        'access-control-allow-origin': '*',
        ...(range ? { 'content-range': `bytes ${start}-${end}/${audio.length}` } : {}),
      },
      body,
    })
  })
  return searches
}

test('discovers 120 distinct tracks across catalogue pages, persists them, and plays from the complete queue', async ({
  page,
}) => {
  test.setTimeout(60000)
  await provider(page, { unavailable: false, slowInitial: false, totalReleases: 60 })
  const requestedPages = new Set<number>()
  page.on('request', (request) => {
    if (request.url().startsWith('https://archive.org/advancedsearch.php?'))
      requestedPages.add(Number(new URL(request.url()).searchParams.get('page')))
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Сосредоточиться/ }).click()
  for (let batch = 0; batch < 10; batch++) {
    if (batch) await page.getByRole('button', { name: 'Обновить волну', exact: true }).click()
    await expect(page.locator('.track-info strong').first()).toHaveText(
      `Discovery focus-${batch * 6}-0`,
    )
    await expect(page.locator('.wave-status')).toContainText('12 новых треков')
    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('volna.online-tracks') || '[]') as { id: string }[],
    )
    expect(stored).toHaveLength((batch + 1) * 12)
    expect(new Set(stored.map((track) => track.id)).size).toBe(stored.length)
  }
  expect([...requestedPages]).toEqual([1, 2, 3])
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('Discovery focus-')
  await page.getByRole('tab', { name: 'В библиотеке' }).click()
  await expect(page.locator('.track-row')).toHaveCount(120)
  await expect(page.locator('.track-info strong').first()).toHaveText('Discovery focus-54-0')
  await page.getByRole('button', { name: 'Слушать Discovery focus-5-1', exact: true }).click()
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.1)
  await expect(page.locator('.player-track-info strong')).toHaveText('Discovery focus-5-1')
  await page.getByRole('button', { name: 'Следующий трек', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('Discovery focus-54-0')
  await page.getByRole('button', { name: 'Очередь воспроизведения' }).click()
  await expect(page.locator('.queue-track')).toHaveCount(119)
  await page.reload()
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('Discovery focus-')
  await page.getByRole('tab', { name: 'В библиотеке' }).click()
  await expect(page.locator('.track-row')).toHaveCount(120)
})

async function openWave(page: Page) {
  await page.goto('/')
  await page.locator('.primary-nav').getByRole('button', { name: 'Моя волна', exact: true }).click()
  await expect(page.locator('.wave-status')).toContainText('12 новых треков')
}

test('wave discovers tracks automatically, refreshes without interrupting music, and resumes discovery after reload', async ({
  page,
}) => {
  await provider(page)
  await openWave(page)
  const initial = await page.locator('.track-info strong').allTextContents()
  expect(initial[0]).toBe('Discovery all-0-0')
  await page.getByRole('button', { name: 'Включить волну', exact: true }).click()
  await expect(page.locator('audio')).toHaveJSProperty('paused', false)
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.1)
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('10')
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(9)
  const playing = await page.locator('.player-track-info strong').textContent()
  await page.getByRole('button', { name: 'Обновить волну', exact: true }).click()
  await expect(page.locator('.track-info strong').first()).toHaveText('Discovery focus-0-0')
  await expect(page.locator('.player-track-info strong')).toHaveText(playing!)
  expect(
    await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime),
  ).toBeGreaterThan(9)
  await page.getByRole('button', { name: 'Следующий трек', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('Discovery focus-0-0')
  await page.reload()
  await page.locator('.primary-nav').getByRole('button', { name: 'Моя волна', exact: true }).click()
  await expect(page.locator('.wave-status')).toContainText('12 новых треков')
  await expect(page.locator('.track-info strong').first()).toHaveText('Discovery focus-6-0')
})

test('wave refills the upcoming queue before discoveries run out', async ({ page }) => {
  const requests = await provider(page)
  await openWave(page)
  await page.getByRole('button', { name: 'Включить волну', exact: true }).click()
  for (let index = 0; index < 8; index++) {
    const before = await page.locator('.player-track-info strong').textContent()
    await page.getByRole('button', { name: 'Следующий трек', exact: true }).click()
    await expect(page.locator('.player-track-info strong')).not.toHaveText(before!)
  }
  await expect.poll(() => requests.length).toBeGreaterThan(1)
  await expect(page.locator('.wave-status')).toContainText('12 новых треков')
  await page.getByRole('button', { name: 'Очередь воспроизведения' }).click()
  await expect(
    page.locator('.queue-track').filter({ hasText: 'Discovery focus-0-0' }),
  ).toBeVisible()
})

test('changing mood cancels stale discoveries and shows tracks matching the new mood', async ({
  page,
}) => {
  await provider(page, { unavailable: false, slowInitial: true })
  await page.goto('/')
  const firstAlbum = page.waitForRequest('https://archive.org/metadata/all-0')
  await page.locator('.primary-nav').getByRole('button', { name: 'Моя волна', exact: true }).click()
  await firstAlbum
  await page
    .locator('.mood-filters')
    .getByRole('button', { name: /Сосредоточиться/ })
    .click()
  await expect(page.locator('.wave-status')).toContainText('12 новых треков')
  await expect(page.locator('.track-info strong').first()).toHaveText('Discovery focus-0-0')
  await page
    .locator('.mood-filters')
    .getByRole('button', { name: /Зарядиться/ })
    .click()
  await expect(page.locator('.track-info strong').first()).toHaveText('Discovery energy-0-0')
  // Let the deliberately slow response finish; it must not overwrite the selected mood.
  await page.waitForTimeout(700)
  const tracks = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('volna.online-tracks') || '[]'),
  )
  expect(tracks.some((track: { id: string }) => track.id.includes('archive:all-'))).toBe(false)
  expect(await page.locator('.track-genre').allTextContents()).toEqual(
    expect.arrayContaining(['Электроника']),
  )
})

test('provider failure is visible, existing music plays, and refresh retries successfully', async ({
  page,
}) => {
  const settings = { unavailable: true, slowInitial: false }
  const requests = await provider(page, settings)
  await page.goto('/')
  await page.locator('.primary-nav').getByRole('button', { name: 'Моя волна', exact: true }).click()
  await expect(page.locator('.wave-status')).toHaveAttribute('role', 'alert')
  await page.getByRole('button', { name: 'Включить волну', exact: true }).click()
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.1)
  expect(requests).toHaveLength(1)
  settings.unavailable = false
  await page.getByRole('button', { name: 'Обновить волну', exact: true }).click()
  await expect(page.locator('.wave-status')).toContainText('12 новых треков')
  await expect(page.locator('.track-info strong').first()).toContainText('Discovery ')
  await expect(page.locator('.player-track-info strong')).toHaveText('Blue Hour')
})
