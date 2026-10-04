import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.goto('http://localhost:4173/#first-day');
await p.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent?.includes('newhire@harborline'));
// switch to expert
await p.getByRole('radio', { name: 'I know Linux' }).click();
await p.waitForTimeout(150);
const objs = await p.locator('.objectives li').allTextContents();
console.log('EXPERT OBJECTIVES ('+objs.length+'):', JSON.stringify(objs.map(o=>o.trim())));
await b.close();
