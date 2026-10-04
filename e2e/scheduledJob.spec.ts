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

test('a player tracks down and removes the attacker’s scheduled job', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/#scheduled-job');
  await expect(screenText(page)).toContainText('Harborline Logistics. Authorised staff only.');
  await promptFor(page, 'newhire');

  const steps: [string, string][] = [
    ['cat task.txt', 'on a timer'],
    ['ls /etc/cron.d', 'ships as a cron.d file'],
    ['cat /etc/cron.d/apt-compat', 'every five minutes'],
    ['cat /usr/local/sbin/apt-compat', 'persistence'],
    ['ls -ld /etc/cron.d', 'world-writable'],
    // The directory is world-writable, so a plain rm is enough to pull the job.
    ['rm /etc/cron.d/apt-compat', 'Cron has nothing to run'],
  ];
  for (const [line, mentorSays] of steps) {
    await run(page, line);
    if (mentorSays) await expect(feed(page)).toContainText(mentorSays);
    await promptFor(page, 'newhire');
  }

  await run(page, 'submit harbor-ops@fleet');
  await expect(feed(page)).toContainText('Challenge complete.');

  await panel(page).getByRole('button', { name: /debrief/i }).click();
  await expect(page.getByRole('heading', { name: 'Persistence: not having to break in twice' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('an experienced player reads the script and reports the key straight away', async ({ page }) => {
  await page.goto('/#scheduled-job');
  await panel(page).getByRole('radio', { name: 'I know Linux' }).click();
  await promptFor(page, 'newhire');

  await run(page, 'cat /usr/local/sbin/apt-compat');
  await expect(screenText(page)).toContainText('harbor-ops@fleet');
  await run(page, 'submit harbor-ops@fleet');
  await expect(feed(page)).toContainText('Challenge complete.');
});
