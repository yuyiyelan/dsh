// Verify regenerated HanConverterData.cs has no Simplified->Traditional pollution
import fs from 'node:fs';

const src = fs.readFileSync('E:/dsh/TSKHook/HanConverterData.cs', 'utf8');
const m = src.match(/Dictionary<string, string> PhraseMap = new\(\)\n    \{\n([\s\S]*?)\n    \};/);
const body = m ? m[1] : '';
const bad = [];
for (const line of body.split('\n')) {
  if (line.includes('什么') && line.includes('什麼')) bad.push(line.trim());
  if (line.includes('这么') && line.includes('這麼')) bad.push(line.trim());
  if (line.includes('怎么') && line.includes('怎麼')) bad.push(line.trim());
  if (line.includes('那么') && line.includes('那麼')) bad.push(line.trim());
}
console.log('polluted entries:', bad.length ? bad.slice(0, 8) : 'none ✓');
const total = (body.match(/\{ "/g) || []).length;
console.log('PhraseMap entries:', total);

// also count 麼 as key (should only be Traditional->Simplified direction: 麼->么)
const keys = [...body.matchAll(/\{ "((?:[^"\\]|\\.)*)", "/g)].map((x) => x[1]);
const meAsKey = keys.filter((k) => k.includes('麼'));
console.log('keys containing 麼:', meAsKey.length, meAsKey.slice(0, 8));
const meInValues = body.match(/", "[^"]*麼/g) || [];
console.log('values containing 麼:', meInValues.length, meInValues.slice(0, 8));
