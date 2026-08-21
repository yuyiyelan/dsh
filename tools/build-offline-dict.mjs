// Build offline Simplified-Chinese dictionary package:
// 1. download every component (2618) zh_Hant JSON
// 2. convert values to Simplified Chinese using the same OpenCC tables as the plugin
// 3. write BepInEx/plugins/translation_zh_Hans/{names,subnames,<chapter>}.json
import https from 'node:https';
import fs from 'node:fs';

const OUT = 'E:/dsh/TSKHook/translation_zh_Hans';
fs.mkdirSync(OUT, { recursive: true });

// ---- load OpenCC tables (shared with gen-han-converter.mjs) ----
const DIR = 'E:/dsh/TSKHook/tools/opencc-data';
function parseDict(file, sep = '\t') {
  const lines = fs.readFileSync(`${DIR}/${file}`, 'utf8').split('\n');
  const map = new Map();
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split(sep).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    map.set(parts[0], parts.slice(1));
  }
  return map;
}
const chars = parseDict('TSCharacters.txt');
const tsPhrases = parseDict('TSPhrases.txt');
const twPhrases = parseDict('TWPhrases.txt');
// NOTE: TWVariantsRevPhrases is intentionally NOT loaded — Simplified->Traditional
// direction would corrupt the map (e.g. 什么 => 什麼).

// manual TW -> CN overrides (same list as in the plugin generator)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const manual = JSON.parse(fs.readFileSync('E:/dsh/TSKHook/tools/opencc-data/manual_tw_cn.json', 'utf8'));

const phraseMap = new Map();
for (const [tw, cn] of Object.entries(manual)) phraseMap.set(tw, cn);
for (const [cn, twList] of twPhrases) for (const tw of twList) if (!phraseMap.has(tw)) phraseMap.set(tw, cn);
// TWVariantsRevPhrases intentionally excluded (Simplified -> Traditional would corrupt the map)
for (const [tw, cnList] of tsPhrases) if (!phraseMap.has(tw)) phraseMap.set(tw, Array.isArray(cnList) ? cnList[0] : cnList);

function toSimplified(text) {
  if (!text) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    let matched = false;
    const maxLen = Math.min(6, text.length - i);
    for (let len = maxLen; len >= 2; len--) {
      const key = text.substr(i, len);
      if (phraseMap.has(key)) {
        const val = phraseMap.get(key);
        if (val === key) continue; // identity: fall through to char conversion
        out += val; i += len; matched = true; break;
      }
    }
    if (matched) continue;
    const ch = text[i];
    out += chars.has(ch) ? String(chars.get(ch)).split(' ')[0] : ch;
    i++;
  }
  return out;
}

function get(url, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

// rate-limited fetch with retry on 429
async function fetchDict(slug) {
  const url = `https://translation.lolida.best/download/tsk/${slug}/zh_Hant/?format=json`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await get(url);
    if (r.status === 200) {
      try { return JSON.parse(r.body); } catch (e) { return null; }
    }
    if (r.status === 429) {
      const wait = 3000 * attempt + Math.random() * 2000;
      await new Promise((res) => setTimeout(res, wait));
      continue;
    }
    return null;
  }
  return null;
}

const slugs = JSON.parse(fs.readFileSync('E:/dsh/TSKHook/tools/xlsx-extract/all_components.json', 'utf8'));
console.log('components to fetch:', slugs.length);

// per-component files (chapters etc.)
let ok = 0, fail = 0;
const special = {}; // names, subnames, slang, glossary -> merged separately
const skipped = new Set(['glossary']); // tbx, not json

for (let i = 0; i < slugs.length; i++) {
  const slug = slugs[i];
  if (skipped.has(slug)) { console.log(`skip ${slug}`); continue; }
  const outFile = `${OUT}/${slug}.json`;
  if (fs.existsSync(outFile) && fs.statSync(outFile).size > 2) {
    ok++;
    continue;
  }
  try {
    const dict = await fetchDict(slug);
    if (!dict) { fail++; console.log(`FAIL ${slug}`); continue; }
    const converted = {};
    for (const [k, v] of Object.entries(dict)) converted[k] = toSimplified(v);
    if (slug === 'tsk_name' || slug === 'tsk_subname' || slug === 'slang') {
      special[slug] = converted;
    } else {
      fs.writeFileSync(outFile, JSON.stringify(converted), 'utf8');
    }
    ok++;
    if (i % 25 === 0) console.log(`progress ${i}/${slugs.length} ok=${ok} fail=${fail}`);
    await new Promise((res) => setTimeout(res, 1000));
  } catch (e) {
    fail++;
    console.log(`ERR ${slug}: ${e.message}`);
  }
}
console.log(`DONE ok=${ok} fail=${fail}`);

// merged name files
const names = { ...(special.tsk_name || {}), ...(special.slang || {}) };
fs.writeFileSync(`${OUT}/names.json`, JSON.stringify(names), 'utf8');
fs.writeFileSync(`${OUT}/subnames.json`, JSON.stringify(special.tsk_subname || {}), 'utf8');
console.log('names.json:', Object.keys(names).length, 'subnames.json:', Object.keys(special.tsk_subname || {}).length);

// repair pass: re-run toSimplified over every value (idempotent) so identity
// phrases (e.g. 參加者 => 參加者) get their chars converted properly
let repaired = 0;
for (const f of fs.readdirSync(OUT)) {
  if (!f.endsWith('.json')) continue;
  const p = `${OUT}/${f}`;
  const dict = JSON.parse(fs.readFileSync(p, 'utf8'));
  let changed = false;
  for (const k of Object.keys(dict)) {
    const v = toSimplified(dict[k]);
    if (v !== dict[k]) { dict[k] = v; changed = true; }
  }
  if (changed) { fs.writeFileSync(p, JSON.stringify(dict), 'utf8'); repaired++; }
}
console.log('repaired files:', repaired);

// summary
const files = fs.readdirSync(OUT);
let total = 0;
for (const f of files) total += fs.statSync(`${OUT}/${f}`).size;
console.log('files:', files.length, 'total size:', (total / 1024 / 1024).toFixed(1), 'MB');
