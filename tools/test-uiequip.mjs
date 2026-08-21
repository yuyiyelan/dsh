// 验证 UiDictEquip：条目完整、无占位符、关键条目存在
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${d}`); } };

const cs = fs.readFileSync('E:/dsh/TSKHook/UiDictEquip.cs', 'utf8');
const entries = [...cs.matchAll(/\{ "((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)" \}/g)].map((m) => [m[1], m[2]]);

check('UiDictEquip 条目数 = 156', entries.length === 156, `实际 ${entries.length}`);
check('无占位符(迷惑)', !entries.some(([, v]) => v.includes('迷惑')));
check('无占位符(?)', !entries.some(([, v]) => v.includes('(?') || v.includes('？')));
check('赫拉克勒斯的大锤存在', entries.some(([k]) => k === 'ヘルクレスの大槌'));
check('雷神之锤存在', entries.some(([, v]) => v === '雷神之锤'));
check('HPアップ附魔存在', entries.some(([k, v]) => k === 'HPアップ' && v === '基础生命值提升'));
check('无重复key', new Set(entries.map(([k]) => k)).size === entries.length);

// 验证 PatchUi 接入
const pu = fs.readFileSync('E:/dsh/TSKHook/PatchUi.cs', 'utf8');
check('TranslateUi 已接入 UiDictEquip', pu.includes('UiDictEquip.Entries'));

// 验证编译产物
const dll = fs.readFileSync('E:/dsh/TSKHook/bin/Release/TSKHook.dll', 'binary');
check('DLL 含 UiDictEquip', dll.includes('UiDictEquip'));

console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail > 0 ? 1 : 0);
