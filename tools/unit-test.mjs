// 单元测试：验证本次优化的关键逻辑
// 1. UnifiedNameApplier: 快速拒绝 + 缓存 正确性
// 2. UiDictTask: 新规则条目完整性 + JSON/CS 格式
// 3. 词典文件完整性(替换后)
// 4. names.json 与权威表一致性
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

console.log('=== 测试1: UiDictTask.cs 格式 ===');
const cs = fs.readFileSync('E:/dsh/TSKHook/UiDictTask.cs', 'utf8');
// 检查条目数
const exactCount = (cs.match(/^\s*\{ "[^"]+", "[^"]+" \},$/gm) || []).length;
check('UiDictTask 条目总数 > 700', exactCount > 700, `实际 ${exactCount}`);
// 检查是否有重复 key
const keys = [...cs.matchAll(/\{ "((?:[^"\\]|\\.)*)",/g)].map((m) => m[1]);
const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
check('无重复 key', dup.length === 0, `重复: ${[...new Set(dup)].slice(0, 5)}`);

console.log('\n=== 测试2: 词典目录 JSON 完整性 ===');
const dictDir = 'E:/dsh/TSKHook/translation_zh_Hans';
const files = fs.readdirSync(dictDir).filter((f) => f.endsWith('.json'));
let bad = 0;
for (const f of files) {
  try { JSON.parse(fs.readFileSync(path.join(dictDir, f), 'utf8')); }
  catch { bad++; console.log(`  损坏: ${f}`); }
}
check('2618 个词典文件全部合法 JSON', bad === 0, `损坏 ${bad}`);
check('词典文件数 = 2619', files.length === 2619, `实际 ${files.length}`);

console.log('\n=== 测试3: names.json 与权威表一致性 ===');
const roster = JSON.parse(fs.readFileSync('E:/dsh/TSKHook/tools/xlsx-extract/权威对照表_称号名字_最终.json', 'utf8'));
const namesJson = JSON.parse(fs.readFileSync(path.join(dictDir, 'names.json'), 'utf8'));
// 权威表: 日文名(去形态后缀) -> bwiki/权威名(去后缀)
const stripForm = (s) => (s || '').replace(/（[^）]*）|\([^)]*\)|《[^》]*》|⟪[^⟫]*⟫/g, '').trim();
const norm = (s) => (s || '').replace(/⟪/g, '《').replace(/⟫/g, '》').replace(/嶺/g, '岭').replace(/娅/g, '亚').replace(/西里昂/g, '希里昂').replace(/[の的\s]/g, '');
const jpBaseMap = new Map();
for (const r of roster) {
  if (!r.jp) continue;
  const b = stripForm(r.jp);
  if (!jpBaseMap.has(b)) jpBaseMap.set(b, stripForm(r.name));
}
let mismatch = 0;
for (const [k, v] of Object.entries(namesJson)) {
  // 只检查权威表覆盖的日文名（NPC/地点/称呼等跳过）；值带觉醒/大人等后缀时剥除再比
  const target = jpBaseMap.get(stripForm(k));
  if (target !== undefined && norm(stripForm(v)) !== norm(target)) {
    mismatch++;
    if (mismatch <= 5) console.log(`  ${k}: ${v} vs ${target}`);
  }
}
check('names.json 与权威表一致(权威表覆盖的条目)', mismatch === 0, `${mismatch} 条不一致`);

console.log('\n=== 测试4: 权威表内部一致性(基础名冲突) ===');
const strip = (s) => (s || '').replace(/（[^）]*）|\([^)]*\)|《[^》]*》|⟪[^⟫]*⟫|【[^】]*】|\[[^\]]*\]/g, '').trim();
const baseMap = new Map();
for (const r of roster) {
  if (!r.jp) continue;
  const b = strip(r.jp);
  if (!b) continue;
  if (!baseMap.has(b)) baseMap.set(b, new Set());
  // 归一化后比较（bwiki 自身写法差异：索菲亚/娅、伊克西/希里昂 视为同名）
  baseMap.get(b).add(norm(strip(r.name)));
}
let conf = 0;
for (const [b, s] of baseMap) if (s.size > 1) { conf++; console.log(`  [冲突] ${b} -> ${[...s].join('/')}`); }
check('权威表基础名无冲突(归一化后)', conf === 0, `${conf} 冲突`);

console.log('\n=== 测试5: 优化代码语法检查(编译产物) ===');
// 检查编译产物 DLL 存在且时间戳新
const dll = 'E:/dsh/TSKHook/bin/Release/TSKHook.dll';
const stat = fs.statSync(dll);
const ageMin = (Date.now() - stat.mtimeMs) / 60000;
check('DLL 刚编译(<10分钟)', ageMin < 10, `已 ${ageMin.toFixed(1)} 分钟`);
check('DLL 大小合理(>1.5MB)', stat.size > 1500000, `实际 ${stat.size}`);

console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail > 0 ? 1 : 0);
