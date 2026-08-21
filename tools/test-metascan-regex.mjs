import fs from 'node:fs';
const p = (process.env.TSK_GAME || 'C:/Path/To/Twinkle_StarKnightsX') + '/twinkle_starknightsX_Data/il2cpp_data/Metadata/global-metadata.dat';
if (!fs.existsSync(p)) { console.log('metadata not found'); process.exit(2); }
const bytes = fs.readFileSync(p);
const info = fs.statSync(p);
console.log('size MB:', (info.size/1024/1024).toFixed(1));
const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
console.log('decoded chars:', text.length);
const pattern = /[0-9A-Za-z%％.\-+\uFF10-\uFF19\u3040-\u30FF\u4E00-\u9FFF\u3001\u3002\u300C\u300D\u30FB\u30FC\uFF01\uFF1F\uFF08\uFF09\uFF0C\u3005]{2,400}/g;
const found = new Set();
let m; let scanned = 0;
while ((m = pattern.exec(text)) !== null) {
  scanned++;
  const frag = m[0].trim();
  if (frag.length < 2 || frag.length > 300) continue;
  if (!/[\u3040-\u30FF\u4E00-\u9FFF]/.test(frag)) continue;
  if (found.add(frag).size >= 50000) break;
}
console.log('matches scanned:', scanned, '| unique fragments collected:', found.size);
let shown = 0;
for (const s of found) { if (shown++ < 12) console.log('  ', JSON.stringify(s.slice(0, 80))); }