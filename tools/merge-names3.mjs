// Merge all name sources (v3): sheet2 manual > biliwiki v3 matched > platform fallback
import fs from 'node:fs';

const DIR = 'E:/dsh/TSKHook/tools/xlsx-extract';

const sheet2 = JSON.parse(fs.readFileSync(`${DIR}/sheet2_jp_cn.json`, 'utf8'));
const matched3 = JSON.parse(fs.readFileSync(`${DIR}/matched_names3.json`, 'utf8'));
const tskName = JSON.parse(fs.readFileSync(`${DIR}/tsk_name.json`, 'utf8'));
const tskSub = JSON.parse(fs.readFileSync(`${DIR}/tsk_subname.json`, 'utf8'));

// ---- full OpenCC-based converter (same tables as the plugin) ----
function loadDict(file, sep = '\t') {
  const lines = fs.readFileSync(`${DIR}/../opencc-data/${file}`, 'utf8').split('\n');
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
const TSChars = loadDict('TSCharacters.txt');
const TSPhrases = loadDict('TSPhrases.txt');
const TWPhrases = loadDict('TWPhrases.txt');
const TWRevPhrases = loadDict('TWVariantsRevPhrases.txt');
const manualTW = JSON.parse(fs.readFileSync(`${DIR}/../opencc-data/manual_tw_cn.json`, 'utf8'));

const fullPhraseMap = new Map();
for (const [tw, cn] of Object.entries(manualTW)) fullPhraseMap.set(tw, cn);
for (const [cn, twList] of TWPhrases) for (const tw of twList) if (!fullPhraseMap.has(tw)) fullPhraseMap.set(tw, cn);
for (const [tw, cnList] of TWRevPhrases) if (!fullPhraseMap.has(tw)) fullPhraseMap.set(tw, Array.isArray(cnList) ? cnList[0] : cnList);
for (const [tw, cnList] of TSPhrases) if (!fullPhraseMap.has(tw)) fullPhraseMap.set(tw, Array.isArray(cnList) ? cnList[0] : cnList);

function twToCn(s) {
  if (!s) return s;
  let out = '';
  let i = 0;
  while (i < s.length) {
    let matched = false;
    const maxLen = Math.min(6, s.length - i);
    for (let len = maxLen; len >= 2; len--) {
      const key = s.substr(i, len);
      if (fullPhraseMap.has(key)) {
        const val = fullPhraseMap.get(key);
        if (val === key) continue; // identity: fall through to char conversion
        out += val; i += len; matched = true; break;
      }
    }
    if (matched) continue;
    const ch = s[i];
    out += TSChars.has(ch) ? String(TSChars.get(ch)).split(' ')[0] : ch;
    i++;
  }
  return out;
}

// qualifier regex for limited-edition names
const QUALIFIER = /^(新春|泳装|万圣|圣诞|花嫁|幼|限定|活动|水着|新年|正月)/;

function hasSuffixKey(jp) {
  return /[《》（）()]/.test(jp);
}

function cnHasQualifier(cn) {
  const primary = cn.split('/')[0].trim();
  return QUALIFIER.test(primary);
}

// ---- build unified ----
const unified = {};
const aliases = {};
const notes = {};

// 1) base: platform tsk_name (converted)
for (const [jp, tw] of Object.entries(tskName)) {
  unified[jp] = twToCn(tw);
  notes[jp] = 'platform';
}
for (const [jp, tw] of Object.entries(tskSub)) {
  unified[jp] = twToCn(tw);
  notes[jp] = 'platform';
}

// 2) biliwiki v3 matched: for each JP name keep only the HIGHEST-priority
//    source row (plain exact > bracket exact > loose-plain > loose-bracket),
//    so variant rows can never overwrite the base character name.
const srcRank = { plain: 0, bracket: 1, 'loose-plain': 2, 'loose-bracket': 3 };
const bestByJp = new Map(); // jp -> {row, rank}
for (const m of matched3) {
  const rank = srcRank[m.source] ?? 9;
  const prev = bestByJp.get(m.name);
  if (!prev || rank < prev.rank) {
    bestByJp.set(m.name, { row: m, rank });
  }
}
for (const { row: m } of bestByJp.values()) {
  const jp = m.name;
  if (!unified[jp]) continue;
  // m.cn from v3 is always the plain extracted name (no bracket prefix)
  if (!cnHasQualifier(m.cn)) {
    unified[jp] = m.cn;
    notes[jp] = 'biliwiki-' + m.source;
  }
}

// 3) sheet2 manual overrides (highest priority for base keys w/o qualifier; any for suffixed keys)
for (const m of sheet2) {
  const parts = m.cn.split('/').map((p) => p.trim()).filter(Boolean);
  const primary = parts[0] || m.cn;
  const jp = m.jp;
  if (hasSuffixKey(jp) || !cnHasQualifier(m.cn)) {
    unified[jp] = primary;
    notes[jp] = 'sheet2';
    if (parts.length > 1) aliases[jp] = parts.slice(1);
  }
}

// 4) post-process: for suffixed keys like フィオナ（魔王覚醒）, the base-name
//    prefix should match the unified base name (菲奥娜) not the raw conversion (菲欧娜).
const suffixRe = /^(.+?)[（(《](.+)[）)》]$/;
for (const [jp, cn] of Object.entries(unified)) {
  const m = jp.match(suffixRe);
  if (!m) continue;
  const baseJp = m[1];
  const suffix = m[2];
  if (!unified[baseJp]) continue;
  // base is authoritative (not platform fallback) -> rebuild prefixed name
  if (notes[baseJp] !== 'platform' && cn.startsWith(cn.slice(0, 1)) && unified[baseJp] !== cn) {
    // replace the leading portion matching the raw base translation
    const rawBase = twToCn(tskName[baseJp] ?? '');
    if (rawBase && cn.startsWith(rawBase)) {
      unified[jp] = unified[baseJp] + cn.slice(rawBase.length);
      notes[jp] = 'derived-' + notes[baseJp];
    }
  }
}

const result = { names: unified, aliases, notes };
fs.writeFileSync(`${DIR}/unified_names_v3.json`, JSON.stringify(result, null, 1), 'utf8');
console.log('unified total:', Object.keys(unified).length);
console.log('from sheet2:', Object.values(notes).filter((n) => n === 'sheet2').length);
console.log('from biliwiki:', Object.values(notes).filter((n) => n.startsWith('biliwiki')).length);
console.log('from platform:', Object.values(notes).filter((n) => n === 'platform').length);

for (const jp of ['フィオナ', 'サーシャ', 'アナ', 'ソフィア', 'アポロ', 'コハルコ', 'ヴィーナス', 'せつな', 'イレーナ', 'ユーリス', 'みんな', '女子生徒Ａ', 'フィオナ（魔王覚醒）', 'ネーゼマイン《悪戯》']) {
  console.log(`${jp} => ${unified[jp] || 'MISSING'}  [${notes[jp]}]`);
}
