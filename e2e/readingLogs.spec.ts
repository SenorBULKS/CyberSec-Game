import { expect, test, type Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Mission' });
const feed = (page: Page) => panel(page).getByRole('log');
const screenText = (page: Page) => page.locator('.xterm-rows');

async function run(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

async function promptFor(page: Page, user: string) {
  await expect(
    screenText(page).locator('div').filter({ hasText: new RegExp(`^${user}@harborline:`) }).last(),
  ).toBeVisible();
}

test('a player works through Reading the Logs to find the break-in', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/#reading-logs');
  await expect(screenText(page)).toContainText('Harborline Logistics. Authorised staff only.');
  await promptFor(page, 'newhire');

  const steps: [string, string][] = [
    ['cat task.txt', 'did anyone get in overnight'],
    ['ls /var/log', 'There is auth.log'],
    ['wc -l /var/log/auth.log', 'Reading it all is hopeless'],
    ['tail /var/log/auth.log', 'The morning logins look normal'],
    ['grep "Failed password" /var/log/auth.log', 'brute-force'],
    ['grep "Failed password" /var/log/auth.log | wc -l', 'This was automated'],
    ['grep Accepted /var/log/auth.log', 'credential stuffing'],
  ];
  for (const [line, mentorSays] of steps) {
    await run(page, line);
    if (mentorSays) await expect(feed(page)).toContainText(mentorSays);
    await promptFor(page, 'newhire');
  }
  await expect(screenText(page)).toContainText('Accepted password for mwalker from 198.51.100.66');

  await run(page, 'submit 198.51.100.66');
  await expect(feed(page)).toContainText('Challenge complete.');

  await panel(page).getByRole('button', { name: /debrief/i }).click();
  await expect(page.getByRole('heading', { name: 'Logs are searched, not read' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('an experienced player greps straight for the successful login', async ({ page }) => {
  await page.goto('/#reading-logs');
  await panel(page).getByRole('radio', { name: 'I know Linux' }).click();
  await promptFor(page, 'newhire');

  await run(page, 'grep Accepted /var/log/auth.log | grep 198.51.100.66');
  await expect(screenText(page)).toContainText('Accepted password for mwalker from 198.51.100.66');
  await run(page, 'submit 198.51.100.66');
  await expect(feed(page)).toContainText('Challenge complete.');
});
