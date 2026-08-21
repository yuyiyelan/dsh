import fs from 'node:fs';
import path from 'node:path';
// 解析生成表
const t = fs.readFileSync('E:/dsh/TSKHook/SimToHanData.cs', 'utf8');
const phrases = new Map();
const chars = new Map();
for (const m of t.matchAll(/\{ "([^"]+)", "([^"]+)" \}/g)) phrases.set(m[1], m[2]);
for (const m of t.matchAll(/\{ '([^']+)', '([^']+)' \}/g)) chars.set(m[1], m[2]);

function convert(text) {
  const maxLen = 12;
  let sb = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    let matched = false;
    const max = Math.min(maxLen, n - i);
    for (let len = max; len >= 2; len--) {
      const sub = text.substring(i, i + len);
      if (phrases.has(sub)) { sb += phrases.get(sub); i += len; matched = true; break; }
    }
    if (!matched) { sb += chars.get(text[i]) ?? text[i]; i++; }
  }
  return sb;
}

// 读取词典目录所有 json，抽样
const dictDir = 'E:/dsh/TSKHook/translation_zh_Hans';
const files = fs.readdirSync(dictDir).filter(f => f.endsWith('.json'));
const all = [];
for (const f of files.slice(0, 20)) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dictDir, f), 'utf8'));
    for (const k of Object.keys(j)) all.push({ k, v: j[k] });
  } catch {}
}
// 也抽 names.json
try {
  const j = JSON.parse(fs.readFileSync(path.join(dictDir, 'names.json'), 'utf8'));
  for (const k of Object.keys(j)) all.push({ k, v: j[k] });
} catch {}

// 随机抽样 200 个中文值
const vals = all.filter(x => x.v && /[\u4e00-\u9fff]/.test(x.v)).map(x => x.v);
const sample = [];
for (let i = 0; i < Math.min(200, vals.length); i++) {
  sample.push(vals[Math.floor(Math.random() * vals.length)]);
}
// 去重
const uniq = [...new Set(sample)];
// 转换并统计仍含"简体独有字形"的（检查转换后是否还有常见简体独有字）
const simpOnly = new Set('队编圣尔态备亲爱极发头们这说时后里只干准电脑问问题装状态属强骑士维纳斯娅绚缀绽岚屿帅师尘尧惧慑忆忧怜恋恶恼悦悬惊懒戏战扎扑执扩扫扬抚拥拦拧拨择挂挡捡换捣捧据捷掀授掉推描提插握揭揪搜援搀搁搂搅搏摧摸摔摘撇撂撑撒撕撞撤撩播撮撰擒撼擂操擎攀攒骚馨颗颤霸韵顶项顺须顽顾顿颁颂预颅领颇颈颊频颓颖颜额颠页桥铁银钱钟饱饭饮馆伤优会体众华协单县卫厅历压厌厨厂厦汇汉汤沟浅洁济浓温满湾灾灵炉灿炼灯烧热爱牵犹独猫献环现玛琼欢兴应该学师间难对错过还样处边风飞国为义变乐东车军声实宝贵买卖运动远进静镜长门问问闻机楼');
let bad = 0;
for (const v of uniq) {
  const out = convert(v);
  // 检查转换后是否含简体独有字形（说明映射缺失）
  let missing = '';
  for (const c of out) if (simpOnly.has(c)) missing += c;
  if (missing) { bad++; console.log('MISSING-GLYPH:', v, '=>', out, '| still-simp:', missing); }
}
console.log(`\nSampled ${uniq.length} unique dict values, ${bad} with potentially missing glyphs.`);
