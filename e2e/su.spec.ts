import { expect, test, type Page } from '@playwright/test';

const screenText = (page: Page) => page.locator('.xterm-rows');
const lines = async (page: Page) =>
  (await page.locator('.xterm-rows > div').allTextContents()).map((l) => l.replace(/ /g, ' ').trimEnd());

async function run(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(screenText(page)).toContainText('newhire@harborline:~$');
});

test('su with the right password becomes the other user; exit comes back', async ({ page }) => {
  await run(page, 'su mwalker');
  await expect(screenText(page)).toContainText('Password:');
  await page.keyboard.type('letmein');
  await expect(screenText(page)).not.toContainText('letmein');
  await page.keyboard.press('Enter');
  await expect(screenText(page)).toContainText('mwalker@harborline:/home/newhire$');

  await run(page, 'cat /home/mwalker/private/notes.txt');
  await expect(screenText(page)).toContainText('Only Marcus can read this.');

  await run(page, 'exit');
  await run(page, 'whoami');
  await expect.poll(async () => (await lines(page)).filter((l) => l === 'newhire').length).toBe(1);
});

test('a wrong password pauses, then fails', async ({ page }) => {
  await run(page, 'su mwalker');
  await expect(screenText(page)).toContainText('Password:');
  const started = Date.now();
  await run(page, 'wrong');
  await expect(screenText(page)).toContainText('su: Authentication failure');
  expect(Date.now() - started).toBeGreaterThanOrEqual(1500);
  await expect(screenText(page)).not.toContainText('wrong');
});
