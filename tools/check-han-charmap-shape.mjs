import fs from "node:fs";
const src = fs.readFileSync('E:/dsh/TSKHook/HanConverterData.cs', 'utf8');
const m = src.match(/PhraseMap = new\(\)\s*\{([\s\S]*?)\n    \};/);
const body = m ? m[1] : '';
const entries = [...body.matchAll(/\{ "((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)" \}/g)];
let over6 = [];
for (const e of entries) { if ([...e[1]].length > 6) over6.push(e[1]); }
console.log('phrase entries:', entries.length, '| keys longer than 6:', over6.length);
console.log(over6.slice(0, 40).join(" | "));