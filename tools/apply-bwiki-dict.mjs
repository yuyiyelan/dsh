// 按 bwiki 权威对照表更新全部词典：值（中文侧）旧译名/旧称号 → bwiki 名/称号
// 原则：用户指示"不要管短名会不会误伤，只按照 bwiki 的译名来"
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'E:/dsh/TSKHook/tools/xlsx-extract';
const DICT = 'E:/dsh/TSKHook/translation_zh_Hans';

const roster = JSON.parse(fs.readFileSync(`${DIR}/权威对照表_称号名字_最终.json`, 'utf8'));
const unified = JSON.parse(fs.readFileSync(`${DIR}/unified_names_v3.json`, 'utf8'));
const kurusuta = JSON.parse(fs.readFileSync(`${DIR}/kurusuta_角色索引_全量.json`, 'utf8'));

const norm = (s) => (s || '').replace(/⟪/g, '《').replace(/⟫/g, '》').replace(/嶺/g, '岭').replace(/娅/g, '亚').replace(/西里昂/g, '希里昂').replace(/[の的\s]/g, '');
const stripForm = (s) => (s || '').replace(/（[^）]*）|\([^)]*\)|《[^》]*》|⟪[^⟫]*⟫/g, '').trim();

// ---- 构建 旧译名 → bwiki 名 ----
const pairs = new Map(); // 旧译名 -> bwiki名（含归一化 key 记录，防止自我替换）
const addPair = (old, bwiki) => {
  if (!old || !bwiki) return;
  const o = old.trim();
  if (o === bwiki) return;
  if (norm(o) === norm(bwiki)) return; // 归一化后相同（仅符号/繁简差异）→ 无需替换
  // 保护：无后缀旧值 → 带后缀目标（把本体名全局替换成形态名，系统性错误方向）→ 跳过
  if (stripForm(o) === o && stripForm(bwiki) !== bwiki) return;
  // 特例：斯特拉→百可花 改用正则（避免把 阿斯特拉(アステラ怪物) 回环成 阿百可花）
  if (o === '斯特拉' && bwiki === '百可花') { specialPairs.push([o, bwiki]); return; }
  pairs.set(o, bwiki);
};
const specialPairs = []; // 需要正则保护的替换对

// 1) unified 旧值 -> bwiki 名（按日文名桥，保留形态后缀）
const jpToBwiki = new Map(); // 日文 base -> bwiki 名 base
const jpFullToBwiki = new Map(); // 完整日文名 -> 完整 bwiki 名
for (const r of roster) {
  if (!r.jp) continue;
  jpFullToBwiki.set(r.jp, r.name);
  const base = stripForm(r.jp);
  if (!jpToBwiki.has(base)) jpToBwiki.set(base, stripForm(r.name));
}
for (const [jp, cn] of Object.entries(unified.names || {})) {
  // 精确匹配（完整日文名含形态后缀）→ 完整 bwiki 名
  const bwikiFull = jpFullToBwiki.get(jp);
  if (bwikiFull) { addPair(cn, bwikiFull); continue; }
  // base 匹配 → 保留旧值中的形态后缀
  const base = stripForm(jp);
  const bwiki = jpToBwiki.get(base);
  if (bwiki) {
    const suffix = cn.slice(stripForm(cn).length);
    addPair(cn, bwiki + suffix);
  }
}
// 2) kurusuta 社区译名 -> bwiki 名
const jpToCnFirst = new Map();
for (const k of kurusuta) {
  if (!k.cn) continue;
  const first = k.cn.split('/')[0].replace(/（[^）]*）|\([^)]*\)|《[^》]*》/g, '').trim();
  if (!jpToCnFirst.has(k.name)) jpToCnFirst.set(k.name, first);
}
for (const [jp, cn] of jpToCnFirst) {
  const bwiki = jpToBwiki.get(stripForm(jp));
  if (bwiki) addPair(cn, bwiki);
}
// 3) 已知错误名 -> bwiki 名（手动，依据权威对照表）
const MANUAL = {
  '雷雷幸': '幸', '雷幸': '幸', // サチ → 幸
  '莉普尔露': '莉普尔', '莉普尔尔': '莉普尔', '碧翠丝': '贝阿朵莉丝', '莉莉亚': '莉莉娅',
  '安洁': '安朱', '布特拉': '普特拉', '紫乃': '希诺', '狄拉克': '迪拉克',
  '吉古': '齐格', '希格': '齐格', '琪莉卡': '琪丽卡', '贾桂琳': '杰奎琳',
  '古洛莉亚': '格洛丽亚', '柯哈露可': '小春子', '帕特露': '帕提尔',
  '希露比': '希尔薇', '蕾缇西娅': '蕾蒂西亚', '露涅娅': '露妮娅',
  '玛托伊': '玛托依', '克洛托': '库洛特', '优莉': '尤莉', '美奈子': '米涅可',
  '彩花': '伊吕波', '镜流': '静流', '库莘': '空贤', '菲欧娜': '菲奥娜',
  '洛洛特': '萝萝特', '芙莉希': '菲莉希', '瓦乐莉': '巴蕾莉',
  '朱丽尔特': '朱丽叶特', '特留法依娜': '特里菲娜', '维斯特丽亚': '威斯缇利娅',
  '菲尼艾尔': '菲妮艾尔', '杰克利努': '杰奎琳', '罗库纱娜': '罗克姗娜',
  '爱思特露': '艾斯提尔', '帕露米尔': '帕鲁米埃', '英格丽德': '英格丽特',
  '希尔忒欧娜': '希露迪欧涅', '伊克西利翁': '伊克希里昂', '艾斯梅拉露达': '艾丝梅拉妲',
  '爱尔戴丽泽': '艾尔狄丽洁', '莉可琳菲娅': '莉可林菲娅', '贝尔特丽丝': '贝阿朵莉丝',
  '玛古达蕾娜': '玛格妲蕾娜', '夏露蕾努': '夏蕾努', '赛西娅': '塞西亚',
  '尤里斯': '尤利斯', '希佑': '希祐', '赛娜里': '赛娜丽',
  '瑟多纳': '塞德娜', '伊妮修': '伊妮什', '特莉莎': '特莉夏', '拉特耶': '拉缇耶',
  '莉普露': '莉普尔', '托瓦老师': '永远老师', '夏珑': '莎隆', '莎兰': '莎朗',
  '修蒂蕾': '施蒂勒', '璃诺': '莉诺', '梅露艾尔': '梅尔艾尔', '美游': '缪',
  // 非角色名误译（依据词典实际使用/音译）
  '雅尔莫': '阿尔莫', // アルモ（阿尔莫塔赫尔昵称）
  '阿百可花': '阿斯特拉', // アステラ（怪物名，误拆 ステラ=百可花）
  '露维妮': '露薇涅', // ルヴィネ 变体
  '莉莉雅': '莉莉娅', // リーリア 变体
};
for (const [o, n] of Object.entries(MANUAL)) addPair(o, n);

// ---- 固定顺序的冲突对（子串相关，必须按序执行）----
const ORDERED = [
  ['雷雷幸', '幸'], ['雷幸', '幸'], // 长名先（雷幸 是 雷雷幸 子串）
  ['莉莉亚', '莉莉娅'], // 单对，无冲突
];
for (const [o, n] of ORDERED) pairs.delete(o);

// 其余按长度降序（长名优先，减少短名误伤；用户已授权不管误伤）
const sorted = [...pairs.entries()].sort((a, b) => b[0].length - a[0].length);
const allPairs = [...ORDERED, ...sorted];

console.log('替换对总数:', allPairs.length);
console.log('\n=== 替换对样例（前 40）===');
for (const [o, n] of allPairs.slice(0, 40)) console.log(`  ${o} → ${n}`);

// ---- 执行替换（只替换值，键不动）----
let totalFiles = 0, totalRepl = 0;
const fileStats = [];
for (const f of fs.readdirSync(DICT).filter((x) => x.endsWith('.json'))) {
  const p = path.join(DICT, f);
  let d;
  try { d = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
  let changed = false, repl = 0;
  for (const [k, v] of Object.entries(d)) {
    let nv = v;
    for (const [oldS, newS] of allPairs) {
      if (nv.includes(oldS)) {
        nv = nv.split(oldS).join(newS);
        repl++;
        changed = true;
      }
    }
    // 正则保护对（负向后顾，避免回环）
    for (const [oldS, newS] of specialPairs) {
      const re = new RegExp(`(?<!阿)${oldS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      const cnt = (nv.match(re) || []).length;
      if (cnt) { nv = nv.replace(re, newS); repl += cnt; changed = true; }
    }
    if (changed) d[k] = nv;
  }
  if (changed) {
    fs.writeFileSync(p, JSON.stringify(d), 'utf8');
    totalFiles++;
    totalRepl += repl;
    fileStats.push([f, repl]);
  }
}
console.log(`\n更新文件: ${totalFiles}, 总替换: ${totalRepl}`);
console.log('\n=== 替换最多文件（前 15）===');
for (const [f, c] of fileStats.sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${c} 处  ${f}`);

// ---- --cs 模式：处理 C# 源码里的旧译名（UiDict*/UnifiedNames 值侧）----
if (process.argv.includes('--cs')) {
  const csFiles = ['UiDictBatch.cs', 'UiDictExt.cs', 'UiDictTask.cs', 'UnifiedNames.cs'];
  for (const f of csFiles) {
    const p = path.join(import.meta.dirname, '..', f);
    if (!fs.existsSync(p)) { console.log('跳过(不存在):', f); continue; }
    let text = fs.readFileSync(p, 'utf8');
    let repl = 0;
    for (const [oldS, newS] of allPairs) {
      if (text.includes(oldS)) {
        const cnt = (text.match(new RegExp(oldS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        text = text.split(oldS).join(newS);
        repl += cnt;
      }
    }
    for (const [oldS, newS] of specialPairs) {
      const re = new RegExp(`(?<!阿)${oldS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      const cnt = (text.match(re) || []).length;
      if (cnt) { text = text.replace(re, newS); repl += cnt; }
    }
    if (repl) {
      fs.writeFileSync(p, text, 'utf8');
      console.log(`${f}: ${repl} 处替换`);
    } else {
      console.log(`${f}: 无变化`);
    }
  }
}
