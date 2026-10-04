import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.goto('http://localhost:4173/#first-day');
await p.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent?.includes('newhire@harborline'));
async function run(line){ await p.keyboard.type(line); await p.keyboard.press('Enter'); await p.waitForTimeout(150); }
await run('cat /home/mwalker/.bash_history');
await p.waitForTimeout(200);
const feed = (await p.locator('.feed .msg').allTextContents()).map(s=>s.replace(/\s+/g,' ').trim().slice(0,70));
console.log('FEED MESSAGES ('+feed.length+'):'); feed.forEach((m,i)=>console.log(`  ${i+1}. ${m}`));
await b.close();
