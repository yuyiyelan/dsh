// 解析 global-metadata.dat 的 stringLiteral 区（LZ4 压缩），提取日文字符串
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const lz4 = require('E:/dsh/7z-tools/node_modules/lz4js/lz4.js');

const path = (process.env.TSK_GAME || 'C:/Path/To/Twinkle_StarKnightsX') + '/twinkle_starknightsX_Data/il2cpp_data/Metadata/global-metadata.dat';
const b = fs.readFileSync(path);

const strOffset = b.readUInt32LE(8);
const strCount = b.readUInt32LE(12);
const strDataSize = b.readUInt32LE(16); // compressed
const strSize = b.readUInt32LE(20);     // decompressed
console.log('stringLiteral offset:', strOffset, 'compressed:', strDataSize, 'decompressed:', strSize, 'count:', strCount);

const compressed = new Uint8Array(b.slice(strOffset, strOffset + strDataSize));
const dst = new Uint8Array(strSize);
const written = lz4.decompressBlock(compressed, dst, 0, strDataSize, 0);
console.log('decompressed bytes:', written);
const decompressed = dst.subarray(0, written);

// 提取字符串（UTF-8，null 结尾）
const strings = [];
let i = 0;
while (i < decompressed.length) {
  let end = i;
  while (end < decompressed.length && decompressed[end] !== 0) end++;
  if (end > i) {
    try {
      strings.push(Buffer.from(decompressed.slice(i, end)).toString('utf8'));
    } catch {}
  }
  i = end + 1;
}
console.log('total string literals:', strings.length);

function isJapanese(s) {
  for (const c of s) {
    const cp = c.codePointAt(0);
    if ((cp >= 0x3040 && cp <= 0x30FF) || cp === 0x30FB || cp === 0x30FC || cp === 0x3001 || cp === 0x3002 || cp === 0x300C || cp === 0x300D) return true;
    if (cp >= 0x4E00 && cp <= 0x9FFF) return true;
  }
  return false;
}
const jp = strings.filter((s) => s.length >= 1 && s.length <= 400 && isJapanese(s));
console.log('japanese strings:', jp.length);

fs.writeFileSync('E:/dsh/TSKHook/tools/metadata-jp-strings.txt', jp.join('\n'), 'utf8');
const lenDist = {};
for (const s of jp) {
  const bucket = s.length <= 4 ? '1-4' : s.length <= 12 ? '5-12' : s.length <= 40 ? '13-40' : '41+';
  lenDist[bucket] = (lenDist[bucket] || 0) + 1;
}
console.log('length distribution:', JSON.stringify(lenDist));
console.log('--- samples (first 80) ---');
for (const s of jp.slice(0, 80)) console.log(' ', JSON.stringify(s));
