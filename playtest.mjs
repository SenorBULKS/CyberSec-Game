import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.goto('http://localhost:4173/#practice');
await p.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent?.includes('newhire@harborline'));
async function run(line){ await p.keyboard.type(line); await p.keyboard.press('Enter'); await p.waitForTimeout(120); }
await run('ls'); await run('cat note.txt'); await run('submit PRACTICE-42');
await p.waitForTimeout(200);
// Go to menu
await p.getByRole('button', { name: /debrief|Menu|challenges/i }).first().click().catch(()=>{});
await p.waitForTimeout(300);
// Read completed badge + buttons on the Practice card
const card = p.getByRole('listitem', { name: 'Practice Run' });
const status = await card.locator('.challenge-status').first().textContent().catch(()=> '(no card yet)');
const buttons = await card.getByRole('button').allTextContents().catch(()=>[]);
console.log('STATUS:', status, '| BUTTONS:', JSON.stringify(buttons));
await b.close();
