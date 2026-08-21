// Check generated C# dictionaries for duplicate keys (would crash at runtime)
import fs from 'node:fs';

function extractDictBody(src, marker) {
  // find "public static readonly Dictionary<string, string> <marker> = new()" then "{ ... };"
  const startMarker = `Dictionary<string, string> ${marker} = new()`;
  const idx = src.indexOf(startMarker);
  if (idx < 0) { console.log(`MARKER ${marker} NOT FOUND`); return null; }
  const brace = src.indexOf('{', idx);
  // find matching close brace
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(brace, i + 1); }
  }
  return null;
}

function checkBody(body, name) {
  if (!body) return;
  const re = /\{\s*"((?:[^"\\]|\\.)*)",\s*"/g;
  const keys = [];
  let m;
  while ((m = re.exec(body))) keys.push(m[1]);
  const seen = new Set();
  const dup = [];
  for (const k of keys) {
    if (seen.has(k)) dup.push(k);
    seen.add(k);
  }
  console.log(`${name}: ${keys.length} entries, duplicates: ${dup.length}` +
    (dup.length ? ' -> ' + [...new Set(dup)].slice(0, 10).join(' | ') : ' ✓'));
}

const src = fs.readFileSync('E:/dsh/TSKHook/HanConverterData.cs', 'utf8');
checkBody(extractDictBody(src, 'PhraseMap'), 'PhraseMap');
checkBody(extractDictBody(src, 'CharMap'), 'CharMap');

const src2 = fs.readFileSync('E:/dsh/TSKHook/UnifiedNames.cs', 'utf8');
checkBody(extractDictBody(src2, 'Overrides'), 'UnifiedNames');
