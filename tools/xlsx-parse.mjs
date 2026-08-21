// 统一 xlsx sheet 解析器（修正自闭合单元格 + t="s" 属性顺序问题）
import fs from 'node:fs';
import path from 'node:path';

const dir = 'E:/dsh/TSKHook/tools/xlsx-full/xl';

export function loadShared() {
  const ssXml = fs.readFileSync(path.join(dir, 'sharedStrings.xml'), 'utf8');
  const shared = [];
  const siRe = /<si>(.*?)<\/si>/gs;
  let m;
  while ((m = siRe.exec(ssXml)) !== null) {
    const inner = m[1];
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let text = '';
    let tm;
    while ((tm = tRe.exec(inner)) !== null) text += tm[1];
    shared.push(text);
  }
  return shared;
}

export function parseSheet(file, shared) {
  let xml = fs.readFileSync(path.join(dir, file), 'utf8');
  // 剔除自闭合单元格（无内容），防止正则吞并后续单元格
  xml = xml.replace(/<c\b[^>]*?\/>/g, '');
  const rows = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml)) !== null) {
    const rowNum = parseInt(rm[1], 10);
    const cells = [];
    const cRe = /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
    let cm;
    while ((cm = cRe.exec(rm[2])) !== null) {
      const col = cm[1];
      const attrs = cm[3];
      const type = /t="([^"]*)"/.exec(attrs)?.[1] || '';
      const vRe = /<v>([\s\S]*?)<\/v>/.exec(cm[4]);
      const isRe = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(cm[4]);
      let val = '';
      if (type === 's' && vRe) val = shared[parseInt(vRe[1], 10)] ?? '';
      else if (isRe) val = isRe[1];
      else if (vRe) val = vRe[1];
      cells.push({ col, val });
    }
    cells.sort((a, b) => a.col.localeCompare(b.col, 'en', { numeric: true }));
    rows.push({ rowNum, cells });
  }
  return rows;
}
