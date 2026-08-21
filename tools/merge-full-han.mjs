// 合并全面汉化条目到 UiDictTask.cs
// nohit-new-entries.json = 原有308条规则 + 新碎片/技能/UI + 效果
import fs from 'node:fs';

// 已有规则条目(从当前 UiDictTask.cs 提取避免重复)
const taskCs = fs.readFileSync('E:/dsh/TSKHook/UiDictTask.cs', 'utf8');
const existing = new Map();
const re = /\{ "((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)" \}/g;
let m;
while ((m = re.exec(taskCs))) existing.set(m[1], m[2]);

// 新条目
const fullHan = JSON.parse(fs.readFileSync('E:/dsh/TSKHook/tools/full-han-entries.json', 'utf8'));
const effects = JSON.parse(fs.readFileSync('E:/dsh/TSKHook/tools/effect-entries.json', 'utf8'));

let added = 0, dup = 0;
const newEntries = [];
for (const [jp, cn] of [...fullHan, ...effects]) {
  if (existing.has(jp)) { dup++; continue; }
  newEntries.push({ jp, cn });
  added++;
}
console.log(`新增: ${added}, 重复跳过: ${dup}`);
fs.writeFileSync('E:/dsh/TSKHook/tools/nohit-new-entries.json', JSON.stringify(newEntries, null, 1), 'utf8');
console.log('已写入 nohit-new-entries.json');
// 抽样
newEntries.slice(0, 10).forEach((e) => console.log(`  ${e.jp.slice(0, 40)} -> ${e.cn}`));
