// 对照：报告的不一致 vs aliasMap 覆盖 vs SKIP
import fs from 'node:fs';
const report = fs.readFileSync('E:/dsh/TSKHook/tools/name-mismatch-report.txt', 'utf8').split('\n').filter((l) => l.trim());
const aliasCs = fs.readFileSync('E:/dsh/TSKHook/UnifiedNamesData.cs', 'utf8');
const aliasSet = new Set();
const re = /\{ "([^"]+)", "([^"]+)" \}/g;
let m;
while ((m = re.exec(aliasCs)) !== null) aliasSet.add(m[1]);

console.log('报告条数:', report.length);
console.log('aliasMap 条数:', aliasSet.size);
let covered = 0, notCovered = [];
for (const line of report) {
  const [jp, tsk, names, unified] = line.split('\t');
  if (!tsk) continue;
  // tsk 译名是否在 aliasMap 中（或等于统一名）
  if (aliasSet.has(tsk) || tsk === (unified || '')) { covered++; }
  else notCovered.push({ jp, tsk, names, unified });
}
console.log('已覆盖:', covered, '| 未覆盖:', notCovered.length);
console.log('--- 未覆盖清单 ---');
for (const r of notCovered) console.log(`${r.jp} | tsk=${r.tsk} | names=${r.names ?? ''} | unified=${r.unified ?? ''}`);
