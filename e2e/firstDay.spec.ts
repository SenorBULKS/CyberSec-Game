import { expect, test, type Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Mission' });
const feed = (page: Page) => panel(page).getByRole('log');
const screenText = (page: Page) => page.locator('.xterm-rows');

async function run(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

/** Waits for a fresh prompt for this user, so the next line is not typed into a running command. */
async function promptFor(page: Page, user: string) {
  await expect(screenText(page).locator('div').filter({ hasText: new RegExp(`^${user}@harborline:`) }).last()).toBeVisible();
}

async function suToMarcus(page: Page) {
  await run(page, 'su mwalker');
  await expect(screenText(page)).toContainText('Password:');
  await run(page, 'Tidewater#22');
  await promptFor(page, 'mwalker');
}

test('a beginner plays First Day on the Box from the title screen to the debrief', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  const card = page.getByRole('listitem', { name: 'First Day on the Box' });
  await expect(card).toContainText('Beginner');
  await card.getByRole('button', { name: 'Start' }).click();
  await expect(screenText(page)).toContainText('Harborline Logistics. Authorised staff only.');
  await expect(feed(page)).toContainText("Hi, I'm Sam.");

  const steps: [string, string][] = [
    ['whoami', 'You are newhire.'],
    ['pwd', 'You are in /home/newhire'],
    ['ls', 'One file: welcome.txt.'],
    ['cat welcome.txt', "So that's the job."],
    ['cd /home', ''],
    ['ls', 'Three users'],
    ['cd mwalker', ''],
    ['ls', ''],
    ['cd private', 'Permission denied. The server checked who you are'],
    ['ls -a', 'Look at .bash_history.'],
    ['cat .bash_history', 'Marcus copied the backups to another server'],
  ];
  for (const [line, mentorSays] of steps) {
    await run(page, line);
    if (mentorSays) await expect(feed(page)).toContainText(mentorSays);
    await promptFor(page, 'newhire');
  }
  await expect(screenText(page)).toContainText('sshpass -p Tidewater#22');

  await suToMarcus(page);
  await expect(feed(page)).toContainText("You're in.");
  await run(page, 'cat private/handover.txt');
  await expect(screenText(page)).toContainText('Handover code: HARBOR-7741');
  await run(page, 'submit HARBOR-7741');
  await expect(feed(page)).toContainText('Challenge complete.');

  await panel(page).getByRole('button', { name: /debrief/i }).click();
  await expect(page.getByRole('heading', { name: 'Hidden is not secret' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'One leaked password opened everything' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to the challenges' }).click();
  await expect(page.getByRole('listitem', { name: 'First Day on the Box' })).toContainText('Completed');
  expect(errors).toEqual([]);
});

test('an experienced player can go straight for the leak', async ({ page }) => {
  await page.goto('/#first-day');
  await panel(page).getByRole('radio', { name: 'I know Linux' }).click();
  await expect(feed(page)).not.toContainText("Hi, I'm Sam.");
  await promptFor(page, 'newhire');

  await run(page, 'ls -la /home/mwalker');
  await expect(screenText(page)).toContainText('.bash_history');
  await run(page, 'grep -i pass /home/mwalker/.bash_history');
  await expect(screenText(page)).toContainText('grep: command not found');
  await run(page, 'cat /home/mwalker/.bash_history');
  await expect(screenText(page)).toContainText('sshpass -p Tidewater#22');
  await suToMarcus(page);
  await run(page, 'cat ~/private/handover.txt');
  await run(page, 'submit harbor-7741');
  await expect(feed(page)).toContainText('Challenge complete.');
  await expect(feed(page)).not.toContainText("You're in.");
});

test('the leaked password stands on its own, so double-clicking it copies just the password', async ({ page }) => {
  await page.goto('/#first-day');
  await promptFor(page, 'newhire');
  await run(page, 'cat /home/mwalker/.bash_history');
  await expect(screenText(page)).toContainText('sshpass -p Tidewater#22');

  // Find where "Tidewater" is drawn on screen and double-click it, as a player copying it would.
  const point = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.querySelector('.xterm-rows')!, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent!.indexOf('Tidewater');
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at + 3);
      range.setEnd(node, at + 4);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }
    return null;
  });
  expect(point).not.toBeNull();
  await page.mouse.dblclick(point!.x, point!.y);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Tidewater#22');
});
