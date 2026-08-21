// Generates UnifiedNamesData.cs from the authoritative bwiki roster:
// alias -> unified name (story/UI consistency) + CorrectNames (name bar overrides).
import fs from 'node:fs';
import path from 'node:path';

const XDIR = 'E:/dsh/TSKHook/tools/xlsx-extract';
const DIR = 'E:/dsh/TSKHook/tools/opencc-data';
const roster = JSON.parse(fs.readFileSync(`${XDIR}/权威对照表_称号名字_最终.json`, 'utf8'));
const tskNameRaw = JSON.parse(fs.readFileSync(`${XDIR}/tsk_name.json`, 'utf8'));
const tskSubRaw = JSON.parse(fs.readFileSync(`${XDIR}/tsk_subname.json`, 'utf8'));

const stripForm = (s) => (s || '').replace(/（[^）]*）|\([^)]*\)|《[^》]*》|⟪[^⟫]*⟫/g, '').trim();
const norm = (s) => (s || '').replace(/⟪/g, '《').replace(/⟫/g, '》').replace(/嶺/g, '岭').replace(/娅/g, '亚').replace(/西里昂/g, '希里昂').replace(/[の的\s]/g, '');

// ---- simplified converter (same tables as plugin) ----
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

// ---- authoritative mapping from roster ----
// jp(base) -> bwiki name(base)；完整 jp -> 完整 bwiki name
const unifiedBase = new Map();
const unifiedFull = new Map();
for (const r of roster) {
  if (!r.jp) continue;
  if (!unifiedFull.has(r.jp)) unifiedFull.set(r.jp, r.name);
  const b = stripForm(r.jp);
  if (!unifiedBase.has(b)) unifiedBase.set(b, stripForm(r.name));
}
// 日文汉字 → 简体（后缀用：覚醒→觉醒、羅刹→罗刹 等）
const JP_TO_SIMPLE = { '覚': '觉', '羅': '罗', '姫': '姬', '竜': '龙', '撃': '击', '戦': '战', '壊': '坏', '帯': '带', '島': '岛', '関': '关', '広': '广', '園': '园', '絵': '绘', '軽': '轻', '続': '续', '縦': '纵', '横': '横', '専': '专', '従': '从', '仮': '假', '価': '价', '検': '检', '険': '险', '験': '验', '権': '权', '歓': '欢', '観': '观', '拡': '扩', '択': '择', '挙': '举', '劇': '剧', '決': '决', '潔': '洁', '件': '件', '券': '券', '県': '县', '厳': '严', '顕': '显', '懇': '恳', '墾': '垦', '込': '込', '国': '国', '黒': '黑', '穀': '谷', '獄': '狱', '酷': '酷', '済': '济', '際': '际', '斎': '斋', '剤': '剂', '歳': '岁', '財': '财', '災': '灾', '砕': '碎', '砲': '炮', '祭': '祭', '菜': '菜', '蔵': '藏', '臓': '脏', '艶': '艳', '蘇': '苏', '薬': '药', '覧': '览', '藍': '蓝', '欄': '栏', '郎': '郎', '朗': '朗', '廊': '廊', '楼': '楼', '漏': '漏', '籠': '笼', '録': '录', '麓': '麓', '論': '论', '和': '和', '話': '话', '惑': '惑', '枠': '枠', '湾': '湾', '腕': '腕', '師': '师', '聖': '圣', '薔': '蔷', '薇': '薇', '騎': '骑', '馬': '马', '鳥': '鸟', '魚': '鱼', '塩': '盐', '歯': '齿', '齢': '龄', '暦': '历', '歴': '历', '麗': '丽', '雫': '雫', '零': '零', '霊': '灵', '隷': '隶' };
const jpSimp = (s) => (s || '').split('').map((c) => JP_TO_SIMPLE[c] || c).join('');

// bwiki 页面自身写法不一致时的手动优先写法（日文名 -> 正确 bwiki 名）
const JP_NAME_PREF = {
  'イクシリオン': '伊克希里昂', // bwiki 主体(2/3页)用希；仅"健全的海上休闲"页用西
  'ソフィア': '索菲亚', // bwiki 主体(3/4页)用亚；仅"新春加速器"页用娅
};
const bwikiNameOf = (jp) => {
  const pref = JP_NAME_PREF[jp];
  if (pref) return pref;
  const full = unifiedFull.get(jp);
  if (full) return full;
  const base = unifiedBase.get(stripForm(jp));
  if (!base) return '';
  const suffix = jp.slice(stripForm(jp).length);
  return base + jpSimp(suffix); // 日文汉字后缀转简体（覚醒→觉醒、羅刹→罗刹）
};

// ---- alias map: tsk_name/tsk_subname translations that differ from bwiki ----
const aliasMap = new Map();
for (const [jp, cn] of Object.entries({ ...tskNameRaw, ...tskSubRaw })) {
  const bw = bwikiNameOf(jp);
  if (!bw) continue;
  const cnS = toSimplified(cn);
  if (cnS && norm(cnS) !== norm(bw)) aliasMap.set(cnS, bw);
}

// ---- manual CN-variant fixes (typos / AI-translation variants -> bwiki name) ----
const MANUAL_CN_ALIASES = {
  '维娜斯': '维纳斯',
  '塞菈': '塞拉',
  '库洛托': '库洛特',
  '克洛托': '库洛特',
  '瑠璃艾儿': '露莉艾尔',
  '玛托伊': '玛托依',
  '优莉': '尤莉',
  '托娃老师': '托瓦老师',
  '永远老师': '托瓦老师',
  '託娃老師': '托瓦老师',
  '夏珑': '莎隆',
  '小春子': '柯哈露可',
  '梅露艾尔': '梅尔艾尔',
  '雷幸': '幸',
  '雷雷幸': '幸',
  '蕾米卡': '雷米卡',
  '希佑': '希祐',
  '英格丽德': '英格丽特',
  '美游': '缪',
  '库莘': '空贤',
  '彩花': '伊吕波',
  '璃诺': '莉诺',
  '洛洛特': '萝萝特',
  '莎兰': '莎朗',
  '玛古达蕾娜': '玛格妲蕾娜',
  '夏露蕾努': '夏蕾努',
  '维斯特丽亚': '威斯缇利娅',
  '赛娜里': '赛娜丽',
  '希尔忒欧娜': '希露迪欧涅',
  '伊克西利翁': '伊克希里昂',
  '伊妮修': '伊妮什',
  '菲尼艾尔': '菲妮艾尔',
  '艾斯梅拉露达': '艾丝梅拉妲',
  '瑟多纳': '塞德娜',
  '尤里斯': '尤利斯',
  '爱尔戴丽泽': '艾尔狄丽洁',
  '特莉莎': '特莉夏',
  '莉普露': '莉普尔',
  '拉特耶': '拉缇耶',
  '赛西娅': '塞西亚',
  '帕露米尔': '帕鲁米埃',
  '特留法依娜': '特里菲娜',
  '帕特露': '帕提尔',
  '芙莉希': '菲莉希',
  '瓦乐莉': '巴蕾莉',
  '朱丽尔特': '朱丽叶特',
  '杰克利努': '杰奎琳',
  '希露比': '希尔薇',
  '修蒂蕾': '施蒂勒',
  '罗库纱娜': '罗克姗娜',
  '贝尔特丽丝': '贝阿朵莉丝',
  '梅特欧拉': '梅忒欧拉',
  '美奈子': '米涅可',
  '爱思特露': '艾斯提尔',
  '蕾缇西娅': '蕾蒂西亚',
  '莉可琳菲娅': '莉可林菲娅',
  '镜流': '静流',
  '露涅娅': '露妮娅',
  '乌鲁斯拉': '乌尔斯拉',
  '菲欧娜': '菲奥娜',
  '莉莉雅': '莉莉娅',
  '露维妮': '露薇涅',
  '雅尔莫': '阿尔莫',
  '碧翠丝': '贝阿朵莉丝',
  '紫乃': '希诺',
  '安洁': '安朱',
  '布特拉': '普特拉',
  '希格': '齐格',
  '贾桂琳': '杰奎琳',
  '古洛莉亚': '格洛丽亚',
  '莉莉亚': '莉莉娅',
  '莉普尔露': '莉普尔',
  '莉普尔尔': '莉普尔', // AI 幻觉变体（リップル 多写"尔"）
  '莉普尔露普': '莉普尔普', // リプるん 昵称的 AI 变体
  // ---- AI 翻译常见误译 -> bwiki 权威名 (AutoTranslate 结果统一) ----
  '萨莎': '莎夏',
  '库申': '空贤',
  '黄泉': '悠米',
  '吉格': '齐格',
  '美音子': '米涅可',
  '日代': '希祐',
  '静叶': '静羽',
  '贝阿特丽斯': '贝阿朵莉丝',
  '樱草': '普莉姆拉',
  '小幸': '幸',
  '内泽玛因': '奈泽麦茵',
  '莎伦': '莎隆',
  '玛格达莱娜': '玛格妲蕾娜',
  '艾丝黛尔': '艾斯提尔',
  '维丝特莉亚': '威斯缇利娅',
  '紫藤': '威斯缇利娅',
  '阿妮玛': '阿尼玛',
  '马哈穆特': '玛哈姆特',
  '特露菲娜': '特里菲娜',
  '采齐莉耶': '塞西莉亚',
  '拉蒂耶': '拉缇耶',
  '帕尔米耶': '帕鲁米埃',
  '克萨娜': '琪莎娜',
  '安珠': '安朱',
  '梅泰奥拉': '梅忒欧拉',
  '雾香': '琪丽卡',
  '七花': '奈奈香',
  '艾尔德莉泽': '艾尔狄丽洁',
  '罗克萨娜': '罗克姗娜',
  '米尔菲': '米露菲',
  '枫': '梅普露',
  '希兹露': '静流',
  '蕾蒂希娅': '蕾蒂西亚',
  '特蕾吉安娜': '特雷吉安娜',
  '珠宝': '朱莉',
  '涟漪': '莉普尔',
  '伊克西利昂': '伊克希里昂',
  '索菲娅': '索菲亚',
  '狄拉克': '迪拉克',
  '阿百可花': '阿斯特拉',
};
for (const [alias, un] of Object.entries(MANUAL_CN_ALIASES)) aliasMap.set(alias, un);

// ---- 安全过滤：防止别名键破坏正确译名 ----
// 1) 2 字及以下键全部丢弃（"莉普"会把"莉普尔"变"莉普尔尔"；"珠宝""紫藤""涟漪"
//    会误伤正常词；"莎朗"是 サラン 的 bwiki 名却被 シャロン 的旧译名占用）
// 2) 键是任何 bwiki 权威名（归一化后）→ 丢弃（正确名不能当别名键，如"莎朗"）
const bwikiNames = new Set();
for (const r of roster) {
  if (r.name) bwikiNames.add(norm(r.name));
}
for (const [k, v] of [...aliasMap]) {
  if (k.length < 3) aliasMap.delete(k);
  else if (bwikiNames.has(norm(k))) aliasMap.delete(k);
}

// ---- CorrectNames: Japanese name -> bwiki name (overrides wrong names.json entries) ----
const correctNames = {};
for (const [jp, cn] of Object.entries({ ...tskNameRaw, ...tskSubRaw })) {
  const bw = bwikiNameOf(jp);
  if (!bw) continue;
  const cnS = toSimplified(cn);
  if (cnS && norm(cnS) !== norm(bw)) correctNames[jp] = bw;
}
// 词典正文已统一的旧译名修正（名字栏覆盖）
const CORRECT_EXTRA = {
  'ジグ': '齐格',
  'エンジュ': '安朱',
  'シノ': '希诺',
  'プトラ': '普特拉',
  'ディーラック': '迪拉克',
  'アステラ': '阿斯特拉',
};
for (const [jp, cn] of Object.entries(CORRECT_EXTRA)) correctNames[jp] = cn;

const entries = [...aliasMap.entries()].sort((a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0]));
const correctEntries = Object.entries(correctNames).sort((a, b) => a[0].localeCompare(b[0]));

const lines = [];
lines.push('// Auto-generated by tools/gen-unified-names-data.mjs');
lines.push('// Alias -> unified name mapping so story/UI translations match the name bar.');
lines.push('using System.Collections.Generic;');
lines.push('');
lines.push('namespace TSKHook;');
lines.push('');
lines.push('public static class UnifiedNamesData');
lines.push('{');
lines.push('    public static readonly Dictionary<string, string> AliasToUnified = new()');
lines.push('    {');
for (const [alias, un] of entries) {
  lines.push(`        { ${JSON.stringify(alias)}, ${JSON.stringify(un)} },`);
}
lines.push('    };');
lines.push('');
lines.push('    /// <summary>Japanese name -> correct Simplified translation (overrides wrong names.json entries).</summary>');
lines.push('    public static readonly Dictionary<string, string> CorrectNames = new()');
lines.push('    {');
for (const [jp, cn] of correctEntries) {
  lines.push(`        { ${JSON.stringify(jp)}, ${JSON.stringify(cn)} },`);
}
lines.push('    };');
lines.push('}');
lines.push('');
fs.writeFileSync(path.join(import.meta.dirname, '..', 'UnifiedNamesData.cs'), lines.join('\n'), 'utf8');
console.log('Wrote UnifiedNamesData.cs: aliases=' + entries.length + ', correctNames=' + correctEntries.length);
for (const [a, u] of entries.slice(0, 30)) console.log(' ', a, '->', u);
console.log('\n=== CorrectNames 样例 ===');
for (const [jp, cn] of correctEntries.slice(0, 20)) console.log(' ', jp, '->', cn);
