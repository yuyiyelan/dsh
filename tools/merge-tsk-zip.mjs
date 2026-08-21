// Merges the Weblate full-project ZIP export (E:/dsh/tsk) into the plugin
// dictionary folder: zh_Hant -> Simplified, unified names, written as
// translation_zh_Hans/<component>.json.
import fs from 'node:fs';
import path from 'node:path';

const ZIP_DIR = 'E:/dsh/tsk';
const OUT = 'E:/dsh/TSKHook/translation_zh_Hans';
const DIR = 'E:/dsh/TSKHook/tools/opencc-data';
const XDIR = 'E:/dsh/TSKHook/tools/xlsx-extract';

// ---- simplified converter (same tables as plugin / complete-dict) ----
function loadDict(file, sep = '\t') {
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
const chars = loadDict('TSCharacters.txt');
const tsPhrases = loadDict('TSPhrases.txt');
const twPhrases = loadDict('TWPhrases.txt');
const manualTW = JSON.parse(fs.readFileSync(`${DIR}/manual_tw_cn.json`, 'utf8'));
const phraseMap = new Map();
for (const [tw, cn] of Object.entries(manualTW)) phraseMap.set(tw, cn);
for (const [cn, twList] of twPhrases) for (const tw of twList) if (!phraseMap.has(tw)) phraseMap.set(tw, cn);
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
        if (val === key) continue;
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

// ---- unified names alias map (from gen-unified-names-data.mjs) ----
const unified = JSON.parse(fs.readFileSync(`${XDIR}/unified_names_v3.json`, 'utf8')).names;
const tskNameRaw = JSON.parse(fs.readFileSync(`${XDIR}/tsk_name.json`, 'utf8'));
const tskSubRaw = JSON.parse(fs.readFileSync(`${XDIR}/tsk_subname.json`, 'utf8'));
const aliasMap = new Map();
for (const [jp, cn] of Object.entries({ ...tskNameRaw, ...tskSubRaw })) {
  if (!unified[jp]) continue;
  const cnS = toSimplified(cn);
  if (cnS && cnS !== unified[jp]) aliasMap.set(cnS, unified[jp]);
}
const SKIP_ALIASES = new Set([
  '蕾拉', '煌岭', '艾琳', '静羽', '英格丽德', '莉娜', '小雏',
  '紫乃', '安洁', '库莘', '碧翠丝', '贾桂琳', '百可花', '布特拉', '希格',
]);
for (const a of SKIP_ALIASES) aliasMap.delete(a);
function applyUnifiedNames(cn) {
  if (!cn) return cn;
  let out = cn;
  for (const [alias, un] of aliasMap) {
    if (!alias || !un || alias === un) continue;
    if (out.includes(alias)) out = out.split(alias).join(un);
  }
  return out;
}

// ---- merge ----
const SKIP = new Set(['glossary', 'tsk_name', 'tsk_subname', 'slang']);
let processed = 0, written = 0, skipped = 0, errors = 0, totalEntries = 0;
for (const compDir of fs.readdirSync(ZIP_DIR)) {
  const compPath = path.join(ZIP_DIR, compDir);
  if (!fs.statSync(compPath).isDirectory()) continue;
  if (SKIP.has(compDir)) { skipped++; continue; }
  const jsonPath = path.join(compPath, compDir, 'zh_Hant.json');
  if (!fs.existsSync(jsonPath)) { skipped++; continue; }
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const converted = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== 'string') continue;
      converted[k] = applyUnifiedNames(toSimplified(v));
    }
    const entries = Object.keys(converted).length;
    if (entries > 0) {
      fs.writeFileSync(path.join(OUT, `${compDir}.json`), JSON.stringify(converted), 'utf8');
      written++;
      totalEntries += entries;
    } else {
      skipped++;
    }
    processed++;
  } catch (e) {
    errors++;
    if (errors <= 5) console.log(`ERR ${compDir}: ${e.message}`);
  }
}
console.log(`合并完成: 处理=${processed} 写入=${written} 跳过=${skipped} 错误=${errors} 总词条=${totalEntries}`);
console.log(`词典目录文件数: ${fs.readdirSync(OUT).filter((f) => f.endsWith('.json')).length}`);
