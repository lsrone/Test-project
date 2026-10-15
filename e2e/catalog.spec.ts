import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function catalogFixture(page: Page) {
  await page.route('https://archive.org/advancedsearch.php?**', (route) => {
    const url = new URL(route.request().url())
    const pageNumber = Number(url.searchParams.get('page'))
    return route.fulfill({
      json: {
        response: {
          numFound: 50,
          docs: Array.from({ length: pageNumber === 3 ? 2 : 24 }, (_, n) => ({
            identifier: `open-release-${(pageNumber - 1) * 24 + n}`,
            title: `Open Album ${(pageNumber - 1) * 24 + n}`,
            creator: 'Open Artist',
            licenseurl: 'https://creativecommons.org/licenses/by/4.0/',
          })),
        },
      },
    })
  })
  await page.route('https://archive.org/services/img/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#3c638f"/></svg>',
    }),
  )
  await page.route('https://archive.org/metadata/**', (route) =>
    route.fulfill({
      json: {
        metadata: {
          creator: 'Open Artist',
          subject: ['ambient'],
          licenseurl: 'https://creativecommons.org/licenses/by/4.0/',
        },
        files: [
          { name: 'cloud-atlas.mp3', title: 'Cloud Atlas', length: '0:48' },
          { name: 'no-preview-limit.mp3', title: 'No Preview Limit', length: '0:48' },
        ],
      },
    }),
  )
  const audio = await readFile('public/audio/blue-hour.mp3')
  await page.route('https://archive.org/download/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      headers: { 'content-length': String(audio.length), 'access-control-allow-origin': '*' },
      body: audio,
    }),
  )
  return audio
}

async function openAlbum(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Онлайн-каталог/ }).click()
  await expect(page.locator('.catalog-card')).toHaveCount(24)
  await page.getByRole('button', { name: 'Открыть релиз Open Album 0', exact: true }).click()
  await expect(page.locator('.catalog-release-details .track-row')).toHaveCount(2)
}

test('loads more than eight tracks worth of releases, paginates, and plays an imported full track', async ({
  page,
}) => {
  await catalogFixture(page)
  await page.goto('/')
  await page.getByRole('button', { name: /Онлайн-каталог/ }).click()
  await expect(page.locator('.catalog-card')).toHaveCount(24)
  await page.getByRole('button', { name: 'Загрузить следующие релизы' }).click()
  await expect(page.locator('.catalog-card')).toHaveCount(48)
  await page.getByRole('button', { name: 'Загрузить следующие релизы' }).click()
  await expect(page.locator('.catalog-card')).toHaveCount(50)
  await expect(page.getByRole('button', { name: 'Загрузить следующие релизы' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Открыть релиз Open Album 0', exact: true }).click()
  await page.getByRole('button', { name: 'Слушать Cloud Atlas', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('Cloud Atlas')
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.1)
  await page.getByRole('button', { name: 'Добавить Cloud Atlas в избранное', exact: true }).click()
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText('Cloud Atlas')
  await page.reload()
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText('Cloud Atlas')
})

test('stores actual audio, reloads offline, seeks from local storage, and removes the copy', async ({
  page,
  context,
}) => {
  await catalogFixture(page)
  await openAlbum(page)
  await page.getByRole('button', { name: 'Скачать Cloud Atlas для офлайн' }).click()
  await expect(page.getByRole('button', { name: 'Удалить офлайн-копию Cloud Atlas' })).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      )
  })
  await context.setOffline(true)
  await page.reload()
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /^Скачанное/ })
    .click()
  await expect(page.locator('.track-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Слушать Cloud Atlas', exact: true }).click()
  await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/)
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.1)
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('20')
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(19)
  await page.getByRole('button', { name: 'Удалить офлайн-копию Cloud Atlas' }).click()
  await expect(page.getByRole('heading', { name: 'Пока ничего не скачано' })).toBeVisible()
  expect(
    await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const request = indexedDB.open('volna-offline', 1)
          request.onsuccess = () => {
            const count = request.result.transaction('audio').objectStore('audio').count()
            count.onsuccess = () => resolve(count.result)
            count.onerror = () => reject(count.error)
          }
          request.onerror = () => reject(request.error)
        }),
    ),
  ).toBe(0)
  await context.setOffline(false)
})

test('cancellation of a partial download leaves no offline-ready entry', async ({ page }) => {
  await catalogFixture(page)
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (input, options) => {
      const url = String(input)
      if (!url.startsWith('https://archive.org/download/')) return nativeFetch(input, options)
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(1024))
          const timer = setTimeout(() => controller.close(), 10000)
          options?.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer)
              controller.error(new DOMException('Canceled', 'AbortError'))
            },
            { once: true },
          )
        },
      })
      return new Response(stream, {
        headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '1024000' },
      })
    }
  })
  await openAlbum(page)
  await page.getByRole('button', { name: 'Скачать Cloud Atlas для офлайн' }).click()
  await expect(page.locator('.download-status')).toBeVisible()
  await page.getByRole('button', { name: 'Отменить текущее скачивание' }).click()
  await expect(page.locator('.download-status')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Удалить офлайн-копию Cloud Atlas' })).toHaveCount(
    0,
  )
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /^Скачанное/ })
    .click()
  await expect(page.getByRole('heading', { name: 'Пока ничего не скачано' })).toBeVisible()
})
