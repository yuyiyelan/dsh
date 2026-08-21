// 测试6: 规则翻译质量抽查 + 优化代码产物验证
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${d}`); } };

console.log('=== 测试6a: 规则翻译质量(与现有手动翻译一致性) ===');
// 检查关键翻译是否合理(不含未翻译的日文残留)
// 从 UiDictTask.cs 提取全部条目验证(4来源合并后)
const taskCs2 = fs.readFileSync('E:/dsh/TSKHook/UiDictTask.cs', 'utf8');
const allEntries = [];
const re2 = /\{ "((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)" \}/g;
let m2;
while ((m2 = re2.exec(taskCs2))) allEntries.push([m2[1], m2[2]]);
let jpResidual = 0;
for (const [jp, cn] of allEntries) {
  // 翻译结果中不应有长片假名残留
  if (/[ァ-ヶ]{3,}/.test(cn)) { jpResidual++; if (jpResidual <= 5) console.log(`  日文残留: ${jp.slice(0, 30)} -> ${cn}`); }
}
check('UiDictTask 全部条目无日文残留', jpResidual === 0, `${jpResidual} 条`);
check('UiDictTask 条目总数 >= 500', allEntries.length >= 500, `实际 ${allEntries.length}`);

console.log('\n=== 测试6b: 优化代码在编译产物中存在 ===');
const dll = fs.readFileSync('E:/dsh/TSKHook/bin/Release/TSKHook.dll', 'binary');
// 字符串检查(简化: 方法名存在于DLL的元数据字符串堆)
const checkStr = (s) => dll.includes(s);
check('UnifiedNameApplier.ContainsAnyFirstChar 存在', checkStr('ContainsAnyFirstChar'));
check('UiCacheFontState 存在', checkStr('UiCacheFontState'));
check('NameCache 存在', checkStr('NameCache'));
check('ParseRowsSeen 存在', checkStr('ParseRowsSeen'));
check('TextAssetScanned 存在', checkStr('TextAssetScanned'));
check('SOScanned 存在', checkStr('SOScanned'));

console.log('\n=== 测试6c: 替换后词典抽样(名字统一) ===');
const dictDir = 'E:/dsh/TSKHook/translation_zh_Hans';
const ch100 = JSON.parse(fs.readFileSync(dictDir + '/ch10010011.json', 'utf8'));
let hasOld = false;
for (const v of Object.values(ch100)) {
  if (/玛托伊|优莉|托瓦老师|柯哈露可/.test(v)) { hasOld = true; break; }
}
check('ch10010011 无旧名残留', !hasOld);
const main20103 = JSON.parse(fs.readFileSync(dictDir + '/main20103.json', 'utf8'));
const mainText = JSON.stringify(main20103);
check('main20103 库洛特已生效', mainText.includes('库洛特'));
check('main20103 无克洛托', !mainText.includes('克洛托'));

console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail > 0 ? 1 : 0);
