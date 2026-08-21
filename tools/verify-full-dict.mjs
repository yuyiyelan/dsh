// Full verification of the merged dictionary before syncing to the game.
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'E:/dsh/TSKHook/translation_zh_Hans';
const ZIP = 'E:/dsh/tsk';

console.log('=== 1. 文件数与完整性 ===');
const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.json'));
let empty = 0, corrupt = 0, totalEntries = 0;
for (const f of files) {
  const p = path.join(OUT, f);
  const size = fs.statSync(p).size;
  if (size <= 2) { empty++; console.log(`  空文件: ${f}`); }
  try { const j = JSON.parse(fs.readFileSync(p, 'utf8')); totalEntries += Object.keys(j).length; }
  catch { corrupt++; console.log(`  损坏: ${f}`); }
}
console.log(`  文件数=${files.length} 空=${empty} 损坏=${corrupt} 总词条=${totalEntries}`);

console.log('=== 2. 组件覆盖 ===');
const zipComps = fs.readdirSync(ZIP).filter((d) => fs.statSync(path.join(ZIP, d)).isDirectory());
const skip = new Set(['glossary', 'tsk_name', 'tsk_subname', 'slang']);
const zipExpected = zipComps.filter((c) => !skip.has(c));
const dictNames = new Set(files.map((f) => f.slice(0, -5)));
let missing = 0;
for (const c of zipExpected) if (!dictNames.has(c)) { missing++; console.log(`  缺组件: ${c}`); }
console.log(`  ZIP组件=${zipExpected.length} 词典缺失=${missing}`);

console.log('=== 3. 简体残留（真繁体） ===');
const tradSet = new Set('體隊聖稱這發們個時說問問題裝備狀態屬強騎應該學師間對錯過還樣處邊風飛國為義變樂東車軍聲實寶貴買賣運動遠靜鏡長龍馬鳥魚雞漢語讀寫書習內難腦廢賣萬歲應讓絕續緣戲雙動夢雲電話設備頭見現機樓橋鐵銀錢鐘飽飯飲館傷優會眾華協單縣衛廳歷壓厭廚廠匯漢湯溝潔濟濃溫滿灣災靈爐燦煉燈燒熱牽猶獨貓獻環瓊婭絢綴綻嵐嶼帥塵堯懼懾憶憂憐戀惡惱悅懸驚懶戰撲執擴掃揚撫擁攔擰撥擇掛擋撿換搗捧據捷掀推描提插握揭揪搜援摟攪搏摧摸摔摘撇撂撐撕撞撤撩播撮撰擒撼擂操擎攀攢騷馨顆顫韻頂項順須頑顧頓頒頌預顱領頗頸頰頻頹穎顏額顛頁転発対関気読戦単団伝応広塩沢済縁続県険験権総職聴鉄図従収変辺楽労緑録論語誤護諸認訳誕説談調講謝議譲豊費資賛賞軽較載輪輸連進過達遠選遺適門間開閉階際難電願類顧風飛飯飲養館馬駐驚魚鳥黒黙');
let bad = 0;
const badSamples = [];
for (const f of files) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
    for (const v of Object.values(j)) {
      if (typeof v !== 'string') continue;
      for (const c of v) {
        if (tradSet.has(c)) {
          bad++;
          if (badSamples.length < 8) badSamples.push(`${f}: ${v.slice(0, 40)}`);
          break;
        }
      }
    }
  } catch {}
}
console.log(`  真繁体残留词条=${bad}`);
badSamples.forEach((s) => console.log(`    ${s}`));

console.log('=== 4. 名字统一验证 ===');
// 检查几个关键名字在词典中的译法（应统一为 names.json 译名）
const checkNames = ['塞拉', '莎拉', '玛托伊', '缠', '菲奥娜', '菲欧娜', '露莉艾尔', '托瓦老师', '索菲亚'];
const dictText = [];
for (const f of files.slice(0, 200)) {
  try { dictText.push(fs.readFileSync(path.join(OUT, f), 'utf8')); } catch {}
}
const allText = dictText.join('');
for (const n of checkNames) {
  const count = (allText.match(new RegExp(n, 'g')) || []).length;
  console.log(`  '${n}' 出现 ${count} 次`);
}

console.log('=== 5. 特殊文件 ===');
for (const special of ['names.json', 'subnames.json', 'glossary.json']) {
  console.log(`  ${special}: ${fs.existsSync(path.join(OUT, special)) ? '存在' : '不存在'}`);
}
