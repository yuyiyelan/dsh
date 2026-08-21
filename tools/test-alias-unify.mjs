// Quick test: alias-based name unification for chapter text
// Uses the REAL runtime table (UnifiedNamesData.cs) so it always matches the DLL.
import fs from 'node:fs';

const cs = fs.readFileSync('E:/dsh/TSKHook/UnifiedNamesData.cs', 'utf8');
const aliasMap = new Map();
const re = /\{ "([^"]+)", "([^"]+)" \}/g;
let m;
while ((m = re.exec(cs)) !== null) {
  if (m[1] !== m[2]) aliasMap.set(m[1], m[2]);
}
console.log('aliasMap size:', aliasMap.size);
let n = 0;
for (const [a, u] of aliasMap) {
  console.log(`  ${a} => ${u}`);
  if (++n >= 20) break;
}

function applyUnifiedNames(cn) {
  if (!cn) return cn;
  let out = cn;
  // longest first (same as UnifiedNameApplier)
  const sorted = [...aliasMap.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [alias, un] of sorted) {
    if (out.includes(alias)) out = out.split(alias).join(un);
  }
  return out;
}

console.log('\n--- tests ---');
const tests = [
  ['菲欧娜会长，请多关照。', '菲奥娜会长，请多关照。'],
  ['菲欧娜（魔王觉醒）出现了！', '菲奥娜（魔王觉醒）出现了！'],
  ['莎夏同学在维纳斯旁边。', '莎夏同学在维纳斯旁边。'],
  ['小春子与奈泽麦茵同行。', '柯哈露可与奈泽麦茵同行。'],
];
for (const [inp, expected] of tests) {
  const got = applyUnifiedNames(inp);
  console.log(`${got === expected ? 'PASS' : 'FAIL'} | ${inp} -> ${got}${got !== expected ? ' (expected ' + expected + ')' : ''}`);
}
