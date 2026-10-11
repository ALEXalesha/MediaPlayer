// Оболочка Electron «Медиаплеера» (MediaPlayer): одно окно с той же страницей, что
// на сайте. Страница не копируется: при запуске из исходников берётся ../index.html, в
// собранной программе - resources/web/index.html (electron-builder кладёт её туда же,
// extraResources в package.json).
//
// Что добавляет оболочка: окно помнит размер, место и «развёрнуто» (window-state.js,
// тот же модуль, что у калькуляторов, Paint Pro и Игротеки), в заголовке - версия, сеть
// закрыта (страница работает без неё), ссылки и новые окна не открываются.
//
// Режим проверок (MP_TEST=1): окно не показывается вовсе и не берёт фокус - прогон не
// мешает человеку за этим компьютером. Папку данных проверки задают своим
// --user-data-dir, чтобы не трогать настоящий файл окна и настройки.
'use strict';

const { app, BrowserWindow, Menu, screen, session } = require('electron');
const path = require('path');
const WindowState = require('./window-state');

const TEST = process.env.MP_TEST === '1';
const VERSION = app.getVersion();
const SIZE = { width: 1100, height: 760, minWidth: 420, minHeight: 520 };
const PAGE = app.isPackaged
  ? path.join(process.resourcesPath, 'web', 'index.html')
  : path.join(__dirname, '..', 'index.html');
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

let win = null;

function windowTitle(pageTitle) {
  return `${pageTitle || 'MediaPlayer'} ${VERSION}`;
}

function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const areas = [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)].map((d) => d.workArea);
  const placed = WindowState.restore(WindowState.load(stateFile()), areas, SIZE);

  win = new BrowserWindow({
    ...(placed.x !== undefined ? { x: placed.x, y: placed.y } : {}),
    width: placed.width,
    height: placed.height,
    minWidth: SIZE.minWidth,
    minHeight: SIZE.minHeight,
    title: windowTitle(),
    backgroundColor: '#12101f',
    icon: path.join(__dirname, 'icon.ico'),
    show: false,
    autoHideMenuBar: true,
    ...(TEST ? { focusable: false, skipTaskbar: true } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // В заголовке окна - название страницы (оно на языке интерфейса) и версия программы
  win.on('page-title-updated', (e, title) => {
    e.preventDefault();
    win.setTitle(windowTitle(title));
  });
  // Ни переходов, ни новых окон: страница одна и работает сама по себе
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadFile(PAGE);
  if (placed.maximized && !TEST) win.maximize();
  if (!TEST) win.once('ready-to-show', () => win.show());

  // Запись после каждого перемещения и изменения размера и при закрытии: если процесс
  // убьют, размер не потеряется.
  const remember = () => { if (win && !win.isDestroyed() && !win.isMinimized()) WindowState.save(stateFile(), WindowState.capture(win)); };
  for (const event of ['resized', 'moved', 'maximize', 'unmaximize']) win.on(event, remember);
  win.on('close', remember);
  win.on('closed', () => { win = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  Menu.setApplicationMenu(null);
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    // Сеть странице не нужна: всё (мелодии, обложки, шрифты) внутри файла
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_d, cb) => cb({ cancel: true }));
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}

// Для проверок (tests-app/media-player-app.spec.js читает это через app.evaluate)
globalThis.__mpApp = { TEST, VERSION, PAGE, SIZE, get win() { return win; }, stateFile };
