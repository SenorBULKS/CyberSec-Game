import { expect, test } from '@playwright/test';

test('game window opens with terminal and mission panel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page).toHaveTitle('CyberSec Game');
  await expect(page.getByRole('region', { name: 'Terminal' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Mission' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('layout stacks on a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto('/');
  const terminal = await page.getByRole('region', { name: 'Terminal' }).boundingBox();
  const mission = await page.getByRole('complementary', { name: 'Mission' }).boundingBox();
  expect(terminal && mission).toBeTruthy();
  expect(mission!.y).toBeGreaterThanOrEqual(terminal!.y + terminal!.height - 1);
});
