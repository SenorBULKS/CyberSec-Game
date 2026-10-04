import { expect, test, type Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Mission' });
const feed = (page: Page) => panel(page).getByRole('log');
const screenText = (page: Page) => page.locator('.xterm-rows');

async function run(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

test('the mentor teaches each step as it comes up', async ({ page }) => {
  await page.goto('/#practice');
  await expect(screenText(page)).toContainText('newhire@harborline:~$');
  await expect(feed(page)).toContainText('Welcome! The black window on the left is a terminal');
  await expect(feed(page)).not.toContainText('prints what is inside a file');

  await run(page, 'ls');
  await expect(feed(page)).toContainText('There is a file called note.txt here.');
  await expect(feed(page)).toContainText('prints what is inside a file');
});

test('the hint button gives one more hint each time and matches the hint command', async ({ page }) => {
  await page.goto('/#practice');
  const button = panel(page).getByRole('button', { name: /hint/i });
  await expect(button).toHaveText('Get a hint (1 of 3)');
  await button.click();
  await expect(feed(page)).toContainText('Which command lists files?');
  await expect(button).toHaveText('Get a hint (2 of 3)');

  await run(page, 'hint');
  await expect(screenText(page)).toContainText('Hint 2 of 3: Type ls and press Enter.');
  await expect(button).toHaveText('Get a hint (3 of 3)');
  await button.click();
  await expect(button).toHaveText('No more hints for this step');
  await expect(button).toBeDisabled();
});

test('typing after clicking the panel still reaches the terminal', async ({ page }) => {
  await page.goto('/#practice');
  await expect(screenText(page)).toContainText('newhire@harborline:~$');
  await panel(page).getByRole('button', { name: /hint/i }).click();
  await run(page, 'ls');
  await expect(screenText(page)).toContainText('note.txt');
  await panel(page).getByRole('heading', { name: 'Practice Run' }).click();
  await run(page, 'cat note.txt');
  await expect(screenText(page)).toContainText('The practice code is PRACTICE-42.');
});

test('glossary words open a plain-language definition', async ({ page }) => {
  await page.goto('/#practice');
  const word = feed(page).getByRole('button', { name: 'terminal', exact: true });
  await word.click();
  await expect(word).toHaveAttribute('aria-expanded', 'true');
  await expect(feed(page).getByRole('note')).toContainText('A text window for controlling a computer');
  await word.click();
  await expect(feed(page).getByRole('note')).toHaveCount(0);
});

test('"I know Linux" mode hides the lessons but keeps hints and the result', async ({ page }) => {
  await page.goto('/#practice');
  await panel(page).getByRole('radio', { name: 'I know Linux' }).click();
  await expect(panel(page).getByRole('radio', { name: 'I know Linux' })).toHaveAttribute('aria-checked', 'true');
  await expect(feed(page)).not.toContainText('Welcome!');

  await run(page, 'hint');
  await expect(feed(page)).toContainText('Which command lists files?');
  await run(page, 'cat note.txt');
  await expect(feed(page)).not.toContainText('Found it.');
  await panel(page).getByRole('radio', { name: 'Guided' }).click();
  await expect(feed(page)).toContainText('Found it.');
  await panel(page).getByRole('radio', { name: 'I know Linux' }).click();

  await run(page, 'submit PRACTICE-42');
  await expect(feed(page)).toContainText('Challenge complete.');
  await expect(panel(page).getByRole('button', { name: /hint/i })).toHaveCount(0);
});

test('finishing an objective clears the earlier messages', async ({ page }) => {
  await page.goto('/#practice');
  await panel(page).getByRole('button', { name: /hint/i }).click();
  await expect(feed(page)).toContainText('Welcome!');
  await expect(feed(page)).toContainText('Which command lists files?');
  await run(page, 'ls');
  await expect(feed(page)).toContainText('There is a file called note.txt here.');
  await expect(feed(page)).not.toContainText('Welcome!');
  await expect(feed(page)).not.toContainText('Which command lists files?');
  await expect(feed(page).locator('.msg')).toHaveCount(2);
});
