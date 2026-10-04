import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.goto('http://localhost:4173/#first-day');
await p.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent?.includes('newhire@harborline'));
async function run(line){ await p.keyboard.type(line); await p.keyboard.press('Enter'); await p.waitForTimeout(120); }
await run('su mwalker'); await run('Tidewater#22');
await run('grep -n password /home/mwalker/.bash_history');
await run('cat /home/mwalker/.bash_history | grep sshpass | wc -l');
await run('head -n 3 /home/mwalker/.bash_history');
const text = (await p.locator('.xterm-rows').allTextContents()).join('\n').replace(/ /g,' ');
console.log(text.split('\n').filter(l=>l.trim()).slice(-14).join('\n'));
await b.close();
