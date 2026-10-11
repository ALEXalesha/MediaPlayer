// Проверка проверок «Медиаплеера»: по одному ломает правило страницы в КОПИИ во временной
// папке и гоняет на ней законы tests/media-player.spec.js (через MP_FILE). Сломанное
// правило должно уронить хотя бы один закон («мутант убит»). Исходник web/media-player не
// меняется, поэтому обрыв скрипта ничего не портит. У каждого мутанта g - какие законы
// гонять (-g Playwright), чтобы весь прогон шёл минуты, а не полчаса.
// Запуск из корня репозитория: node tests/mutate.js
// Файл не *.spec.js - Playwright его сам не запускает.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'index.html');
const SPEC = 'tests/media-player.spec.js';

// from - точный кусок кода (должен встречаться ровно один раз), to - сломанный вариант
const MUTANTS = [
  { name: 'три и больше одинаковых нот подряд (нет breakRuns)', from: 'function breakRuns() {', to: 'function breakRuns() { return;', g: 'мелодия' },
  { name: 'вторая четвёрка тактов части без изменений', from: 'if (half) notes = vary(notes, rb, b);', to: '', g: 'мелодия' },
  { name: 'перемешивание повторяет первую песню', from: 'for (let i = 0; i < n; i++) if (i !== start) rest.push(i);', to: 'for (let i = 0; i < n; i++) rest.push(i);', g: 'перемешивание' },
  { name: 'эквалайзер без предусилителя', from: 'return Math.pow(10, -(mx > 0 ? mx + 0.02 : 0) / 20);', to: 'return 1;', g: 'эквалайзер' },
  { name: 'полоса 1 кГц стоит на 1,2 кГц', from: 'const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];', to: 'const EQ_FREQS = [31, 62, 125, 250, 500, 1200, 2000, 4000, 8000, 16000];', g: 'эквалайзер' },
  { name: '«повтор одного» не повторяет', from: "if (settings.repeat === 'one') { src.seek(0); start(); return; }", to: '', g: 'повтор одного' },
  { name: '«назад» после 3 с не идёт в начало', from: 'if (src && src.current() > 3) { seek(0); return; }', to: '', g: 'щелчок по строке' },
  { name: 'скорость не меняет темп мелодии', from: 'this.stop(); this.rate = r; this.pos0 = p;', to: 'this.stop(); this.pos0 = p;', g: 'скорость меняет' },
  { name: 'настройки не запоминаются', from: "const saveSettings = () => Store.set('settings', settings);", to: 'const saveSettings = () => {};', g: 'переживают перезагрузку' },
  { name: 'позиция не запоминается', from: 'if (pos > 3 && pos < src.duration - 3)', to: 'if (false)', g: 'переживают перезагрузку|позиция своего файла' },
  { name: 'чужая тема из хранилища принимается', from: "theme: THEMES.includes(s.theme) ? s.theme : 'glass',", to: 'theme: s.theme,', g: 'испорченные записи' },
  { name: 'нет отступа под overlay-полосу прокрутки', from: ':root.overlay-sb #playlist { padding-right: 14px; }', to: '', g: 'полоса прокрутки' },
  { name: 'overlay-полоса не распознаётся', from: 'return w === 0; };', to: 'return false; };', g: 'полоса прокрутки' },
  { name: 'отступ под overlay-полосу мал (8 px)', from: ':root.overlay-sb #playlist { padding-right: 14px; }', to: ':root.overlay-sb #playlist { padding-right: 8px; }', g: 'полоса прокрутки' },
  // 1.0.2: полоса на половину панели при наведении (backdrop-filter у панелей с кнопками, как в WritingSpeed 1.1.1)
  { name: 'панели снова с backdrop-filter', from: '  box-shadow: var(--glass-shadow); position: relative; isolation: isolate;', to: '  box-shadow: var(--glass-shadow); position: relative; isolation: isolate; backdrop-filter: var(--blur);', g: 'наведение на кнопки' },
  { name: 'подложка панели без насыщенности темы', from: 'background-attachment: fixed; filter: saturate(var(--glass-sat)); }', to: 'background-attachment: fixed; }', g: 'наведение на кнопки' },
  { name: 'шапка светлеет при наведении на кнопку', from: '.btn:hover { background:', to: 'header.top:hover::after { background: rgb(255 255 255 / .1); } .btn:hover { background:', g: 'наведение на кнопки' },
];

function runSpec(file, g) {
  const grep = g ? ` -g "${g}"` : '';
  const r = spawnSync(`npx playwright test ${SPEC}${grep} --workers=1 --max-failures=1 --reporter=dot`, {
    cwd: ROOT, env: { ...process.env, MP_FILE: file }, shell: true, encoding: 'utf8', timeout: 10 * 60 * 1000,
  });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

function main() {
  const src = fs.readFileSync(SRC, 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-mutants-'));
  const file = path.join(dir, 'index.html');
  let survived = 0;
  try {
    fs.writeFileSync(file, src);
    const base = runSpec(file, MUTANTS.map((m) => m.g).join('|'));
    console.log(`исходная копия: ${base.ok ? 'проверки зелёные' : 'ПРОВЕРКИ КРАСНЫЕ'}`);
    if (!base.ok) { console.log(base.out.slice(-3000)); process.exitCode = 2; return; }
    for (const m of MUTANTS) {
      const n = src.split(m.from).length - 1;
      if (n !== 1) { console.log(`? ${m.name}: кусок кода найден ${n} раз - мутант устарел`); survived++; continue; }
      fs.writeFileSync(file, src.replace(m.from, m.to));
      const r = runSpec(file, m.g);
      const failed = /\d+\) .*›.*›\s*(.+)/.exec(r.out);
      console.log(`${r.ok ? 'ВЫЖИЛ' : 'убит '}  ${m.name}${!r.ok && failed ? '  <- ' + failed[1].replace(/[─\s]+$/, '') : ''}`);
      if (r.ok) survived++;
    }
    console.log(`итог: убито ${MUTANTS.length - survived} из ${MUTANTS.length}`);
    if (survived) process.exitCode = 1;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) main();
module.exports = { MUTANTS };
