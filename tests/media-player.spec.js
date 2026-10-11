// Законы «Медиаплеера / MediaPlayer» (index.html, одна страница):
// своя музыка из генератора песен (партитура: лад, длина, без повторов), звук через
// OfflineAudioContext (громкость не ноль, нет перегруза, длительность), плеер (плейлист,
// перемешивание, повтор, перемотка, скорость, громкость), 10-полосный эквалайзер,
// визуализация, мини-режим, горячие клавиши, Media Session, свои файлы (wav, webm),
// запоминание настроек и позиции (и сломанное хранилище), темы, язык интерфейса.
// Звук никогда не идёт в колонки: Chromium запускается с --mute-audio.
// Запуск: npx playwright test tests/media-player.spec.js --workers=1
// Проверка проверок (мутации в копии страницы): node tests/mutate.js
// MP_FILE - путь к другой копии страницы (так мутационный скрипт гоняет эти законы на сломанной копии).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const PAGE_DIR = path.join(__dirname, '..');
const FILE = process.env.MP_FILE || path.join(PAGE_DIR, 'index.html');
const URL = pathToFileURL(FILE).href;

test.use({ launchOptions: { args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] } });
test.describe.configure({ timeout: 120_000 });

// Захват мыши в проверках только поддельный: настоящий в безголовом Chromium на Windows зажимает курсор
const FAKE_POINTER_LOCK = () => {
  const fake = function () { window.__fakeLock = (window.__fakeLock || 0) + 1; return Promise.resolve(); };
  Object.defineProperty(Element.prototype, 'requestPointerLock', { configurable: true, writable: true, value: fake });
  Object.defineProperty(Document.prototype, 'exitPointerLock', { configurable: true, writable: true, value: function () {} });
};

// Запись всего, что страница отдаёт Media Session (настоящая в безголовом Chromium ничего не показывает)
const SPY_MEDIA_SESSION = () => {
  window.__ms = { handlers: {}, metadata: null, position: null, state: null };
  const ms = navigator.mediaSession;
  if (!ms) return;
  const set = ms.setActionHandler.bind(ms);
  ms.setActionHandler = (a, h) => { window.__ms.handlers[a] = h; try { set(a, h); } catch (e) { /* действие не поддержано */ } };
  const pos = ms.setPositionState ? ms.setPositionState.bind(ms) : null;
  ms.setPositionState = (s) => { window.__ms.position = s ? { ...s } : null; try { if (pos) pos(s); } catch (e) { /* неверные числа */ } };
  const desc = Object.getOwnPropertyDescriptor(MediaSession.prototype, 'metadata');
  Object.defineProperty(ms, 'metadata', { configurable: true, get() { return desc.get.call(ms); }, set(m) { window.__ms.metadata = m && { title: m.title, artist: m.artist, album: m.album, artwork: [...(m.artwork || [])].map((a) => a.src.slice(0, 22)) }; desc.set.call(ms, m); } });
  const st = Object.getOwnPropertyDescriptor(MediaSession.prototype, 'playbackState');
  Object.defineProperty(ms, 'playbackState', { configurable: true, get() { return st.get.call(ms); }, set(v) { window.__ms.state = v; st.set.call(ms, v); } });
};

async function openMp(page, { storage = null, init = null, size = null } = {}) {
  const errors = [];
  const requests = [];
  if (size) await page.setViewportSize(size);
  await page.addInitScript(FAKE_POINTER_LOCK);
  await page.addInitScript(SPY_MEDIA_SESSION);
  if (storage) await page.addInitScript((items) => { for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v); }, storage);
  if (init) await page.addInitScript(init);
  page.on('pageerror', (e) => errors.push(String((e && e.stack) || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(/^(https?|wss?):\/\//, (route) => { requests.push(route.request().url()); return route.abort(); });
  await require('./helpers').lockFirst(page); await page.goto(URL);
  await page.waitForFunction(() => window.__mp && window.__mp.ready === true, null, { timeout: 20_000 });
  Object.defineProperty(errors, 'requests', { value: requests }); // не мешает сравнению errors с []
  return errors;
}

const st = (page) => page.evaluate(() => __mp.player.state());
// Ползунок (input type=range) Playwright не заполняет через fill: значение и события input/change - руками
const setRange = (loc, v) => loc.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const waitFor = (page, fn, arg, timeout = 10_000) => page.waitForFunction(fn, arg, { timeout });

// WAV 16 бит моно: синус freq Гц длиной sec секунд (для своих файлов пользователя)
function wav(sec = 3, freq = 440, rate = 8000) {
  const n = Math.round(sec * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / rate) * 12000), 44 + i * 2);
  return b;
}

test.describe('mp: страница', () => {
  test('открывается без ошибок и без сети, кнопки на месте, по умолчанию русский, версия видна', async ({ page }) => {
    const errors = await openMp(page);
    await expect(page).toHaveTitle(/Медиаплеер/);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('ru');
    for (const id of ['play', 'prev', 'next', 'shuffle', 'repeat', 'seek', 'volume', 'mute', 'speed', 'mini', 'open-files', 'eq-preset', 'viz-canvas']) await expect(page.locator('#' + id)).toBeVisible();
    await expect(page.locator('#playlist .item')).toHaveCount(await page.evaluate(() => __mp.SONGS.length));
    const version = await page.evaluate(() => __mp.version);
    await expect(page.locator('#foot')).toContainText(version);
    expect(errors).toEqual([]);
    expect(errors.requests).toEqual([]);
    expect(await page.evaluate(() => window.__fakeLock || 0)).toBe(0);
  });

  test('один файл: без внешних скриптов, стилей и адресов в сети, ничего не отправляет', async () => {
    const html = fs.readFileSync(FILE, 'utf8');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href="(?!data:)/);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org\/)/);
    expect(html).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|<audio[^>]+src="(?!blob)/);
  });

  test('версия страницы совпадает с версией программы Electron', async ({ page }) => {
    await openMp(page);
    const pkg = JSON.parse(fs.readFileSync(path.join(PAGE_DIR, 'electron', 'package.json'), 'utf8'));
    expect(await page.evaluate(() => __mp.version)).toBe(pkg.version);
  });

  test('влезает в телефон: нет прокрутки вбок, кнопки и плейлист видны', async ({ page }) => {
    await openMp(page, { size: { width: 360, height: 740 } });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await expect(page.locator('#play')).toBeVisible();
    await page.locator('#playlist .item').first().scrollIntoViewIfNeeded();
    await expect(page.locator('#playlist .item').first()).toBeVisible();
    await page.click('#mini');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('mp: альбом и генератор песен', () => {
  test('10-15 своих мелодий разных жанров, у каждой название RU/EN и обложка', async ({ page }) => {
    await openMp(page);
    const songs = await page.evaluate(() => __mp.SONGS.map((s) => ({ id: s.id, ru: s.title.ru, en: s.title.en, family: s.family, cover: __mp.cover(s.id).slice(0, 22) })));
    expect(songs.length).toBeGreaterThanOrEqual(10);
    expect(songs.length).toBeLessThanOrEqual(15);
    expect(new Set(songs.map((s) => s.id)).size).toBe(songs.length);
    expect(new Set(songs.map((s) => s.ru)).size).toBe(songs.length);
    for (const s of songs) { expect(s.ru.length).toBeGreaterThan(2); expect(s.en.length).toBeGreaterThan(2); expect(s.cover).toBe('data:image/png;base64,'); }
    const families = new Set(songs.map((s) => s.family));
    for (const f of ['ambient', 'chiptune', 'lofi', 'classical', 'rock', 'electronic']) expect(families, f).toContain(f);
  });

  test('партитура: одинаковая при каждом вызове, длина 2,5-4 минуты, ноты в пределах и внутри песни', async ({ page }) => {
    await openMp(page);
    const r = await page.evaluate(() => __mp.SONGS.map((s) => {
      const a = __mp.score(s.id), b = __mp.score(s.id);
      const bad = a.events.filter((e) => e.t < 0 || e.t + e.d > a.duration + 0.001 || (e.midi != null && (e.midi < 24 || e.midi > 108)) || !(e.vel > 0 && e.vel <= 1));
      return { id: s.id, same: JSON.stringify(a.events) === JSON.stringify(b.events), dur: a.duration, n: a.events.length, bad: bad.length, insts: [...new Set(a.events.map((e) => e.inst))].length };
    }));
    for (const s of r) {
      expect(s.same, s.id).toBe(true);
      expect(s.dur, s.id).toBeGreaterThanOrEqual(150);
      expect(s.dur, s.id).toBeLessThanOrEqual(240);
      expect(s.bad, s.id).toBe(0);
      expect(s.n, s.id).toBeGreaterThan(300);
      expect(s.insts, s.id).toBeGreaterThanOrEqual(3);
    }
  });

  test('мелодия: в ладу песни, звучит больше половины песни, без повторов 4 тактов и почти без повторов 2 тактов, не больше 3 одинаковых нот подряд', async ({ page }) => {
    await openMp(page);
    const r = await page.evaluate(() => __mp.SONGS.map((s) => {
      const sc = __mp.score(s.id);
      const lead = sc.events.filter((e) => e.part === 'lead');
      const pcs = new Set(sc.scale.map((x) => ((x + sc.root) % 12 + 12) % 12));
      const out = lead.filter((e) => !pcs.has(e.midi % 12)).length;
      const bars = new Map();
      for (const e of lead) { const b = Math.floor(e.beat / sc.meter + 1e-9); if (!bars.has(b)) bars.set(b, []); bars.get(b).push(`${(e.beat - b * sc.meter).toFixed(3)}:${e.midi}:${e.dur.toFixed(3)}`); }
      const sig = (b) => (bars.get(b) || []).join(',');
      const win = (b, k) => { const parts = []; for (let i = 0; i < k; i++) parts.push(sig(b + i)); return parts.join('|'); };
      const leadBars = [...bars.keys()].sort((x, y) => x - y);
      const w4 = [], w2 = [];
      for (const b of leadBars) { if (bars.has(b + 3)) w4.push(win(b, 4)); if (bars.has(b + 1)) w2.push(win(b, 2)); }
      // повтор части (A, B, ...) - не копия первого раза: меняется хотя бы половина её тактов
      let worstRepeat = 1;
      for (const x of sc.sections) {
        if (x.occ === 0) continue;
        const first = sc.sections.find((y) => y.name === x.name && y.occ === 0);
        let diff = 0, cnt = 0;
        for (let i = 0; i < Math.min(x.bars, first.bars); i++) {
          if (!bars.has(first.bar + i) && !bars.has(x.bar + i)) continue;
          cnt++;
          if (sig(first.bar + i) !== sig(x.bar + i)) diff++;
        }
        if (cnt) worstRepeat = Math.min(worstRepeat, diff / cnt);
      }
      // одна и та же нота подряд: самая длинная серия и доля повторов соседей
      const seq = [...lead].sort((a, b) => a.beat - b.beat).map((e) => e.midi);
      let run = 1, maxRun = 1, same = 0;
      for (let i = 1; i < seq.length; i++) { if (seq[i] === seq[i - 1]) { run++; same++; } else run = 1; maxRun = Math.max(maxRun, run); }
      return { id: s.id, out, lead: lead.length, share: bars.size / sc.bars, dup4: w4.length - new Set(w4).size, uniq2: new Set(w2).size / Math.max(1, w2.length), worstRepeat, maxRun, same: same / Math.max(1, seq.length) };
    }));
    for (const s of r) {
      expect(s.worstRepeat, s.id).toBeGreaterThanOrEqual(0.5);
      expect(s.out, s.id).toBe(0);
      expect(s.lead, s.id).toBeGreaterThan(60);
      expect(s.share, s.id).toBeGreaterThan(0.5);
      expect(s.dup4, s.id).toBe(0);
      expect(s.uniq2, s.id).toBeGreaterThanOrEqual(0.85);
      expect(s.maxRun, s.id + ': нот подряд на одной высоте').toBeLessThanOrEqual(3);
      expect(s.same, s.id + ': доля повторов соседних нот').toBeLessThanOrEqual(0.25);
    }
  });

  test('песни разные: начало мелодий не совпадает, темп и лад свои', async ({ page }) => {
    await openMp(page);
    const r = await page.evaluate(() => __mp.SONGS.map((s) => { const sc = __mp.score(s.id); return { id: s.id, head: sc.events.filter((e) => e.part === 'lead').slice(0, 16).map((e) => e.midi % 12).join(','), key: sc.bpm + '/' + sc.root + '/' + sc.scale.join('') }; }));
    expect(new Set(r.map((x) => x.head)).size).toBe(r.length);
    expect(new Set(r.map((x) => x.key)).size).toBe(r.length);
  });
});

test.describe('mp: звук через OfflineAudioContext (без колонок)', () => {
  test('каждая мелодия: громкость не ноль, нет перегруза > 0,99, нет долгой тишины в середине', async ({ page }) => {
    test.setTimeout(400_000);
    await openMp(page);
    const ids = await page.evaluate(() => __mp.SONGS.map((s) => s.id));
    for (const id of ids) {
      const a = await page.evaluate(async (id) => {
        const sc = __mp.score(id);
        const from = sc.sections.find((x) => x.name === 'B').time;
        return __mp.analyze(await __mp.render(id, from, 16, 16000));
      }, id);
      expect(a.rms, id).toBeGreaterThan(0.03);
      expect(a.peak, id).toBeLessThanOrEqual(0.99);
      expect(a.peak, id).toBeGreaterThan(0.2);
      expect(a.hot, id).toBeLessThan(0.002);
      expect(a.silence, id).toBeLessThan(1.5);
      expect(a.stereo, id).toBeGreaterThan(0.002);
    }
  });

  test('каждая мелодия целиком: нигде нет перегруза и провалов тишины, все части слышны', async ({ page }) => {
    test.setTimeout(400_000);
    await openMp(page);
    const ids = await page.evaluate(() => __mp.SONGS.map((s) => s.id));
    for (const id of ids) {
      const a = await page.evaluate(async (id) => {
        const sc = __mp.score(id);
        const end = sc.bars * sc.meter * 60 / sc.bpm;
        const buf = await __mp.render(id, 0, sc.duration, 8000);
        const whole = __mp.analyze(buf, 1, end);
        const quietest = Math.min(...sc.sections.map((x) => __mp.analyze(buf, x.time, x.time + x.bars * sc.meter * 60 / sc.bpm).rms));
        return { ...whole, quietest };
      }, id);
      expect(a.peak, id).toBeLessThanOrEqual(0.99);
      expect(a.hot, id).toBeLessThan(0.002);
      expect(a.silence, id).toBeLessThan(1.5);
      expect(a.rms, id).toBeGreaterThan(0.05);
      expect(a.quietest, id).toBeGreaterThan(0.01);
    }
  });

  test('длительность: звук идёт до конца партитуры и кончается вместе с ней', async ({ page }) => {
    await openMp(page);
    for (const id of await page.evaluate(() => [__mp.SONGS[0].id, __mp.SONGS[5].id])) {
      const r = await page.evaluate(async (id) => {
        const sc = __mp.score(id);
        const end = sc.bars * sc.meter * 60 / sc.bpm; // конец последнего такта; дальше - только хвосты нот и эха
        const from = end - 3, len = sc.duration + 1 - from;
        const buf = await __mp.render(id, from, len, 16000);
        return { before: __mp.analyze(buf, 0, 2), after: __mp.analyze(buf, len - 0.8, len), len, got: buf.duration, tail: sc.duration - end };
      }, id);
      expect(r.got).toBeCloseTo(r.len, 2);
      expect(r.tail, id).toBeLessThan(8);
      expect(r.before.rms, id).toBeGreaterThan(0.005);
      expect(r.after.peak, id).toBeLessThan(0.003);
    }
  });

  test('без явных повторов и в звуке: первое и второе появление части A звучат по-разному', async ({ page }) => {
    await openMp(page);
    const ids = await page.evaluate(() => __mp.SONGS.map((s) => s.id));
    for (const id of ids) {
      const c = await page.evaluate(async (id) => {
        const sc = __mp.score(id);
        const a = sc.sections.filter((x) => x.name === 'A');
        const len = sc.meter * 4 * 60 / sc.bpm;
        const x = await __mp.render(id, a[0].time, len, 8000);
        const y = await __mp.render(id, a[1].time, len, 8000);
        return __mp.correlate(x, y);
      }, id);
      expect(c, id).toBeLessThan(0.97);
    }
  });
});

test.describe('mp: плеер', () => {
  test('играет свою мелодию: позиция идёт, анализатор слышит звук, пауза глушит', async ({ page }) => {
    await openMp(page);
    await page.click('#play');
    await waitFor(page, () => __mp.player.state().playing && __mp.player.state().pos > 1.2);
    await waitFor(page, () => __mp.level() > 0.004);
    const s = await st(page);
    expect(s.index).toBe(0);
    expect(s.duration).toBeCloseTo(await page.evaluate(() => __mp.score(__mp.SONGS[0].id).duration), 3);
    await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#now-title')).toHaveText(await page.evaluate(() => __mp.SONGS[0].title.ru));
    await page.click('#play');
    const p0 = (await st(page)).pos;
    await page.waitForTimeout(600);
    const s2 = await st(page);
    expect(s2.playing).toBe(false);
    expect(Math.abs(s2.pos - p0)).toBeLessThan(0.05);
    await waitFor(page, () => __mp.level() < 0.0005);
    expect(await page.evaluate(() => __mp.voices())).toBe(0);
  });

  test('щелчок по строке плейлиста включает её, следующая и предыдущая, «назад» после 3 с - в начало', async ({ page }) => {
    await openMp(page);
    await page.locator('#playlist .item').nth(3).dblclick();
    await waitFor(page, () => __mp.player.state().index === 3 && __mp.player.state().playing);
    await page.click('#next');
    expect((await st(page)).index).toBe(4);
    await page.click('#prev');
    expect((await st(page)).index).toBe(3);
    await page.evaluate(() => __mp.player.seek(10));
    await page.click('#prev');
    const s = await st(page);
    expect(s.index).toBe(3);
    expect(s.pos).toBeLessThan(1);
    await expect(page.locator('#playlist .item').nth(3)).toHaveClass(/current/);
  });

  test('перемотка полосой: щелчок на середине - половина песни; время на экране', async ({ page }) => {
    await openMp(page);
    const box = await page.locator('#seek').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const s = await st(page);
    expect(Math.abs(s.pos / s.duration - 0.5)).toBeLessThan(0.04);
    const t = Math.floor(s.pos);
    await expect(page.locator('#time-cur')).toHaveText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
  });

  test('повтор одного: в конце та же песня сначала; повтор всех: после последней первая; без повтора: стоп', async ({ page }) => {
    await openMp(page);
    const n = await page.evaluate(() => __mp.SONGS.length);
    await page.evaluate(() => { __mp.player.setRepeat('one'); __mp.player.play(2); });
    await page.evaluate(() => __mp.player.seek(__mp.player.state().duration - 0.5));
    await waitFor(page, () => __mp.player.state().pos < 3 && __mp.player.state().playing && __mp.player.state().ended >= 1);
    expect((await st(page)).index).toBe(2);
    await page.evaluate((n) => { __mp.player.setRepeat('all'); __mp.player.play(n - 1); }, n);
    await page.evaluate(() => __mp.player.seek(__mp.player.state().duration - 0.5));
    await waitFor(page, () => __mp.player.state().index === 0 && __mp.player.state().playing);
    await page.evaluate((n) => { __mp.player.setRepeat('off'); __mp.player.play(n - 1); }, n);
    await page.evaluate(() => __mp.player.seek(__mp.player.state().duration - 0.5));
    await waitFor(page, () => !__mp.player.state().playing);
    expect((await st(page)).index).toBe(n - 1);
    // кнопка повтора ходит по кругу: выкл -> все -> один -> выкл
    const modes = [];
    for (let i = 0; i < 3; i++) { await page.click('#repeat'); modes.push((await st(page)).repeat); }
    expect(modes).toEqual(['all', 'one', 'off']);
  });

  test('конец песни без повтора ведёт к следующей', async ({ page }) => {
    await openMp(page);
    await page.evaluate(() => { __mp.player.play(1); __mp.player.seek(__mp.player.state().duration - 0.4); });
    await waitFor(page, () => __mp.player.state().index === 2 && __mp.player.state().playing);
  });

  test('перемешивание: каждая песня по разу, пока не пройдены все; закон порядка на многих случаях', async ({ page }) => {
    await openMp(page);
    const law = await page.evaluate(() => {
      const bad = [];
      for (let n = 1; n <= 30; n++) for (let seed = 1; seed <= 40; seed++) {
        const start = (seed * 7) % n;
        const o = __mp.shuffleOrder(n, start, seed);
        if (o.length !== n || o[0] !== start || new Set(o).size !== n || o.some((x) => x < 0 || x >= n || !Number.isInteger(x))) bad.push([n, seed]);
      }
      const a = __mp.shuffleOrder(12, 0, 1).join(), b = __mp.shuffleOrder(12, 0, 2).join();
      return { bad, differ: a !== b };
    });
    expect(law.bad).toEqual([]);
    expect(law.differ).toBe(true);
    await page.click('#shuffle');
    expect((await st(page)).shuffle).toBe(true);
    await page.evaluate(() => __mp.player.play(0));
    const seen = [0];
    const n = await page.evaluate(() => __mp.SONGS.length);
    for (let i = 1; i < n; i++) { await page.click('#next'); seen.push((await st(page)).index); }
    expect(new Set(seen).size).toBe(n);
    expect(seen).not.toEqual([...Array(n).keys()]);
  });

  test('громкость и «без звука» - на усилителе, скорость меняет темп мелодии', async ({ page }) => {
    await openMp(page);
    await setRange(page.locator('#volume'), '0.3');
    expect((await st(page)).volume).toBeCloseTo(0.3, 5);
    await page.click('#play');
    await waitFor(page, () => __mp.player.state().playing);
    expect(await page.evaluate(() => __mp.gain())).toBeCloseTo(0.3, 3);
    await page.click('#mute');
    expect(await page.evaluate(() => __mp.gain())).toBe(0);
    expect((await st(page)).muted).toBe(true);
    await page.click('#mute');
    expect(await page.evaluate(() => __mp.gain())).toBeCloseTo(0.3, 3);
    await page.selectOption('#speed', '1.5');
    expect((await st(page)).rate).toBe(1.5);
    const a = await st(page);
    await page.waitForTimeout(1500);
    const b = await st(page);
    const speed = (b.pos - a.pos) / ((b.at - a.at) / 1000);
    expect(speed).toBeGreaterThan(1.25);
    expect(speed).toBeLessThan(1.75);
  });

  test('горячие клавиши: пробел, стрелки, M, N, P; пробел на кнопке не жмёт её второй раз', async ({ page }) => {
    await openMp(page);
    await page.keyboard.press('Space');
    await waitFor(page, () => __mp.player.state().playing);
    await page.evaluate(() => __mp.player.seek(30));
    await page.keyboard.press('ArrowRight');
    expect((await st(page)).pos).toBeGreaterThanOrEqual(34.9);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const p = (await st(page)).pos;
    expect(p).toBeGreaterThanOrEqual(24.9);
    expect(p).toBeLessThan(27);
    const v = (await st(page)).volume;
    await page.keyboard.press('ArrowUp');
    expect((await st(page)).volume).toBeCloseTo(Math.min(1, v + 0.05), 5);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect((await st(page)).volume).toBeCloseTo(Math.min(1, v + 0.05) - 0.1, 5);
    await page.keyboard.press('m');
    expect((await st(page)).muted).toBe(true);
    await page.keyboard.press('KeyM');
    expect((await st(page)).muted).toBe(false);
    await page.keyboard.press('n');
    expect((await st(page)).index).toBe(1);
    await page.keyboard.press('p');
    expect((await st(page)).index).toBe(0);
    await page.focus('#next');
    await page.keyboard.press('Space');
    const s = await st(page);
    expect(s.index).toBe(0);
    expect(s.playing).toBe(false);
  });

  test('порядок: перетащить строку и Alt+стрелка; порядок переживает перезагрузку', async ({ page }) => {
    await openMp(page);
    const before = await page.evaluate(() => __mp.player.list().map((x) => x.key));
    await page.locator('#playlist .item').nth(4).dragTo(page.locator('#playlist .item').nth(0), { targetPosition: { x: 20, y: 3 } });
    const after = await page.evaluate(() => __mp.player.list().map((x) => x.key));
    expect(after[0]).toBe(before[4]);
    expect(after.slice(1, 5)).toEqual(before.slice(0, 4));
    await page.locator('#playlist .item').nth(0).focus();
    await page.keyboard.press('Alt+ArrowDown');
    const after2 = await page.evaluate(() => __mp.player.list().map((x) => x.key));
    expect(after2.slice(0, 2)).toEqual([before[0], before[4]]);
    await page.reload();
    await page.waitForFunction(() => window.__mp && window.__mp.ready === true);
    expect(await page.evaluate(() => __mp.player.list().map((x) => x.key))).toEqual(after2);
  });
});

test.describe('mp: эквалайзер', () => {
  test('10 полос на стандартных частотах, пресеты ставят свои значения, движок ползунка - «свой»', async ({ page }) => {
    await openMp(page);
    await page.click('#play');
    const nodes = await page.evaluate(() => __mp.eqNodes());
    expect(nodes.map((n) => n.frequency)).toEqual([31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
    expect(nodes[0].type).toBe('lowshelf');
    expect(nodes[9].type).toBe('highshelf');
    expect(nodes.slice(1, 9).every((n) => n.type === 'peaking')).toBe(true);
    const presets = await page.evaluate(() => __mp.EQ_PRESETS);
    expect(Object.keys(presets).length).toBeGreaterThanOrEqual(8);
    for (const [name, gains] of Object.entries(presets)) {
      await page.selectOption('#eq-preset', name);
      expect((await page.evaluate(() => __mp.eqNodes())).map((n) => n.gain), name).toEqual(gains);
      expect((await st(page)).eq.preset).toBe(name);
    }
    await setRange(page.locator('.eq-band input').nth(5), '7');
    const s = await st(page);
    expect(s.eq.preset).toBe('custom');
    expect(s.eq.gains[5]).toBe(7);
    expect((await page.evaluate(() => __mp.eqNodes()))[5].gain).toBe(7);
  });

  test('отклик фильтров: ровный - 0 дБ, +12 на 1 кГц поднимает 1 кГц на 12 дБ относительно далёких частот; предусилитель не даёт выйти выше 0 дБ', async ({ page }) => {
    await openMp(page);
    await page.click('#play');
    const r = await page.evaluate(() => {
      __mp.player.setEq([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const flat = [40, 200, 1000, 5000, 15000].map((f) => __mp.eqResponse(f));
      __mp.player.setEq([0, 0, 0, 0, 0, 12, 0, 0, 0, 0]);
      const k = __mp.eqResponse(1000), far = __mp.eqResponse(60);
      let worst = -99;
      let seed = 5;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 150; i++) {
        __mp.player.setEq(Array.from({ length: 10 }, () => Math.round(rnd() * 24 - 12)));
        for (let f = 20; f < 20000; f *= 1.06) worst = Math.max(worst, __mp.eqResponse(f));
      }
      return { flat, k, far, worst };
    });
    for (const x of r.flat) expect(Math.abs(x)).toBeLessThan(0.05);
    expect(r.k - r.far).toBeGreaterThan(11);
    expect(r.k - r.far).toBeLessThan(13);
    expect(r.worst).toBeLessThanOrEqual(0.05);
  });

  test('эквалайзер действительно меняет звук: синус 1 кГц через цепочку +12 дБ громче, чем при -12', async ({ page }) => {
    await openMp(page);
    const r = await page.evaluate(async () => ({
      up: await __mp.eqTone([0, 0, 0, 0, 0, 12, 0, 0, 0, 0], 1000),
      down: await __mp.eqTone([0, 0, 0, 0, 0, -12, 0, 0, 0, 0], 1000),
      flat: await __mp.eqTone([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 1000),
    }));
    expect(20 * Math.log10(r.flat / r.down)).toBeGreaterThan(10);
    expect(Math.abs(20 * Math.log10(r.up / r.flat))).toBeLessThan(1.5); // +12 дБ съел предусилитель
  });
});

test.describe('mp: визуализация и мини-режим', () => {
  test('три вида рисуют разное и не пусто, пока играет', async ({ page }) => {
    await openMp(page);
    await page.click('#play');
    await waitFor(page, () => __mp.level() > 0.004);
    const shots = {};
    for (const mode of ['bars', 'wave', 'circle']) {
      await page.click(`[data-viz="${mode}"]`);
      expect((await st(page)).viz).toBe(mode);
      await page.waitForTimeout(250);
      shots[mode] = await page.evaluate(() => __mp.canvasStats());
      expect(shots[mode].lit, mode).toBeGreaterThan(0.005);
    }
    expect(new Set(Object.values(shots).map((s) => s.hash)).size).toBe(3);
  });

  test('мини-режим: только самое нужное, кнопки работают, переживает перезагрузку', async ({ page }) => {
    await openMp(page);
    await page.click('#mini');
    await expect(page.locator('body')).toHaveClass(/mini/);
    await expect(page.locator('#playlist')).toBeHidden();
    await expect(page.locator('#eq')).toBeHidden();
    for (const id of ['play', 'prev', 'next', 'seek', 'now-title']) await expect(page.locator('#' + id)).toBeVisible();
    await page.click('#next');
    expect((await st(page)).index).toBe(1);
    await page.reload();
    await page.waitForFunction(() => window.__mp && window.__mp.ready === true);
    await expect(page.locator('body')).toHaveClass(/mini/);
    await page.click('#mini');
    await expect(page.locator('#playlist')).toBeVisible();
  });
});

test.describe('mp: Media Session', () => {
  test('название, исполнитель, альбом и обложка; кнопки системы ведут плеер; позиция', async ({ page }) => {
    await openMp(page);
    await page.evaluate(() => __mp.player.play(2));
    await waitFor(page, () => window.__ms.metadata && window.__ms.position);
    const ms = await page.evaluate(() => window.__ms);
    const song = await page.evaluate(() => __mp.SONGS[2]);
    expect(ms.metadata.title).toBe(song.title.ru);
    expect(ms.metadata.album).toMatch(/Медиаплеер|MediaPlayer/);
    expect(ms.metadata.artwork[0]).toBe('data:image/png;base64,');
    expect(ms.state).toBe('playing');
    expect(ms.position.duration).toBeCloseTo((await st(page)).duration, 3);
    expect(Object.keys(ms.handlers).sort()).toEqual(['nexttrack', 'pause', 'play', 'previoustrack', 'seekbackward', 'seekforward', 'seekto', 'stop'].sort());
    await page.evaluate(() => window.__ms.handlers.nexttrack());
    expect((await st(page)).index).toBe(3);
    await page.evaluate(() => window.__ms.handlers.seekto({ seekTime: 50 }));
    expect((await st(page)).pos).toBeCloseTo(50, 0);
    await page.evaluate(() => window.__ms.handlers.pause());
    expect((await st(page)).playing).toBe(false);
    expect(await page.evaluate(() => window.__ms.state)).toBe('paused');
  });
});

test.describe('mp: свои файлы', () => {
  test('кнопка «Открыть»: wav встаёт в плейлист с длиной и играет, сеть не нужна', async ({ page }) => {
    const errors = await openMp(page);
    const n = await page.evaluate(() => __mp.SONGS.length);
    await page.locator('#file-input').setInputFiles([{ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav(4, 440) }]);
    await expect(page.locator('#playlist .item')).toHaveCount(n + 1);
    await expect(page.locator('#playlist .item').last()).toContainText('tone');
    await expect(page.locator('#playlist .item').last().locator('.dur')).toHaveText('0:04');
    await page.locator('#playlist .item').last().dblclick();
    await waitFor(page, () => __mp.player.state().playing && __mp.player.state().pos > 0.5);
    await waitFor(page, () => __mp.level() > 0.004);
    const s = await st(page);
    expect(s.index).toBe(n);
    expect(s.kind).toBe('file');
    expect(await page.evaluate(() => document.getElementById('media').currentSrc.startsWith('blob:'))).toBe(true);
    // конец последней песни без повтора - стоп
    await waitFor(page, () => !__mp.player.state().playing, null, 15_000);
    expect(errors.requests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('перетаскивание в окно: файлы встают в конец; чужие файлы отвергаются с сообщением', async ({ page }) => {
    await openMp(page);
    const n = await page.evaluate(() => __mp.SONGS.length);
    const b64 = wav(2, 330).toString('base64');
    const dt = await page.evaluateHandle((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const d = new DataTransfer();
      d.items.add(new File([bytes], 'drop.wav', { type: 'audio/wav' }));
      d.items.add(new File(['не звук'], 'notes.txt', { type: 'text/plain' }));
      return d;
    }, b64);
    await page.dispatchEvent('body', 'dragover', { dataTransfer: dt });
    await page.dispatchEvent('body', 'drop', { dataTransfer: dt });
    await expect(page.locator('#playlist .item')).toHaveCount(n + 1);
    await expect(page.locator('#toast')).toContainText('notes.txt');
  });

  test('битый файл с расширением звука: ошибка в строке, плеер идёт дальше', async ({ page }) => {
    const errors = await openMp(page);
    const n = await page.evaluate(() => __mp.SONGS.length);
    await page.locator('#file-input').setInputFiles([
      { name: 'broken.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('это не mp3, а текст') },
      { name: 'ok.wav', mimeType: 'audio/wav', buffer: wav(3, 500) },
    ]);
    await expect(page.locator('#playlist .item')).toHaveCount(n + 2);
    await page.evaluate((n) => __mp.player.play(n), n);
    await waitFor(page, (n) => __mp.player.state().index === n + 1 && __mp.player.state().playing, n);
    await expect(page.locator('#playlist .item').nth(n)).toHaveClass(/broken/);
    expect(errors.filter((e) => !/Failed to load|MEDIA_ERR|DEMUXER|no supported source/i.test(e))).toEqual([]);
  });

  test('видео webm: показывается вместо визуализации', async ({ page }) => {
    await openMp(page);
    const made = await page.evaluate(async () => {
      if (!window.MediaRecorder || !MediaRecorder.isTypeSupported('video/webm')) return false;
      const c = document.createElement('canvas'); c.width = 160; c.height = 120;
      const g = c.getContext('2d');
      const rec = new MediaRecorder(c.captureStream(20), { mimeType: 'video/webm' });
      const parts = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      const done = new Promise((r) => { rec.onstop = r; });
      rec.start(100);
      for (let i = 0; i < 30; i++) { g.fillStyle = `hsl(${i * 12},80%,50%)`; g.fillRect(0, 0, 160, 120); await new Promise((r) => setTimeout(r, 50)); }
      rec.stop(); await done;
      __mp.player.addFiles([new File(parts, 'clip.webm', { type: 'video/webm' })]);
      return true;
    });
    test.skip(!made, 'нет MediaRecorder для webm');
    const n = await page.evaluate(() => __mp.player.list().length);
    await page.evaluate((n) => __mp.player.play(n - 1), n);
    await waitFor(page, () => document.getElementById('media').videoWidth > 0);
    await expect(page.locator('#media')).toBeVisible();
    await expect(page.locator('#viz-canvas')).toBeHidden();
    expect((await st(page)).video).toBe(true);
  });

  test('позиция своего файла: тот же файл, открытый снова, продолжается с того же места', async ({ page }) => {
    await openMp(page);
    const file = { name: 'long.wav', mimeType: 'audio/wav', buffer: wav(30, 300) };
    await page.locator('#file-input').setInputFiles([file]);
    const n = await page.evaluate(() => __mp.player.list().length);
    await page.evaluate((n) => __mp.player.play(n - 1), n);
    await waitFor(page, () => __mp.player.state().playing);
    await page.evaluate(() => __mp.player.seek(17));
    await page.evaluate(() => __mp.player.pause());
    await page.reload();
    await page.waitForFunction(() => window.__mp && window.__mp.ready === true);
    await page.locator('#file-input').setInputFiles([file]);
    await page.evaluate((n) => __mp.player.select(n - 1), n);
    await waitFor(page, () => Math.abs(__mp.player.state().pos - 17) < 1);
  });
});

test.describe('mp: память и вид', () => {
  test('громкость, эквалайзер, скорость, вид, повтор, песня и позиция переживают перезагрузку', async ({ page }) => {
    await openMp(page);
    await setRange(page.locator('#volume'), '0.37');
    await page.selectOption('#eq-preset', 'rock');
    await page.selectOption('#speed', '1.25');
    await page.click('[data-viz="circle"]');
    await page.click('#repeat');
    await page.evaluate(() => { __mp.player.play(3); __mp.player.seek(42); __mp.player.pause(); });
    await page.reload();
    await page.waitForFunction(() => window.__mp && window.__mp.ready === true);
    const s = await st(page);
    expect(s.volume).toBeCloseTo(0.37, 5);
    expect(s.eq.preset).toBe('rock');
    expect(s.eq.gains).toEqual(await page.evaluate(() => __mp.EQ_PRESETS.rock));
    expect(s.rate).toBe(1.25);
    expect(s.viz).toBe('circle');
    expect(s.repeat).toBe('all');
    expect(s.index).toBe(3);
    expect(s.pos).toBeCloseTo(42, 0);
    expect(s.playing).toBe(false);
    await expect(page.locator('#volume')).toHaveValue('0.37');
    await expect(page.locator('#speed')).toHaveValue('1.25');
    expect(Object.keys(await page.evaluate(() => ({ ...localStorage }))).every((k) => k.startsWith('mplayer:'))).toBe(true);
  });

  test('сломанное хранилище: всё работает, внизу пометка', async ({ page }) => {
    const errors = await openMp(page, { init: () => {
      Storage.prototype.getItem = () => { throw new Error('denied'); };
      Storage.prototype.setItem = () => { throw new Error('denied'); };
    } });
    await page.click('#play');
    await waitFor(page, () => __mp.player.state().playing);
    await setRange(page.locator('#volume'), '0.5');
    await page.selectOption('#eq-preset', 'bass');
    await expect(page.locator('#foot')).toContainText('не сохраняются');
    expect(errors).toEqual([]);
  });

  test('испорченные записи в хранилище не ломают страницу', async ({ page }) => {
    const errors = await openMp(page, { storage: { 'mplayer:settings': '{"volume":"громко","eq":{"gains":[1,2]},"rate":99,"theme":"x"}', 'mplayer:order': '[1,2', 'mplayer:last': 'null' } });
    const s = await st(page);
    expect(s.volume).toBeGreaterThanOrEqual(0);
    expect(s.volume).toBeLessThanOrEqual(1);
    expect(s.eq.gains).toHaveLength(10);
    expect([0.5, 0.75, 1, 1.25, 1.5, 2]).toContain(s.rate);
    // неизвестная тема - значит «Стеклянная» (у неё нет data-theme), а не пустые цвета
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBeNull();
    expect(errors).toEqual([]);
  });

  test('пять тем Paint и язык интерфейса', async ({ page }) => {
    await openMp(page);
    await page.click('#open-settings');
    for (const t of ['formal', 'light', 'night', 'warm', 'glass']) {
      await page.click(`[data-theme-id="${t}"]`);
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(t === 'glass' ? null : t);
    }
    await page.click('#ui-lang');
    await expect(page).toHaveTitle(/MediaPlayer/);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    await expect(page.locator('#playlist .item').first().locator('.title')).toHaveText(await page.evaluate(() => __mp.SONGS[0].title.en));
    await expect(page.locator('#open-files')).toContainText('Open');
    await page.click('#ui-lang');
    await expect(page.locator('#open-files')).toContainText('Открыть');
  });
});
