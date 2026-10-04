import { expect, test } from '@playwright/test';

test('the game opens on the title screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page).toHaveTitle('CyberSec Game');
  await expect(page.getByRole('heading', { name: 'CyberSec Game' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Practice Run' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('starting a challenge shows the terminal and mission panel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('listitem', { name: 'Practice Run' }).getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('region', { name: 'Terminal' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Mission' })).toBeVisible();
});

test('layout stacks on a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto('/#practice');
  const terminal = await page.getByRole('region', { name: 'Terminal' }).boundingBox();
  const mission = await page.getByRole('complementary', { name: 'Mission' }).boundingBox();
  expect(terminal && mission).toBeTruthy();
  expect(mission!.y).toBeGreaterThanOrEqual(terminal!.y + terminal!.height - 1);
});

test('the title screen fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});
