// Builds the two self-hosted font files from the full Saira variable font.
//
//   assets/fonts/saira-text.woff2     weight 400–700, normal width  (body, UI)
//   assets/fonts/saira-display.woff2  weight 800, width 112.5       (name, headings)
//
// Both are subset to basic Latin plus the typographic punctuation the page uses,
// which keeps them at ~20 KB and ~11 KB instead of ~99 KB for the full file.
//
// Usage:  node tools/subset-fonts.mjs
// Source: .work/fonts-src/saira-latin-var.woff2 (Google Fonts, SIL OFL 1.1)

import subsetFont from 'subset-font';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, '.work', 'fonts-src', 'saira-latin-var.woff2'));

let chars = '';
for (let c = 0x20; c <= 0x7e; c++) chars += String.fromCharCode(c);
chars += ' ‘’“”–—…©é×';

const outputs = [
  { file: 'saira-text.woff2', axes: { wght: { min: 400, max: 700 }, wdth: 100 } },
  { file: 'saira-display.woff2', axes: { wght: 800, wdth: 112.5 } },
];

for (const { file, axes } of outputs) {
  const font = await subsetFont(source, chars, { targetFormat: 'woff2', variationAxes: axes });
  writeFileSync(join(root, 'assets', 'fonts', file), font);
  console.log(`${file}: ${(font.length / 1024).toFixed(1)} KB`);
}
