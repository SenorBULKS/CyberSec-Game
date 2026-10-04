// Inlines the built JS and CSS into index.html so the whole game is one file.
// Used for shareable preview builds; the normal build stays multi-file.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'dist-single';
const htmlPath = join(outDir, 'index.html');
let html = readFileSync(htmlPath, 'utf8');

html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const js = readFileSync(join(outDir, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  const css = readFileSync(join(outDir, href), 'utf8');
  return `<style>${css}</style>`;
});

if (/src="\.\/assets|href="\.\/assets/.test(html)) {
  throw new Error('inline-build: some assets were not inlined');
}
writeFileSync(htmlPath, html);
console.log(`inline-build: wrote ${htmlPath} (${(html.length / 1024).toFixed(1)} KB)`);
