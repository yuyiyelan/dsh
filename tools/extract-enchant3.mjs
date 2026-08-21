// 精确提取 sheet11 附魔效果对照(D列原文 E列翻译)，按单元格对象访问
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
  const cells = {};
  const cRe = /<c r="([A-Z]+)(\d+)"(?:[^>]*t="(\w+)")?[^>]*>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g;
  let c;
  while ((c = cRe.exec(m[1]))) {
    const [, col, , type, val] = c;
    let display = val;
    if (type === 's' && val !== undefined) display = strItems[parseInt(val)] || '';
    display = display.replace(/&#10;/g, '\n').replace(/&amp;/g, '&');
    cells[col] = display;
  }
  rows.push(cells);
}

const pairs = {};
for (const r of rows) {
  const orig = (r['D'] || '').trim();
  const trans = (r['E'] || '').trim();
  if (orig && trans && orig !== trans && orig !== '效果原文') {
    if (/[ァ-ヶ一-龯]/.test(orig) && /[\u4e00-\u9fff]/.test(trans)) {
      pairs[orig] = trans.split('\n')[0];
    }
  }
}
console.log('附魔效果对照:', Object.keys(pairs).length);
Object.entries(pairs).forEach(([k, v]) => console.log(`  ${k.slice(0, 45)} -> ${v.slice(0, 45)}`));
fs.writeFileSync('E:/dsh/TSKHook/tools/enchant-clean.json', JSON.stringify(pairs, null, 1), 'utf8');
