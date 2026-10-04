import { expect, test, type Page } from '@playwright/test';

const screenText = (page: Page) => page.locator('.xterm-rows');
const lines = async (page: Page) =>
  (await page.locator('.xterm-rows > div').allTextContents()).map((l) => l.replace(/\u00a0/g, ' ').trimEnd());

const lastLine = async (page: Page) => (await lines(page)).filter((l) => l !== '').at(-1);

async function run(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(screenText(page)).toContainText('newhire@harborline:~$');
});

test('ls -la reveals hidden files with owners and permissions', async ({ page }) => {
  await run(page, 'ls -la');
  await expect.poll(() => lines(page)).toContain('-rw-r--r-- 1 newhire newhire   55 Sep 28 09:14 .bashrc');
});

test("another user's private folder is off limits", async ({ page }) => {
  await run(page, 'cd /home/mwalker/private');
  await expect(screenText(page)).toContainText('bash: cd: /home/mwalker/private: Permission denied');
  await run(page, 'cat /home/mwalker/private/notes.txt');
  await expect(screenText(page)).toContainText('cat: /home/mwalker/private/notes.txt: Permission denied');
});

test('whoami and id say who you are', async ({ page }) => {
  await run(page, 'whoami');
  await expect.poll(() => lines(page)).toContain('newhire');
  await run(page, 'id');
  await expect(screenText(page)).toContainText('uid=1001(newhire) gid=1001(newhire) groups=1001(newhire)');
});

test('Tab completes commands and paths; a second Tab lists the choices', async ({ page }) => {
  await page.keyboard.type('ca');
  await page.keyboard.press('Tab');
  await page.keyboard.type('wel');
  await page.keyboard.press('Tab');
  await expect.poll(() => lastLine(page)).toBe('newhire@harborline:~$ cat welcome.txt');
  await page.keyboard.press('Enter');
  await expect(screenText(page)).toContainText('Welcome aboard!');

  await page.keyboard.type('ls /home/');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect.poll(() => lines(page)).toContain('mwalker/  newhire/');
  await expect.poll(() => lastLine(page)).toBe('newhire@harborline:~$ ls /home/');
});
