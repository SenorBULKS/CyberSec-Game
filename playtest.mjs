import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.goto('http://localhost:4173/#sandbox');
await p.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent?.includes('newhire@harborline'));
async function run(l){ await p.keyboard.type(l); await p.keyboard.press('Enter'); await p.waitForTimeout(120); }
await run('ps'); await run('ps aux | grep sshd'); await run('ss -tlnp');
const txt=(await p.locator('.xterm-rows').allTextContents()).join('\n').replace(/ /g,' ').split('\n').filter(l=>l.trim());
console.log(txt.slice(-12).join('\n'));
await b.close();
