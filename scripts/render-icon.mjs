// Renders public/icon.svg to a 1024px PNG for `tauri icon`, which makes every
// size the installers need. Run: node scripts/render-icon.mjs && npx tauri icon src-tauri/app-icon.png
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', '<svg width="1024" height="1024" ')}`);
await page.screenshot({ path: 'src-tauri/app-icon.png', omitBackground: true });
await browser.close();
