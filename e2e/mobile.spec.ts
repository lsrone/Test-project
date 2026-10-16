import { test, expect } from '@playwright/test'
import { mockYouTubePlayback } from './youtube-fixture'

// Keep provider fixtures outside the production service worker's fetch handler.
test.use({ serviceWorkers: 'block' })

test('mobile global search shows YouTube results as a list without overflow', async ({ page }) => {
  await page.route('**/api/youtube/status', (route) =>
    route.fulfill({ json: { configured: true } }),
  )
  await page.route('**/api/youtube/search?**', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'jfKfPfyJRdk',
            title: 'Очень длинное название музыкальной записи для проверки списка на узком экране',
            channel: 'Очень длинное название музыкального канала',
          },
          { id: '4xDzrJKXOOY', title: 'Ещё одна запись', channel: 'Другой канал' },
        ],
      },
    }),
  )
  await mockYouTubePlayback(page)
  await page.goto('/')
  await page.locator('.mobile-nav').getByRole('button', { name: 'Поиск', exact: true }).click()
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('Музыка')
  const list = page.getByRole('list', { name: 'Результаты поиска YouTube' })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Слушать Ещё одна запись', exact: true }).click()
  await expect(page.locator('iframe,video')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await expect(page.locator('.player-track-info strong')).toHaveText('Ещё одна запись')
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true)
})

test('mobile collection imports a CSV library without horizontal overflow', async ({ page }) => {
  await page.goto('/')
  await page.locator('.mobile-nav').getByRole('button', { name: 'Коллекция' }).click()
  await page
    .locator('.collection-controls')
    .getByRole('button', { name: 'Перенести библиотеку', exact: true })
    .click()
  await page.getByLabel('Файл экспорта Яндекс Музыки').setInputFiles({
    name: 'Моя музыка.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Название;Исполнитель\nНочной рейс;Группа\nЛетний свет;Другой артист'),
  })
  await page.getByRole('button', { name: 'Перенести 2 треков', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Библиотека уже здесь' })).toBeVisible()
  await page.getByRole('button', { name: 'Открыть перенесённую коллекцию' }).click()
  await expect(page.locator('.track-row')).toHaveCount(2)
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true)
})

test('mobile app fits the screen, plays music and navigates the collection', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.mobile-nav')).toBeVisible()
  const width = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }))
  expect(width.body).toBeLessThanOrEqual(width.viewport)
  await page.getByRole('button', { name: 'Слушать мою волну', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Любимый текущий трек', exact: true }).click()
  await page.locator('.mobile-nav').getByRole('button', { name: 'Коллекция' }).click()
  await expect(page.locator('.track-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Открыть экран воспроизведения' }).click()
  await expect(page.getByRole('dialog', { name: 'Сейчас играет' })).toBeVisible()
  await page.getByRole('button', { name: 'Пауза в полном экране' }).click()
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await page.getByRole('button', { name: 'Свернуть плеер' }).click()
  await page.locator('.mobile-nav').getByRole('button', { name: 'Поиск', exact: true }).click()
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('Luna')
  await page.getByRole('tab', { name: 'В библиотеке' }).click()
  await expect(page.locator('.track-info strong')).toHaveText('Velvet Sky')
})
