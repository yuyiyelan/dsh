// Extract manual TW->CN overrides from gen-han-converter.mjs into JSON
import fs from 'node:fs';

const src = fs.readFileSync('E:/dsh/TSKHook/tools/gen-han-converter.mjs', 'utf8');
const m = src.match(/const manualTW = \{([\s\S]*?)\n\};/);
if (!m) { console.log('NOT FOUND'); process.exit(1); }
const body = m[1];
const entries = {};
const re = /'([^']+)':\s*'([^']*)'/g;
let mm;
while ((mm = re.exec(body))) {
  entries[mm[1]] = mm[2];
}
fs.writeFileSync('E:/dsh/TSKHook/tools/opencc-data/manual_tw_cn.json', JSON.stringify(entries, null, 1), 'utf8');
console.log('manual entries:', Object.keys(entries).length);
