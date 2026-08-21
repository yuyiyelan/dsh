// 检查规则翻译与现有词典冲突，并合并生成新的 UiDictTask 条目
import fs from 'node:fs';

const j = JSON.parse(fs.readFileSync('E:/dsh/TSKHook/tools/nohit-rules.json', 'utf8'));
console.log('规则翻译总数:', j.length);

const taskCs = fs.readFileSync('E:/dsh/TSKHook/UiDictTask.cs', 'utf8');
const re = /\{ "((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)" \}/g;
const existing = new Map();
let m;
while ((m = re.exec(taskCs))) existing.set(m[1], m[2]);

let conflict = 0, added = 0;
const newEntries = [];
for (const [jp, cn] of j) {
  if (existing.has(jp)) {
    if (existing.get(jp) !== cn) {
      conflict++;
      console.log(`冲突: ${jp.slice(0, 40)} 旧=${existing.get(jp)} 新=${cn}`);
    }
  } else {
    added++;
    newEntries.push({ jp, cn });
  }
}
console.log(`新增: ${added}, 冲突: ${conflict}`);
fs.writeFileSync('E:/dsh/TSKHook/tools/nohit-new-entries.json', JSON.stringify(newEntries, null, 1), 'utf8');
console.log('\n=== 新增样例(前20) ===');
newEntries.slice(0, 20).forEach((e) => console.log(`  ${e.jp.slice(0, 45)} -> ${e.cn}`));
