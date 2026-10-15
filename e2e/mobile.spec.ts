import { test, expect } from '@playwright/test'

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
  await expect(page.locator('.track-info strong')).toHaveText('Velvet Sky')
})
