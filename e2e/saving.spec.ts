import { expect, test, type Page } from '@playwright/test';

const screenText = (page: Page) => page.locator('.xterm-rows');
const practice = (page: Page) => page.getByRole('listitem', { name: 'Practice Run' });
const objectives = (page: Page) =>
  page.getByRole('complementary', { name: 'Mission' }).getByRole('listitem');

async function run(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

test('quit mid-challenge and resume where you left off', async ({ page }) => {
  await page.goto('/');
  await practice(page).getByRole('button', { name: 'Start' }).click();
  await expect(screenText(page)).toContainText('newhire@harborline:~$');
  await run(page, 'ls');
  await expect(objectives(page).first()).toHaveClass(/done/);

  // Close and come back: a reload is the same as quitting and reopening.
  await page.reload();
  await expect(practice(page)).toContainText('In progress');
  await practice(page).getByRole('button', { name: 'Continue' }).click();
  await expect(screenText(page)).toContainText('note.txt');
  await expect(objectives(page).nth(1)).toHaveClass(/current/);

  // The Up arrow still remembers the earlier command.
  await page.keyboard.press('ArrowUp');
  await expect(screenText(page)).toContainText(/\$ ls\s*$/);
  await page.keyboard.press('Escape');
});

test('finish the challenge and read the debrief', async ({ page }) => {
  await page.goto('/#practice');
  await expect(screenText(page)).toContainText('newhire@harborline:~$');
  await run(page, 'cat note.txt');
  await run(page, 'submit PRACTICE-42');
  await page.getByRole('button', { name: 'Read the debrief' }).click();
  await expect(page.getByRole('heading', { name: 'Practice Run: complete' })).toBeVisible();
  await expect(page.getByText('Commands typed')).toBeVisible();

  await page.getByRole('button', { name: 'Back to the challenges' }).click();
  await expect(practice(page)).toContainText('Completed');
  await page.reload();
  await expect(practice(page)).toContainText('Completed');
});

test('restart from scratch', async ({ page }) => {
  await page.goto('/#practice');
  await expect(screenText(page)).toContainText('newhire@harborline:~$');
  await run(page, 'ls');
  await page.getByRole('button', { name: 'Restart' }).click();
  await page.getByRole('group', { name: /Restart and lose/ }).getByRole('button', { name: 'Restart' }).click();
  await expect(objectives(page).first()).toHaveClass(/current/);
  await expect(screenText(page)).not.toContainText('note.txt');

  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(practice(page)).toContainText('Not started');
});
