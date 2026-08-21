// 比对 tsk_nohit.txt 与现有词典，找出仍未翻译的文本
import fs from 'node:fs';

const nohit = fs.readFileSync('C:/Users/KK/Twinkle_StarKnightsX/BepInEx/plugins/font/tsk_nohit.txt', 'utf8').split(/\r?\n/).filter(l => l.trim());

function loadDict(file) {
  const t = fs.readFileSync(file, 'utf8');
  const exact = new Map();
  const templates = new Map();
  const eSec = t.slice(0, t.indexOf('Templates'));
  for (const m of eSec.matchAll(/\{ "([^"]+)", "([^"]+)" \}/g)) exact.set(m[1], m[2]);
  const tSec = t.indexOf('Templates') >= 0 ? t.slice(t.indexOf('Templates')) : '';
  for (const m of tSec.matchAll(/\{ "([^"]+)", "([^"]+)" \}/g)) templates.set(m[1], m[2]);
  return { exact, templates };
}
const dicts = [
  loadDict('E:/dsh/TSKHook/UiDict.cs'),
  loadDict('E:/dsh/TSKHook/UiDictExt.cs'),
  loadDict('E:/dsh/TSKHook/UiDictMeta.cs'),
  loadDict('E:/dsh/TSKHook/UiDictTask.cs'),
];
// names.json
let names = new Set();
try { const n = JSON.parse(fs.readFileSync('E:/dsh/TSKHook/translation_zh_Hans/names.json', 'utf8')); names = new Set(Object.keys(n)); } catch {}

function normalize(s) {
  let out = '';
  let lastHash = false;
  for (let idx = 0; idx < s.length; idx++) {
    const c = s[idx];
    if (c === '{' && idx + 2 < s.length && /\d/.test(s[idx + 1]) && s[idx + 2] === '}') {
      if (!lastHash) { out += '#'; lastHash = true; }
      idx += 2;
    } else if (/\d/.test(c)) {
      if (!lastHash) { out += '#'; lastHash = true; }
    } else {
      lastHash = false;
      if (c === '％') out += '%';
      else if (c === '×') out += 'x';
      else if (c === '～') out += '~';
      else out += c;
    }
  }
  return out;
}

const untranslated = [];
for (const s of nohit) {
  const st = s.trim();
  if (st.length < 2) continue;
  if (dicts.some(d => d.exact.has(st))) continue;
  if (names.has(st)) continue;
  const norm = normalize(st);
  if (dicts.some(d => [...d.templates.keys()].some(k => normalize(k) === norm))) continue;
  untranslated.push(st);
}
const uniq = [...new Set(untranslated)];
console.log('nohit total:', nohit.length, '| 未翻译:', uniq.length);
for (const s of uniq) console.log(' ', JSON.stringify(s.slice(0, 100)));
fs.writeFileSync('E:/dsh/TSKHook/tools/nohit-untranslated.txt', uniq.join('\n'), 'utf8');
