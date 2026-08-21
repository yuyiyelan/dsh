// 提取饰品附魔(sheet11)的 效果原文->翻译 对照
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

const xml = fs.readFileSync(DIR + '/worksheets/sheet11.xml', 'utf8');
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

console.log('sheet11 行数:', rows.length);
// 打印所有行（每行 效果原文 | 翻译 在 C/D 列附近）
const pairs = new Map();
for (const r of rows) {
  // 找 效果原文 和 翻译 列(通常相邻)
  const disp = r.map((c) => c.display);
  for (let i = 0; i < disp.length - 1; i++) {
    const a = (disp[i] || '').trim();
    const b = (disp[i + 1] || '').trim();
    if (a && b && /[ァ-ヶ一-龯]/.test(a) && /[\u4e00-\u9fff]/.test(b) && a !== b && a.length > 2 && b.length > 1) {
      if (!pairs.has(a)) pairs.set(a, b);
    }
  }
}
console.log('\n附魔效果对照:', pairs.size);
let i = 0;
for (const [jp, cn] of pairs) { if (i < 60) console.log(`  ${jp.slice(0, 50)} -> ${cn.slice(0, 50)}`); i++; }
fs.writeFileSync('E:/dsh/TSKHook/tools/enchant-pairs.json', JSON.stringify(Object.fromEntries(pairs), null, 1), 'utf8');
