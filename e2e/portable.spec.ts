import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('portable HTML starts with no external files and plays embedded music in a preview', async ({
  page,
  context,
}) => {
  const errors: string[] = []
  const requests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (!request.url().startsWith('data:')) requests.push(request.url().slice(0, 100))
  })
  // A sandboxed preview deliberately has no origin, server, or accessible local storage.
  await page.setContent(
    '<iframe id="preview" sandbox="allow-scripts" style="width:100%;height:900px;border:0"></iframe>',
  )
  const html = await readFile('exports/Volna.html', 'utf8')
  await page.locator('#preview').evaluate((frame: HTMLIFrameElement, source) => {
    frame.srcdoc = source
  }, html)
  const app = page.frameLocator('#preview')
  await expect(
    app.getByRole('heading', { name: 'Хороший день начинается с музыки.' }),
  ).toBeVisible()
  expect(requests).toEqual([])
  await context.setOffline(true)
  await app.getByRole('button', { name: 'Слушать мою волну', exact: true }).click()
  await expect(app.locator('.wave-status')).toContainText('Нет интернета')
  await expect
    .poll(() => app.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.1)
  await app.getByRole('textbox', { name: 'Поиск музыки' }).fill('Neon')
  await app.getByRole('tab', { name: 'В библиотеке' }).click()
  await expect(app.locator('.track-row')).toHaveCount(1)
  await app.getByRole('button', { name: 'Создать плейлист', exact: true }).click()
  await app.getByRole('textbox', { name: 'Название', exact: true }).fill('Автономный плейлист')
  await app
    .getByRole('dialog')
    .getByRole('button', { name: 'Создать плейлист', exact: true })
    .click()
  await expect(app.getByRole('heading', { name: 'Автономный плейлист', exact: true })).toBeVisible()
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

test('portable YouTube search opens the requested query without a server or key', async ({
  page,
  context,
}) => {
  await context.route('https://www.youtube.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>YouTube search fixture</p>' }),
  )
  await page.setContent(await readFile('exports/Volna.html', 'utf8'))
  await page.locator('.primary-nav').getByRole('button', { name: 'YouTube', exact: true }).click()
  await page.getByRole('textbox', { name: 'Поиск на YouTube или ссылка' }).fill('джаз пианино')
  const opened = context.waitForEvent('page')
  await page.getByRole('button', { name: 'Открыть YouTube', exact: true }).click()
  const youtube = await opened
  await expect(youtube).toHaveURL(
    `https://www.youtube.com/results?search_query=${encodeURIComponent('джаз пианино')}`,
  )
})
