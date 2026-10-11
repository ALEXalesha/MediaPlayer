// Значок программы из icon.svg (Медиаплеер): icon.ico (16-256 px) и icon.png (256 px, для README).
//   node web/media-player/electron/make-icon.js
// Рисует Chromium (Playwright, без окна). Для 16-32 px клавиши без мелких кнопок, иначе
// в панели задач вместо клавиатуры была бы каша из точек. Кадры до 64 px - BMP, 128 и
// 256 - PNG (так же делает tools/make-icon.js Игротеки).
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const DIR = __dirname;
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SMALL = 32;
const PNG_FROM = 128;

const simplify = (svg) => svg.replace(/<g fill="#5b6fe0" class="detail">[\s\S]*?<\/g>/, '');

function bmpFrame(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = ((size - 1 - y) * size + x) * 4;
      pixels[dst] = rgba[src + 2];
      pixels[dst + 1] = rgba[src + 1];
      pixels[dst + 2] = rgba[src];
      pixels[dst + 3] = rgba[src + 3];
    }
  }
  const maskRow = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, pixels, Buffer.alloc(maskRow * size)]);
}

function ico(frames) {
  const head = Buffer.alloc(6 + 16 * frames.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(frames.length, 4);
  let offset = head.length;
  frames.forEach((f, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(f.size >= 256 ? 0 : f.size, e);
    head.writeUInt8(f.size >= 256 ? 0 : f.size, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(f.data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += f.data.length;
  });
  return Buffer.concat([head, ...frames.map((f) => f.data)]);
}

(async () => {
  const svg = fs.readFileSync(path.join(DIR, 'icon.svg'), 'utf8');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const frames = [];
  let png256 = null;
  for (const size of SIZES) {
    const src = size <= SMALL ? simplify(svg) : svg;
    const out = await page.evaluate(async ({ src, size }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(src)));
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, size, size);
      return { rgba: Array.from(g.getImageData(0, 0, size, size).data), png: c.toDataURL('image/png').split(',')[1] };
    }, { src, size });
    const png = Buffer.from(out.png, 'base64');
    if (size === 256) png256 = png;
    frames.push({ size, data: size >= PNG_FROM ? png : bmpFrame(size, out.rgba) });
  }
  await browser.close();
  fs.writeFileSync(path.join(DIR, 'icon.ico'), ico(frames));
  fs.writeFileSync(path.join(DIR, 'icon.png'), png256);
  console.log('icon.ico:', SIZES.join(', '), 'px,', Math.round(fs.statSync(path.join(DIR, 'icon.ico')).size / 1024), 'КБ');
})().catch((e) => { console.error(e); process.exit(1); });
