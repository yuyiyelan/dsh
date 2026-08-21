// Generates SimToHanData.cs: Simplified -> Traditional GLYPH mapping.
// Purpose: the game's fonts (FOT-RodinNTLGPro-B SDF for UI, notosanscjktc for
// story) are Traditional/Japanese glyph sets. Simplified-only glyphs (队/编/圣)
// render as boxes. We keep translations in Simplified Chinese but map the final
// displayed text to Traditional glyphs so the original game fonts can render
// every character without boxes, garbling or font swapping.
//
// Sources (OpenCC, Apache-2.0):
//   STPhrases.txt            Simplified -> Traditional phrases
//   TWVariantsRevPhrases.txt Simplified -> Traditional variant phrases
//   TSCharacters.txt         Traditional -> Simplified chars (reversed)
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, 'opencc-data');
const out = path.join(import.meta.dirname, '..', 'SimToHanData.cs');

function readKeyValue(file) {
  const lines = fs.readFileSync(path.join(dir, file), 'utf8').split(/\r?\n/);
  const map = new Map();
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const key = line.slice(0, tab);
    const val = line.slice(tab + 1).trim().split(/\s+/)[0] ?? '';
    if (!key || !val || val === key) continue;
    if (!map.has(key)) map.set(key, val); // first value wins
  }
  return map;
}

// 1) phrases: STPhrases first, TWVariantsRevPhrases fills missing keys
const phrases = readKeyValue('STPhrases.txt');
const twRev = readKeyValue('TWVariantsRevPhrases.txt');
for (const [k, v] of twRev) {
  if (!phrases.has(k)) phrases.set(k, v);
}

// 2) single chars: reverse TSCharacters (Traditional -> Simplified list);
//    first Traditional char seen for each Simplified char wins (most common)
const chars = new Map();
const tsLines = fs.readFileSync(path.join(dir, 'TSCharacters.txt'), 'utf8').split(/\r?\n/);
for (const line of tsLines) {
  if (!line || line.startsWith('#')) continue;
  const tab = line.indexOf('\t');
  if (tab <= 0) continue;
  const trad = line.slice(0, tab);
  if (trad.length !== 1) continue;
  const sims = line.slice(tab + 1).trim().split(/\s+/).filter(Boolean);
  for (const s of sims) {
    if (s.length !== 1) continue;
    if (!chars.has(s)) chars.set(s, trad);
  }
}

// Ambiguous chars: the reverse lookup picks the alphabetically-first
// Traditional form, which is often wrong (里->哩, 面->麪, 只->祇, 干->乾,
// 后->後, 准->準, 克->剋, 旋->鏇, 了->瞭, 出->齣, 家->傢, 玩->翫).
// Drop those single-char entries and let phrase entries handle the common
// contexts; the dropped char then renders unchanged, which is safe because
// these chars exist in the game's Japanese fonts.
const removeChars = new Set([
  // 歧义/语境字：反向表取错
  '后', '里', '面', '只', '干', '准',
  // 异体字误反向（OpenCC 把异体当主字）
  '克', '旋', '了', '出', '家', '玩',
  '和', '冬', '即', '真', '管', '合', '吃', '糖',
  '松', '谷', '板',
  '床', '具', '刮', '托', '系', '制', '昆', '布',
]);
// Overrides: '台' reverses to '檯' (counter-top) but '臺' is the common form.
// '湿' reverses to '溼' (rare variant) but '濕' is the standard form.
// '术' reverses to '朮' (herb name) but '術' is the standard form.
const overrideChars = new Map([['台', '臺'], ['湿', '濕'], ['术', '術']]);
for (const s of removeChars) chars.delete(s);
for (const [s, t] of overrideChars) if (chars.has(s)) chars.set(s, t);

// Normalize the 麪 variant (used by STPhrases for 麵) to 麵, which is the
// form present in the game's fonts.
for (const [k, v] of phrases) {
  if (v.includes('麪')) phrases.set(k, v.replaceAll('麪', '麵'));
}

// 3) Simplified -> Japanese kanji (JIS new forms) mapping from the
//    hanzi2kanji project (https://github.com/BHznJNs/hanzi2kanji).
//    The game's UI font (FOT-RodinNTLGPro-B) is a JIS font: it lacks both
//    Simplified-only glyphs AND Traditional old forms (狀/亞/擊), but it does
//    contain the Japanese new forms (状/亜/撃). This map is the bridge.
const jpMap = new Map();
{
  const h2kSrc = fs.readFileSync('E:/dsh/hanzi2kanji-main/src/utils/loadDictionary.js', 'utf8');
  const js = h2kSrc.indexOf('{');
  const je = h2kSrc.indexOf('export const dictionary');
  const objText = h2kSrc.slice(js, je).trim().replace(/;\s*$/, '');
  const obj = JSON.parse(objText);
  for (const [k, v] of Object.entries(obj)) {
    const cands = (Array.isArray(v) ? v : []).filter((x) => x && [...x].length === 1);
    if (cands.length > 0) jpMap.set(k, cands);
  }
}

// drop phrase entries that are fully covered by char mapping and equal-length
// duplicates of a shorter phrase? Keep simple: keep all real phrases.
let maxPhraseLen = 0;
for (const k of phrases.keys()) maxPhraseLen = Math.max(maxPhraseLen, k.length);

const phraseEntries = [...phrases.entries()].sort((a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0]));
const charEntries = [...chars.entries()].sort((a, b) => a[0].codePointAt(0) - b[0].codePointAt(0));
const jpEntries = [...jpMap.entries()].sort((a, b) => a[0].codePointAt(0) - b[0].codePointAt(0));

const sb = [];
sb.push('// Auto-generated by tools/gen-sim-to-han.mjs from OpenCC data (Apache-2.0)');
sb.push('// https://github.com/BYVoid/OpenCC');
sb.push('// and hanzi2kanji (https://github.com/BHznJNs/hanzi2kanji)');
sb.push('// Maps Simplified Chinese -> Traditional GLYPHS for display, so the game\'s');
sb.push('// Traditional/Japanese fonts can render every translated character.');
sb.push('using System.Collections.Generic;');
sb.push('');
sb.push('namespace TSKHook;');
sb.push('');
sb.push('public static partial class SimToHanData');
sb.push('{');
sb.push(`    /// <summary>Multi-char phrase mapping (Simplified -> Traditional). Max phrase length: ${maxPhraseLen}.</summary>`);
sb.push('    public static readonly Dictionary<string, string> PhraseMap = new()');
sb.push('    {');
for (const [k, v] of phraseEntries) {
  sb.push(`        { ${JSON.stringify(k)}, ${JSON.stringify(v)} },`);
}
sb.push('    };');
sb.push('');
sb.push('    /// <summary>Single-char mapping (Simplified -> Traditional).</summary>');
sb.push('    public static readonly Dictionary<char, char> CharMap = new()');
sb.push('    {');
for (const [k, v] of charEntries) {
  sb.push(`        { '${k}', '${v}' },`);
}
sb.push('    };');
sb.push('');
sb.push('    /// <summary>Single-char mapping (Simplified -> Japanese kanji / JIS new forms), from hanzi2kanji.</summary>');
sb.push('    public static readonly Dictionary<char, char[]> JpMap = new()');
sb.push('    {');
for (const [k, v] of jpEntries) {
  const arr = v.map((x) => `'${x}'`).join(', ');
  sb.push(`        { '${k}', new[] { ${arr} } },`);
}
sb.push('    };');
sb.push('}');
sb.push('');

fs.writeFileSync(out, sb.join('\n'), 'utf8');
console.log(`Wrote ${out}`);
console.log(`Phrases: ${phraseEntries.length} (maxLen=${maxPhraseLen}), Chars: ${charEntries.length}`);
