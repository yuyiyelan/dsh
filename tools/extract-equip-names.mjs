// 提取装备索引(sheet12)全部装备名对照 + 装备图鉴(sheet13)
import fs from 'node:fs';

const DIR = 'E:/dsh/TSKHook/tools/xlsx-full/xl';
const shared = fs.readFileSync(DIR + '/sharedStrings.xml', 'utf8');
const strItems = [];
const siRe = /<si>(.*?)<\/si>/gs;
let m;
while ((m = siRe.exec(shared))) {
  const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let t, full = '';
  while ((t = tRe.exec(m[1]))) full += t[1];
  strItems.push(full);
}

function readSheet(file) {
  const xml = fs.readFileSync(DIR + '/worksheets/' + file, 'utf8');
  const rows = [];
  const rowRe = /<row[^>]*>(.*?)<\/row>/gs;
  while ((m = rowRe.exec(xml))) {
    const cells = [];
    const cRe = /<c r="([A-Z]+)(\d+)"(?:[^>]*t="(\w+)")?[^>]*>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g;
    let c;
    while ((c = cRe.exec(m[1]))) {
      const [, col, rowNum, type, val] = c;
      let display = val;
      if (type === 's' && val !== undefined) display = strItems[parseInt(val)] || '';
      display = display.replace(/&#10;/g, '\n').replace(/&amp;/g, '&');
      cells.push({ col, type, display });
    }
    rows.push(cells);
  }
  return rows;
}

// sheet12: 装备索引 - 每格 "日文名\n中文名\n\n类型"
const eq12 = readSheet('sheet12.xml');
console.log('sheet12 行数:', eq12.length);

// 提取 日文名/中文名 对
const pairs = new Map();
for (const row of eq12) {
  for (const cell of row) {
    const parts = cell.display.split('\n').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      // parts[0]=日文, parts[1]=中文
      if (/[ァ-ヶ一-龯]/.test(parts[0]) && /[\u4e00-\u9fff]/.test(parts[1])) {
        if (!pairs.has(parts[0])) pairs.set(parts[0], parts[1]);
      }
    }
  }
}
console.log('sheet12 装备名对照:', pairs.size);
let i = 0;
for (const [jp, cn] of pairs) { if (i < 40) console.log(`  ${jp} -> ${cn}`); i++; }

// sheet13: 装备图鉴(可能有更多细节)
const eq13 = readSheet('sheet13.xml');
console.log('\nsheet13 行数:', eq13.length);

// 输出全部到文件
const all = {};
for (const [jp, cn] of pairs) all[jp] = cn;
fs.writeFileSync('E:/dsh/TSKHook/tools/equip-names.json', JSON.stringify(all, null, 1), 'utf8');
console.log('\n已保存 equip-names.json (' + Object.keys(all).length + ' 条)');
