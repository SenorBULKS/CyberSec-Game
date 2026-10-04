import { expect, test, type Page } from '@playwright/test';

const screenText = (page: Page) => page.locator('.xterm-rows');

/** The terminal's visible rows as plain lines. */
const lines = async (page: Page) =>
  (await page.locator('.xterm-rows > div').allTextContents()).map((l) => l.replace(/\u00a0/g, ' ').trimEnd());

async function run(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#sandbox');
  await expect(screenText(page)).toContainText('newhire@harborline:~$');
});

test('walk the file system with pwd, ls, cd and cat', async ({ page }) => {
  await run(page, 'pwd');
  await expect(screenText(page)).toContainText('/home/newhire');

  await run(page, 'ls');
  await expect(screenText(page)).toContainText('projects  welcome.txt');

  await run(page, 'cat welcome.txt');
  await expect(screenText(page)).toContainText('This is your home directory.');

  await run(page, 'cd projects');
  await expect(screenText(page)).toContainText('newhire@harborline:~/projects$');

  await run(page, 'cd /etc');
  await expect(screenText(page)).toContainText('newhire@harborline:/etc$');
  await run(page, 'cat hostname');
  await expect.poll(() => lines(page)).toContain('harborline');

  await run(page, 'cd');
  await run(page, 'pwd');
  await expect.poll(async () => (await lines(page)).filter((l) => l === '/home/newhire').length).toBe(2);
});

test('mistakes get the same errors as on a real server', async ({ page }) => {
  await run(page, 'cd nowhere');
  await expect(screenText(page)).toContainText('bash: cd: nowhere: No such file or directory');
  await run(page, 'cat projects');
  await expect(screenText(page)).toContainText('cat: projects: Is a directory');
  await run(page, 'ls /nope');
  await expect(screenText(page)).toContainText("ls: cannot access '/nope': No such file or directory");
});
