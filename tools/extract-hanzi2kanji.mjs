import fs from 'node:fs';
const src = fs.readFileSync('E:/dsh/hanzi2kanji-main/src/utils/loadDictionary.js', 'utf8');
// dictionary_obj 是标准 JSON 对象字面量（key 带引号）
const start = src.indexOf('{');
const end = src.indexOf('export const dictionary');
const objText = src.slice(start, end).trim().replace(/;\s*$/, '');
const obj = JSON.parse(objText);
const entries = Object.entries(obj);
console.log('Total entries:', entries.length);
// 验证关键映射
for (const c of ['亚', '击', '状', '态', '莱', '娅', '关', '广', '读', '气', '盐', '泽', '战', '单', '岁', '应', '让', '绝', '继', '续', '缘', '戏', '双', '动', '梦', '飞', '门', '问', '时', '间', '说', '队', '编', '圣', '尔', '骑', '维', '纳', '斯', '露', '涅', '綻', '绽放']) {
  console.log(c, '->', obj[c] ? obj[c].join('/') : '(none)');
}
// 统计单字映射数量
let single = 0, multi = 0;
for (const [k, v] of entries) {
  if ([...k].length === 1) single++;
  if ([...k].length > 1) multi++;
}
console.log('single-char keys:', single, '| multi-char keys:', multi);
