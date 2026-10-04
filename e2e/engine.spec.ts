import { expect, test, type Page } from '@playwright/test';

const screenText = (page: Page) => page.locator('.xterm-rows');
const objective = (page: Page, name: string) =>
  page.getByRole('complementary', { name: 'Mission' }).getByRole('listitem').filter({ hasText: name });

async function run(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

test('play the practice challenge from start to finish', async ({ page }) => {
  await page.goto('/#practice');
  await expect(screenText(page)).toContainText('newhire@harborline:~$');
  await expect(page.getByRole('heading', { name: 'Practice Run' })).toBeVisible();
  await expect(objective(page, 'List the files')).toHaveClass(/current/);

  await run(page, 'hint');
  await expect(screenText(page)).toContainText('Hint 1 of 3: Which command lists files?');

  await run(page, 'ls');
  await expect(objective(page, 'List the files')).toHaveClass(/done/);
  await expect(objective(page, 'Read the note')).toHaveClass(/current/);

  await run(page, 'cat note.txt');
  await expect(objective(page, 'Read the note')).toHaveClass(/done/);

  await run(page, 'submit WRONG-1');
  await expect(screenText(page)).toContainText('That is not the right code');
  await expect(page.getByText('Challenge complete.', { exact: true })).toHaveCount(0);

  await run(page, 'submit PRACTICE-42');
  await expect(screenText(page)).toContainText('Correct! Challenge complete.');
  await expect(objective(page, 'Submit the code')).toHaveClass(/done/);
  await expect(page.getByText('Challenge complete.', { exact: true })).toBeVisible();
});

test('an unknown #anchor opens the title screen', async ({ page }) => {
  await page.goto('/#does-not-exist');
  await expect(page.getByRole('heading', { name: 'CyberSec Game' })).toBeVisible();
});
