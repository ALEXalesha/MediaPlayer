// Проверка НАСТОЯЩЕЙ программы «Медиаплеер» на Electron (electron):
// окно открывается со страницей, в заголовке версия, своя мелодия играет, размер и место
// окна переживают перезапуск. Окно в режиме проверок (MP_TEST=1) не показывается, не берёт
// фокус и молчит (звук окна выключен).
// Запуск: npx playwright test tests/media-player-app.spec.js
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const APP = path.join(__dirname, '..', 'electron');
const VERSION = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version;

async function launch(dataDir) {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [APP, '--user-data-dir=' + dataDir],
    env: { ...process.env, MP_TEST: '1' },
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.__mp && window.__mp.ready === true);
  return { app, page };
}

test('окно со страницей, версия в заголовке, окно скрыто и молчит, мелодия играет', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-app-'));
  const { app, page } = await launch(dataDir);
  try {
    expect(await page.evaluate(() => __mp.version)).toBe(VERSION);
    const info = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return { title: w.getTitle(), visible: w.isVisible(), focusable: w.isFocusable(), muted: w.webContents.isAudioMuted() };
    });
    expect(info.title).toBe(`Медиаплеер / MediaPlayer ${VERSION}`);
    expect(info).toMatchObject({ visible: false, focusable: false, muted: true });
    // своя мелодия играет и в программе: позиция идёт
    await page.evaluate(() => __mp.player.play(0));
    await expect.poll(() => page.evaluate(() => __mp.player.state().pos), { timeout: 15_000 }).toBeGreaterThan(0.5);
  } finally {
    await app.close();
  }
});

test('размер и место окна переживают перезапуск', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-app-'));
  let { app } = await launch(dataDir);
  const want = { x: 120, y: 90, width: 900, height: 640 };
  await app.evaluate(({ BrowserWindow }, b) => { const w = BrowserWindow.getAllWindows()[0]; w.setBounds(b); w.emit('resized'); }, want);
  await app.close();
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'window-state.json'), 'utf8'));
  expect(saved).toMatchObject({ ...want, maximized: false });
  ({ app } = await launch(dataDir));
  try {
    const b = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    expect(b).toEqual(want);
  } finally {
    await app.close();
  }
});
