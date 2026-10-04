// Turns the single-file build into the page body the Claude preview link expects
// (the host adds its own doctype, html, head and body around it).
import { readFileSync, writeFileSync } from 'node:fs';

const [input = 'dist-single/index.html', output = 'dist-single/artifact.html'] = process.argv.slice(2);
const html = readFileSync(input, 'utf8');
const title = html.match(/<title>.*?<\/title>/)?.[0] ?? '';
const head = html
  .slice(html.indexOf('<head>') + 6, html.indexOf('</head>'))
  .replace(/<meta[^>]*>/g, '')
  .replace(/<title>.*?<\/title>/, '');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
writeFileSync(output, `${title}\n${head.trim()}\n${body.trim()}\n`);
console.log(`artifact-preview: wrote ${output}`);
