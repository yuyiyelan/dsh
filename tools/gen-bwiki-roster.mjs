// 生成 bwiki 完整对照表：称号 → 名字（biliwiki_roles 展开）+ 日文名对应
// 输出: bwiki_称号名字对照表.md（用户格式：每行 称号\t名字，同名字多称号分行）
import fs from 'node:fs';

const DIR = 'E:/dsh/TSKHook/tools/xlsx-extract';
const wiki = JSON.parse(fs.readFileSync(`${DIR}/biliwiki_roles.json`, 'utf8'));
const { matched } = JSON.parse(fs.readFileSync(`${DIR}/roster_v2_对齐结果.json`, 'utf8'));

const extractName = (f) => { const m = f.match(/］(.+)$/); return m ? m[1].trim() : f; };
const extractTitle = (f) => { const m = f.match(/^［(.+?)］/); return m ? m[1] : ''; };

// 行: { title, name, jp(日文名，roster 对齐), star }
const rows = [];
for (const w of wiki) {
  const title = extractTitle(w.fulltext);
  const name = extractName(w.fulltext);
  // 找日文名：roster 对齐中 bwikiName+bwikiTitle 匹配
  const jpMatch = matched.find((r) => r.bwikiName === name && (r.bwikiTitle === title || (!r.bwikiTitle && !title)));
  rows.push({ title, name, jp: jpMatch ? jpMatch.jp : '', star: w.star });
}

// 按名字排序（与用户样例一致）
rows.sort((a, b) => {
  const na = a.name.replace(/[《（(⟪].*$/, '');
  const nb = b.name.replace(/[《（(⟪].*$/, '');
  const c = na.localeCompare(nb, 'zh');
  return c !== 0 ? c : a.name.localeCompare(b.name, 'zh');
});

let md = '# bwiki 角色对照表（称号 → 名字，bwiki 权威）\n\n';
md += `共 ${rows.length} 行（${new Set(rows.map((r) => r.name)).size} 个名字）\n\n`;
md += '| 称号 | 名字 | 日文名 | ★ |\n|---|---|---|---|\n';
for (const r of rows) md += `| ${r.title || '（本体）'} | ${r.name} | ${r.jp || ''} | ★${r.star} |\n`;
fs.writeFileSync(`${DIR}/bwiki_称号名字对照表.md`, md, 'utf8');

// 纯用户格式: 称号\t名字（无表头）
let plain = '';
for (const r of rows) plain += `${r.title || ''}\t${r.name}\n`;
fs.writeFileSync(`${DIR}/bwiki_称号名字对照表_纯文本.txt`, plain, 'utf8');

console.log(`已生成 ${rows.length} 行, ${new Set(rows.map((r) => r.name)).size} 个名字`);
console.log('\n=== 无称号(本体)行 ===');
for (const r of rows.filter((r) => !r.title)) console.log(`  ${r.name} (${r.jp})`);
console.log('\n=== 同名多称号组 ===');
const byName = new Map();
for (const r of rows) { if (!byName.has(r.name)) byName.set(r.name, []); byName.get(r.name).push(r.title || '（本体）'); }
for (const [n, ts] of byName) if (ts.length >= 2) console.log(`  ${n}: ${ts.join(' / ')}`);
