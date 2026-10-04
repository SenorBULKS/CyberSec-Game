import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.goto('http://localhost:4173/#first-day');
await p.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent?.includes('newhire@harborline'));
async function t(s){ await p.keyboard.type(s); await p.waitForTimeout(40); }
await t('su mwalker'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
await t('wrongpass'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
// immediately type during the 2s delay
await t('whoami'); await p.keyboard.press('Enter');
await p.waitForTimeout(2600); // let the delay finish and buffered cmd run
const lines = (await p.locator('.xterm-rows').allTextContents()).join('\n').replace(/ /g,' ').split('\n').filter(l=>l.trim());
console.log(lines.slice(-6).join('\n'));
await b.close();
