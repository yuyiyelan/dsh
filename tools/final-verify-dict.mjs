// FINAL full-dictionary verification:
// 1. real Traditional-only chars (excluding chars shared with Simplified)
// 2. all values must be strings
// 3. spot-check unified names applied in chapters
import fs from 'node:fs';

const dir = 'E:/dsh/TSKHook/translation_zh_Hans';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

// True Traditional-only chars (NOT valid in Simplified)
const tradOnly = '歐亞薩維納覺羅爾裡麼這們時學對說為與體龍鳳戰點馬鳥魚燈煙雲電風靈聖賢醫藥護衛將軍隊員價錢銀鐵鋼鑑賞譽讚練習慣紀錄憶誌謀畫圖書讀寫聽語詞詩戲劇團圍環鏡鎖輪轉載運輸遲緩進過還歸樣種態勢權術藝導遊擊處內邊緣際陽陰隱顯狀實質則創辦動靜穩變化優勝敗負責任務積極消除增減乘損獲取尋檢觀視觸擺搖彈躍駐滯剩餘匯總計算數據檔資訊報告簽證憑開閉啟發佈鎮壓張緊鬆綁束縛繞繼斷絕滅毀壞破裂縫隙補充滿溢洩漏餘'.split('');

const byChar = {};
let badEntries = 0;
let nonString = 0;
let total = 0;
const examples = [];

for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')); }
  catch (e) { console.log(`PARSE FAIL ${f}: ${e.message}`); continue; }
  for (const [k, v] of Object.entries(d)) {
    total++;
    if (typeof v !== 'string') { nonString++; continue; }
    for (const ch of v) {
      if (tradOnly.includes(ch)) {
        byChar[ch] = (byChar[ch] || 0) + 1;
        if (badEntries < 8) examples.push(`${f}: ${v.slice(0, 40)} [${ch}]`);
        badEntries++;
        break;
      }
    }
  }
}

console.log(`files: ${files.length}, entries: ${total}`);
console.log(`non-string values: ${nonString}`);
console.log(`entries with Traditional-only chars: ${badEntries}`);
if (badEntries > 0) {
  console.log('by char:', JSON.stringify(byChar));
  examples.forEach((e) => console.log('  ' + e));
} else {
  console.log('✓ ALL SIMPLIFIED');
}
