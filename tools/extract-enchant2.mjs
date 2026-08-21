// 精确提取 sheet11 附魔表的 "效果原文 | 翻译" 两列
// 表头: 可生效对象 | 图标 | 效果原文 | 翻译 | 评价 | 数值范围
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

// 找表头行: 含"效果原文"和"翻译"的列位置
let headerRow = null, colOrig = null, colTrans = null;
for (const r of rows) {
  const disp = r.map((c) => c.display);
  if (disp.includes('效果原文') && disp.includes('翻译')) {
    headerRow = r;
    colOrig = r.find((c) => c.display === '效果原文').col;
    colTrans = r.find((c) => c.display === '翻译').col;
    break;
  }
}
console.log('表头行找到:', headerRow ? `效果原文列=${colOrig}, 翻译列=${colTrans}` : '未找到');

if (headerRow) {
  const pairs = {};
  const colIdx = (col) => col.charCodeAt(0) - 'A'.charCodeAt(0);
  const oi = colIdx(colOrig), ti = colIdx(colTrans);
  for (const r of rows) {
    if (r === headerRow) continue;
    const orig = r[oi]?.display?.trim();
    const trans = r[ti]?.display?.trim();
    if (orig && trans && orig !== trans && /[ァ-ヶ一-龯]/.test(orig) && /[\u4e00-\u9fff]/.test(trans)) {
      pairs[orig] = trans.split('\n')[0];
    }
  }
  console.log('附魔效果对照:', Object.keys(pairs).length);
  Object.entries(pairs).slice(0, 50).forEach(([k, v]) => console.log(`  ${k.slice(0, 45)} -> ${v.slice(0, 45)}`));
  fs.writeFileSync('E:/dsh/TSKHook/tools/enchant-clean.json', JSON.stringify(pairs, null, 1), 'utf8');
}
