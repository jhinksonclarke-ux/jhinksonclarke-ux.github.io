// Builds everything the page needs from content/projects.json and the originals in MEDIA/.
//
//   assets/img/work/    card crops and viewer sizes for every project (AVIF + WebP)
//   assets/img/brands/  single-colour client logos (white on transparent)
//   assets/img/brand/   the Shader Jay mark, favicons and app icons
//   index.html          filter chips, helix cards and the ItemList JSON-LD, written
//                       between the <!-- build:* --> markers
//
// Usage:  node tools/build.mjs          (run tools/encode-videos.mjs first for new videos)
// Images are only re-encoded when the source is newer than the output.

import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://jhinksonclarke-ux.github.io/';
const MEDIA = join(root, 'MEDIA');
const POSTERS = join(root, '.work', 'posters');
const OUT = {
  work: join(root, 'assets', 'img', 'work'),
  brands: join(root, 'assets', 'img', 'brands'),
  brand: join(root, 'assets', 'img', 'brand'),
};
Object.values(OUT).forEach((dir) => mkdirSync(dir, { recursive: true }));

const { categories, projects } = JSON.parse(readFileSync(join(root, 'content', 'projects.json'), 'utf8'));

// The spiral runs newest to oldest. A range such as "2024–25" counts by the year
// it finished, and pieces from the same year keep the order they're listed in.
function finishedYear({ slug, year }) {
  const match = String(year).match(/^(\d{4})(?:\s*[–-]\s*(\d{2}|\d{4}))?$/);
  if (!match) throw new Error(`Project ${slug} needs a year like "2025" or "2024–25", not "${year}"`);
  const [, start, end] = match;
  return Number(end ? start.slice(0, 4 - end.length) + end : start);
}
projects.sort((a, b) => finishedYear(b) - finishedYear(a));

const CARD_WIDTHS = [320, 480, 640];
const VIEW_WIDTHS = [800, 1400, 2080];
const AVIF = { quality: 50, effort: 5 };
const WEBP = { quality: 76, effort: 5 };

const isFresh = (out, src) => existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs;
const rel = (file) => file.slice(root.length + 1).replaceAll('\\', '/');
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// Every work image this build writes or keeps; anything else in assets/img/work
// belonged to a removed project and is deleted at the end.
const produced = new Set();

async function encode(src, base, resize) {
  const avif = `${base}.avif`;
  const webp = `${base}.webp`;
  produced.add(avif).add(webp);
  if (!isFresh(avif, src)) await sharp(src).resize(resize).avif(AVIF).toFile(avif);
  if (!isFresh(webp, src)) await sharp(src).resize(resize).webp(WEBP).toFile(webp);
}

// ---------------------------------------------------------------- work images

// `media` lists what the viewer shows, in order: `{ image }` for a still in
// MEDIA/, `{ video }` for an encoded film, each with an optional label and alt.
// `cover` is the still used for the spiral card; without one the card comes from
// the first film's poster frame. With no `media`, the cover is the only still.
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function buildWork(project) {
  const items = project.media ?? [{ image: project.cover }];
  const firstFilm = items.find((item) => item.video);
  const cover = project.cover ? join(MEDIA, project.cover) : join(POSTERS, `${firstFilm?.video}.png`);
  if (!existsSync(cover)) throw new Error(`Missing cover for ${project.slug}: ${cover}`);

  for (const w of CARD_WIDTHS) {
    await encode(cover, join(OUT.work, `${project.slug}-card-${w}`), {
      width: w, height: w, fit: 'cover', position: project.cardPosition || 'centre',
    });
  }

  const stills = items.filter((item) => item.image).length;
  const media = [];
  for (const item of items) {
    if (item.video) {
      const poster = join(POSTERS, `${item.video}.png`);
      if (!existsSync(poster)) throw new Error(`No poster for ${item.video}: run tools/encode-videos.mjs first`);
      const meta = await sharp(poster).metadata();
      const posterOut = join(OUT.work, `${item.video}-poster.webp`);
      produced.add(posterOut);
      if (!isFresh(posterOut, poster)) {
        await sharp(poster).resize({ width: Math.min(meta.width, 1280) }).webp(WEBP).toFile(posterOut);
      }
      media.push({
        type: 'video', label: item.label || 'Film', alt: item.alt || project.alt, slug: item.video,
        src: `assets/video/${item.video}.mp4`, poster: rel(posterOut),
        width: meta.width, height: meta.height,
      });
    } else {
      const still = join(MEDIA, item.image);
      if (!existsSync(still)) throw new Error(`Missing still for ${project.slug}: ${still}`);
      const meta = await sharp(still).metadata();
      const widths = [...new Set([...VIEW_WIDTHS.filter((w) => w < meta.width), Math.min(meta.width, 2080)])];
      const base = stills > 1 && item.label ? `${project.slug}-${slugify(item.label)}` : project.slug;
      for (const w of widths) await encode(still, join(OUT.work, `${base}-${w}`), { width: w });
      const largest = widths.at(-1);
      media.push({
        type: 'image', label: item.label || 'Still', alt: item.alt || project.alt, base, widths,
        width: largest, height: Math.round((meta.height * largest) / meta.width),
      });
    }
  }
  return media;
}

// ---------------------------------------------------------------- logos

// Turns a logo into white-on-transparent. `coverage` decides how opaque each
// source pixel becomes, so black-on-clear, white-on-black and full-colour crests
// all end up as the same kind of single-colour mark.
async function monoLogo(file, out, coverage, height = 160) {
  const { data, info } = await sharp(join(MEDIA, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height: h } = info;
  const px = Buffer.alloc(width * h * 4, 255);
  let minX = width, minY = h, maxX = -1, maxY = -1;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const a = Math.round(255 * coverage(data[i], data[i + 1], data[i + 2], data[i + 3] / 255));
    px[i + 3] = a;
    if (a > 10) {
      const x = p % width, y = (p / width) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const crop = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const buf = await sharp(px, { raw: { width, height: h, channels: 4 } })
    .extract(crop).resize({ height }).png({ palette: true, colours: 64 }).toBuffer();
  writeFileSync(out, buf);
  const meta = await sharp(buf).metadata();
  return { src: rel(out), width: meta.width, height: meta.height };
}

const luminance = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const chroma = (r, g, b) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

async function buildBrandLogos() {
  const logos = [
    { slug: '0207-def-jam', file: 'Worked_with_logo_0207-def-jam.png', coverage: (r, g, b, a) => a * luminance(r, g, b) },
    { slug: 'vfb-stuttgart', file: 'Worked_with_logo_VFB_Stuttgart.png', coverage: (r, g, b, a) => a * clamp01(chroma(r, g, b) * 1.6) },
    { slug: 'universal-music-group', file: 'Worked_with_logo_Universal_Music_Group.png', coverage: (r, g, b, a) => a },
    { slug: 'metamerch', file: 'Worked_with_logo_MetaMerch.png', coverage: (r, g, b, a) => a },
    { slug: 'io-interactive', file: 'Worked_with_logo_io-interactive.png', coverage: (r, g, b, a) => a },
    { slug: 'warner-bros', file: 'Worked_with_logo_Warner Bros.png', coverage: (r, g, b, a) => a },
  ];
  const result = {};
  for (const logo of logos) {
    const out = join(OUT.brands, `${logo.slug}.png`);
    const src = join(MEDIA, logo.file);
    if (isFresh(out, src)) {
      const meta = await sharp(out).metadata();
      result[logo.slug] = { src: rel(out), width: meta.width, height: meta.height };
    } else {
      result[logo.slug] = await monoLogo(logo.file, out, logo.coverage);
    }
  }
  return result;
}

// ---------------------------------------------------------------- Shader Jay mark + icons

async function buildShaderJay() {
  const src = join(MEDIA, 'My_personal_Brand_Shader Jay.png');
  const meta = await sharp(src).metadata();

  // Icons sit on the mark's own navy, sampled from the corner of the artwork.
  const corner = await sharp(src).extract({ left: 20, top: 20, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  const NAVY = { r: corner[0], g: corner[1], b: corner[2] };

  // Find the wordmark's dark frame on a small copy, then crop the full-size original.
  const scan = 1000;
  const { data, info } = await sharp(src).resize({ width: scan }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      if (luminance(data[i], data[i + 1], data[i + 2]) < 0.06) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const k = meta.width / info.width;
  const frame = {
    left: Math.floor(minX * k), top: Math.floor(minY * k),
    width: Math.ceil((maxX - minX + 1) * k), height: Math.ceil((maxY - minY + 1) * k),
  };
  const mark = await sharp(src).extract(frame).png().toBuffer();

  const markWidths = [160, 320, 480];
  for (const w of markWidths) {
    await sharp(mark).resize({ width: w }).avif({ quality: 60 }).toFile(join(OUT.brand, `shader-jay-${w}.avif`));
    await sharp(mark).resize({ width: w }).webp({ quality: 82 }).toFile(join(OUT.brand, `shader-jay-${w}.webp`));
  }
  const markHeight = Math.round((frame.height / frame.width) * 160);

  // Monogram for icons: the "S" of SHADER and the "J" of JAY, cut from the mark itself.
  const inner = await sharp(mark).resize({ width: 1600 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: iw, height: ih } = inner.info;
  const y0 = Math.round(ih * 0.1), y1 = Math.round(ih * 0.9);
  const x0 = Math.round(iw * 0.03), x1 = Math.round(iw * 0.97);
  const lit = [];
  for (let x = x0; x < x1; x++) {
    let on = false;
    for (let y = y0; y < y1 && !on; y++) {
      const i = (y * iw + x) * 3;
      on = luminance(inner.data[i], inner.data[i + 1], inner.data[i + 2]) > 0.55;
    }
    lit.push(on);
  }
  const runs = [];
  lit.forEach((on, i) => {
    const x = i + x0;
    if (on && (!runs.length || runs.at(-1).end !== x - 1)) runs.push({ start: x, end: x });
    else if (on) runs.at(-1).end = x;
  });
  const letters = runs.filter((r) => r.end - r.start > iw * 0.01);
  if (letters.length < 9) throw new Error(`Expected 9 letters in the Shader Jay mark, found ${letters.length}`);
  const glyph = (n) => ({
    left: letters[n].start, width: letters[n + 1].start - letters[n].start - Math.round(iw * 0.004),
    top: y0, height: y1 - y0,
  });
  const innerPng = await sharp(inner.data, { raw: { width: iw, height: ih, channels: 3 } }).png().toBuffer();
  const S = await sharp(innerPng).extract(glyph(0)).toBuffer();
  const J = await sharp(innerPng).extract(glyph(6)).toBuffer();
  const sMeta = await sharp(S).metadata();
  const jMeta = await sharp(J).metadata();

  async function icon(size, fill) {
    const glyphH = Math.round(size * fill);
    const sW = Math.round((sMeta.width * glyphH) / sMeta.height);
    const jW = Math.round((jMeta.width * glyphH) / jMeta.height);
    const gap = Math.round(size * 0.02);
    const left = Math.round((size - sW - jW - gap) / 2);
    const top = Math.round((size - glyphH) / 2);
    return sharp({ create: { width: size, height: size, channels: 4, background: { ...NAVY, alpha: 1 } } })
      .composite([
        { input: await sharp(S).resize({ height: glyphH }).toBuffer(), left, top },
        { input: await sharp(J).resize({ height: glyphH }).toBuffer(), left: left + sW + gap, top },
      ])
      .png().toBuffer();
  }
  writeFileSync(join(root, 'favicon-32.png'), await icon(32, 0.62));
  writeFileSync(join(OUT.brand, 'apple-touch-icon.png'), await icon(180, 0.5));
  writeFileSync(join(OUT.brand, 'icon-192.png'), await icon(192, 0.5));
  writeFileSync(join(OUT.brand, 'icon-512.png'), await icon(512, 0.5));
  writeFileSync(join(OUT.brand, 'icon-maskable-512.png'), await icon(512, 0.38));

  // favicon.ico holding PNG-compressed 16, 32 and 48 px images.
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map((s) => icon(s, 0.62)));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, n) => {
    const e = 6 + n * 16;
    header.writeUInt8(s, e); header.writeUInt8(s, e + 1);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[n].length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += pngs[n].length;
  });
  writeFileSync(join(root, 'favicon.ico'), Buffer.concat([header, ...pngs]));

  return { widths: markWidths, width: 160, height: markHeight, navy: NAVY };
}

// ---------------------------------------------------------------- markup

// Matches the spiral's card size in main.js; the script swaps in grid sizes when needed.
const CARD_SIZES = '(min-width: 64em) min(22vw, 340px), 58vw';
const VIEW_SIZES = '(min-width: 64em) calc(100vw - 28rem), 100vw';

function cardMarkup(project, media, index) {
  const { slug, title, category, year } = project;
  const set = (ext) => CARD_WIDTHS.map((w) => `assets/img/work/${slug}-card-${w}.${ext} ${w}w`).join(', ');
  const film = media.find((m) => m.type === 'video');
  const preview = film ? ` data-preview="assets/video/${film.slug}-preview.mp4"` : '';

  const viewer = media.map((m) => {
    if (m.type === 'video') {
      return `<video class="viewer__video" data-label="${esc(m.label)}" controls loop muted playsinline preload="metadata" poster="${m.poster}" width="${m.width}" height="${m.height}"><source src="${m.src}" type="video/mp4"></video>`;
    }
    const s = (ext) => m.widths.map((w) => `assets/img/work/${m.base}-${w}.${ext} ${w}w`).join(', ');
    return `<picture data-label="${esc(m.label)}"><source type="image/avif" srcset="${s('avif')}" sizes="${VIEW_SIZES}"><img src="assets/img/work/${m.base}-${m.widths.at(-1)}.webp" srcset="${s('webp')}" sizes="${VIEW_SIZES}" width="${m.width}" height="${m.height}" alt="${esc(m.alt)}" decoding="async"></picture>`;
  }).join('');

  return `
          <li class="card" data-cat="${category}" data-slug="${slug}"${preview} style="--i: ${index}">
            <span class="card__float">
              <a class="card__link" href="#work/${slug}" aria-labelledby="${slug}-title ${slug}-meta" draggable="false">
                <picture>
                  <source type="image/avif" srcset="${set('avif')}" sizes="${CARD_SIZES}">
                  <img src="assets/img/work/${slug}-card-640.webp" srcset="${set('webp')}" sizes="${CARD_SIZES}" width="640" height="640" alt="${esc(project.alt)}" loading="lazy" decoding="async" draggable="false">
                </picture>
              </a>
            </span>
            <div class="card__info">
              <h3 class="card__title" id="${slug}-title">${esc(title)}</h3>
              <p class="card__meta" id="${slug}-meta"><span class="card__cat">${esc(categories[category])}</span>, <span class="card__year">${esc(year)}</span></p>
              <p class="card__desc">${esc(project.description)}</p>
            </div>
            <template class="card__media">${viewer}</template>
          </li>`;
}

function filtersMarkup() {
  const count = (cat) => projects.filter((p) => p.category === cat).length;
  const chip = (value, label, n, pressed) =>
    `<button class="filter" type="button" data-filter="${value}" aria-pressed="${pressed}"><span class="filter__label">${esc(label)}</span> <span class="filter__count">${n}</span></button>`;
  // A discipline with no pieces gets no chip, so no filter leads to an empty spiral.
  return [
    chip('all', 'All work', projects.length, true),
    ...Object.entries(categories)
      .filter(([key]) => count(key) > 0)
      .map(([key, label]) => chip(key, label, count(key), false)),
  ].map((c) => `\n            ${c}`).join('') + '\n          ';
}

// Order follows Jordan's list. The Olympics are credited in type only: the rings
// are a protected mark, so no artwork is used for them.
function brandsMarkup(logos) {
  const brands = [
    { logo: '0207-def-jam', name: '0207 Def Jam Recordings' },
    { word: 'Olympics' },
    { logo: 'vfb-stuttgart', name: 'VfB Stuttgart' },
    { logo: 'universal-music-group', name: 'Universal Music Group' },
    { logo: 'metamerch', name: 'MetaMerch.io' },
    { logo: 'io-interactive', name: 'IO Interactive' },
    { logo: 'warner-bros', name: 'Warner Bros' },
  ];
  return brands.map((b) => {
    if (b.word) return `\n            <li class="brand-item brand-item--word"><span class="brand-word">${b.word}</span></li>`;
    const l = logos[b.logo];
    return `\n            <li class="brand-item brand-item--${b.logo}"><img src="${l.src}" width="${l.width}" height="${l.height}" alt="${esc(b.name)}" loading="lazy" decoding="async"></li>`;
  }).join('') + '\n          ';
}

function itemListMarkup() {
  const list = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Selected work by Jordan Hinkson-Clarke',
    itemListElement: projects.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'CreativeWork',
        name: p.title,
        genre: categories[p.category],
        dateCreated: p.year.slice(0, 4),
        description: p.description,
        image: `${SITE_URL}assets/img/work/${p.slug}-card-640.webp`,
        creator: { '@id': `${SITE_URL}#jordan` },
      },
    })),
  };
  return `\n  <script type="application/ld+json">${JSON.stringify(list)}</script>\n  `;
}

function inject(html, name, content) {
  const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
  if (!re.test(html)) throw new Error(`Marker build:${name} not found in index.html`);
  return html.replace(re, (_, open, close) => `${open}${content}${close}`);
}

// ---------------------------------------------------------------- run

const mark = await buildShaderJay();
console.log('Shader Jay mark', mark);
const logos = await buildBrandLogos();
console.log('brand logos', Object.fromEntries(Object.entries(logos).map(([k, v]) => [k, `${v.width}x${v.height}`])));

const cards = [];
for (const [i, project] of projects.entries()) {
  cards.push(cardMarkup(project, await buildWork(project), i));
  process.stdout.write(`\rwork images ${i + 1}/${projects.length}`);
}
process.stdout.write('\n');

const unused = readdirSync(OUT.work).filter((file) => !produced.has(join(OUT.work, file)));
for (const file of unused) unlinkSync(join(OUT.work, file));
if (unused.length) console.log(`removed ${unused.length} images from removed projects`);

const indexPath = join(root, 'index.html');
let html = readFileSync(indexPath, 'utf8');
html = inject(html, 'brands', brandsMarkup(logos));
html = inject(html, 'filters', filtersMarkup());
html = inject(html, 'cards', cards.join('') + '\n        ');
html = inject(html, 'itemlist', itemListMarkup());
writeFileSync(indexPath, html);
console.log('index.html updated');
