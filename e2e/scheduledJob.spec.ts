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

test('a player traces the persistence to a writable root script and shuts it down', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/#scheduled-job');
  await expect(screenText(page)).toContainText('Harborline Logistics. Authorised staff only.');
  await promptFor(page, 'newhire');

  const steps: [string, string][] = [
    ['cat task.txt', 'on a timer'],
    ['ls /etc/cron.d', 'The name is camouflage'],
    ['cat /etc/cron.d/apt-compat', 'every five minutes'],
    ['cat /usr/local/sbin/apt-compat', 'persistence'],
    ['cat /usr/local/bin/backup.sh', 'world-writable'],
  ];
  for (const [line, mentorSays] of steps) {
    await run(page, line);
    if (mentorSays) await expect(feed(page)).toContainText(mentorSays);
    await promptFor(page, 'newhire');
  }

  // Reporting the key is correct but does not finish the challenge on its own.
  await run(page, 'submit harbor-ops@fleet');
  await expect(screenText(page)).toContainText('you are not done yet');
  await expect(page.getByText('Challenge complete.', { exact: true })).toHaveCount(0);

  // The job still has to be removed; /etc/cron.d is root-only, so sudo is required.
  await run(page, 'sudo rm /etc/cron.d/apt-compat');
  await expect(screenText(page)).toContainText('[sudo] password for newhire:');
  await run(page, 'harbor2026');
  await expect(feed(page)).toContainText('Challenge complete.');

  await panel(page).getByRole('button', { name: /debrief/i }).click();
  await expect(page.getByRole('heading', { name: 'Persistence: not having to break in twice' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('reporting the key without removing the job does not complete the challenge', async ({ page }) => {
  await page.goto('/#scheduled-job');
  await panel(page).getByRole('radio', { name: 'I know Linux' }).click();
  await promptFor(page, 'newhire');

  await run(page, 'cat /usr/local/sbin/apt-compat');
  await expect(screenText(page)).toContainText('harbor-ops@fleet');
  await run(page, 'submit harbor-ops@fleet');
  // Correct code, but the job is still live: no completion yet.
  await expect(page.getByText('Challenge complete.', { exact: true })).toHaveCount(0);

  await run(page, 'sudo rm /etc/cron.d/apt-compat');
  await expect(screenText(page)).toContainText('[sudo] password for newhire:');
  await run(page, 'harbor2026');
  await expect(feed(page)).toContainText('Challenge complete.');
});
