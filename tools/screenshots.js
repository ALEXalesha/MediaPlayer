// Кадры для README: docs/screens/*.png. Страница открывается в безголовом Chromium по
// файловому адресу, звук выключен (--mute-audio), своя мелодия играет пару секунд, чтобы
// визуализация рисовала. Окон на экране нет, захват мыши - заглушка.
//   node tools/screenshots.js
// MP_PAGE - другая копия страницы, MP_OUT - другая папка для кадров.
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

const PAGE = process.env.MP_PAGE || path.join(__dirname, '..', 'index.html');
const OUT = process.env.MP_OUT || path.join(__dirname, '..', 'docs', 'screens');

async function shot(browser, name, { settings = {}, size = { width: 1280, height: 860 }, song = 0, seek = 20, then = null } = {}) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  await page.addInitScript(() => { Element.prototype.requestPointerLock = function () {}; Document.prototype.exitPointerLock = function () {}; });
  await page.addInitScript((s) => localStorage.setItem('mplayer:settings', JSON.stringify(s)), settings);
  await page.route(/^https?:\/\//, (r) => r.abort());
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => window.__mp && window.__mp.ready === true);
  await page.evaluate(([i, t]) => { __mp.player.play(i); __mp.player.seek(t); }, [song, seek]);
  if (then) await page.evaluate(then);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, name) });
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  await shot(browser, 'player.png', { song: 1, seek: 30 });
  await shot(browser, 'light-en.png', { settings: { theme: 'light', ui: 'en', viz: 'circle', eq: { preset: 'bass', gains: [7, 6, 5, 3, 1, 0, 0, 0, 0, 0] } }, song: 4, seek: 40 });
  await shot(browser, 'night-wave.png', { settings: { theme: 'night', viz: 'wave' }, song: 7, seek: 25 });
  await shot(browser, 'phone.png', { settings: { theme: 'warm' }, size: { width: 390, height: 844 }, song: 2, seek: 15 });
  await browser.close();
  for (const f of fs.readdirSync(OUT)) console.log(f, Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + ' КБ');
})().catch((e) => { console.error(e); process.exit(1); });
