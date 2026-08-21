// 全量比对名字译名一致性：tsk_name / tsk_subname / names.json / unified_names_v3
import fs from 'node:fs';

const XDIR = 'E:/dsh/TSKHook/tools/xlsx-extract';
const tskName = JSON.parse(fs.readFileSync(`${XDIR}/tsk_name.json`, 'utf8'));
const tskSub = JSON.parse(fs.readFileSync(`${XDIR}/tsk_subname.json`, 'utf8'));
const unified = JSON.parse(fs.readFileSync(`${XDIR}/unified_names_v3.json`, 'utf8')).names;
const namesJson = JSON.parse(fs.readFileSync((process.env.TSK_GAME || 'C:/Path/To/Twinkle_StarKnightsX') + '/BepInEx/plugins/translation_zh_Hans/names.json', 'utf8'));

// 简化转换
const DIR = 'E:/dsh/TSKHook/tools/opencc-data';
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

const all = { ...tskName, ...tskSub };
let mismatch = 0;
const report = [];
for (const [jp, cn] of Object.entries(all)) {
  const cnS = toSimplified(cn);
  const un = unified[jp];
  const nm = namesJson[jp];
  if (!un) continue; // unified 没有的角色不参与
  const unSimplified = toSimplified(un);
  // 三方不一致？
  const sources = [];
  if (nm && nm !== cnS) sources.push(`names=${nm}`);
  if (unSimplified && unSimplified !== cnS) sources.push(`unified=${un}`);
  if (sources.length) {
    mismatch++;
    report.push({ jp, tsk: cnS, names: nm, unified: unSimplified, diff: sources.join(' ') });
  }
}
console.log('总角色条目:', Object.keys(all).length, '| 译名不一致:', mismatch);
console.log('--- 不一致清单 ---');
for (const r of report) {
  console.log(`${r.jp} | tsk=${r.tsk} | ${r.diff}`);
}
fs.writeFileSync('E:/dsh/TSKHook/tools/name-mismatch-report.txt', report.map((r) => `${r.jp}\t${r.tsk}\t${r.names ?? ''}\t${r.unified ?? ''}\t${r.diff}`).join('\n'), 'utf8');
