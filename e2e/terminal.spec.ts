import { expect, test, type Page } from '@playwright/test';

const screenText = (page: Page) => page.locator('.xterm-rows');

async function run(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#sandbox');
  await expect(screenText(page)).toContainText('newhire@harborline:~$');
});

test('the terminal has focus on load and runs typed commands', async ({ page }) => {
  await run(page, 'echo Hello, Harborline');
  await expect(screenText(page)).toContainText('Hello, Harborline');
});

test('unknown commands say "command not found"', async ({ page }) => {
  await run(page, 'sudo su');
  await expect(screenText(page)).toContainText('sudo: command not found');
});

test('help lists the available commands', async ({ page }) => {
  await run(page, 'help');
  await expect(screenText(page)).toContainText('Print text back to the screen');
});

test('Up arrow recalls the previous command', async ({ page }) => {
  await run(page, 'echo first-run');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(screenText(page).getByText('first-run', { exact: true })).toHaveCount(2);
});

test('Ctrl+C cancels the line', async ({ page }) => {
  await page.keyboard.type('echo never');
  await page.keyboard.press('Control+C');
  await expect(screenText(page)).toContainText('echo never^C');
  await expect(screenText(page)).not.toContainText(/^never$/m);
});

test('clear empties the screen', async ({ page }) => {
  await run(page, 'echo old-output');
  await run(page, 'clear');
  await expect(screenText(page)).not.toContainText('old-output');
  await expect(screenText(page)).not.toContainText('Welcome');
});

test('clicking the terminal gives it focus back', async ({ page }) => {
  await page.getByRole('complementary', { name: 'Mission' }).click();
  await page.getByTestId('terminal').click();
  await run(page, 'echo refocused');
  await expect(screenText(page)).toContainText('refocused');
});
