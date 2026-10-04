import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.goto('http://localhost:4173/#sandbox');
await p.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent?.includes('newhire@harborline:~$'));
async function run(line){ await p.keyboard.type(line); await p.keyboard.press('Enter'); await p.waitForTimeout(150); }
await run('cat welcome.txt | cat');
await run('echo secret-code-99 > mynote.txt');
await run('cat mynote.txt');
await run('echo more >> mynote.txt');
await run('cat mynote.txt');
await run('echo nope > /etc/passwd');
const text = (await p.locator('.xterm-rows').allTextContents()).join('\n').replace(/ /g,' ');
console.log(text.split('\n').filter(l=>l.trim()).join('\n'));
await b.close();
