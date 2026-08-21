// Fix residual Traditional/Japanese glyphs in the merged dictionary:
// re-run the full simplified conversion + extra char fixes (転->转 etc).
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'E:/dsh/TSKHook/translation_zh_Hans';
const DIR = 'E:/dsh/TSKHook/tools/opencc-data';
const XDIR = 'E:/dsh/TSKHook/tools/xlsx-extract';

function loadDict(file, sep = '\t') {
  const lines = fs.readFileSync(`${DIR}/${file}`, 'utf8').split('\n');
  const map = new Map();
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split(sep).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    map.set(parts[0], parts.slice(1));
  }
  return map;
}
const chars = loadDict('TSCharacters.txt');
const tsPhrases = loadDict('TSPhrases.txt');
const twPhrases = loadDict('TWPhrases.txt');
const manualTW = JSON.parse(fs.readFileSync(`${DIR}/manual_tw_cn.json`, 'utf8'));
const phraseMap = new Map();
for (const [tw, cn] of Object.entries(manualTW)) phraseMap.set(tw, cn);
for (const [cn, twList] of twPhrases) for (const tw of twList) if (!phraseMap.has(tw)) phraseMap.set(tw, cn);
for (const [tw, cnList] of tsPhrases) if (!phraseMap.has(tw)) phraseMap.set(tw, Array.isArray(cnList) ? cnList[0] : cnList);

// extra char fixes: Japanese shinjitai -> simplified (not in TSCharacters)
const extraChars = {
  '転': '转', '発': '发', '対': '对', '関': '关', '気': '气', '読': '读',
  '戦': '战', '単': '单', '団': '团', '伝': '传', '応': '应', '広': '广',
  '塩': '盐', '沢': '泽', '済': '济', '縁': '缘', '続': '续', '県': '县',
  '険': '险', '験': '验', '権': '权', '権': '权', '総': '总', '職': '职',
  '聴': '听', '鉄': '铁', '図': '图', '従': '从', '収': '收', '変': '变',
  '辺': '边', '楽': '乐', '労': '劳', '緑': '绿', '録': '录', '論': '论',
  '語': '语', '誤': '误', '護': '护', '諸': '诸', '認': '认', '訳': '译',
  '誕': '诞', '説': '说', '談': '谈', '調': '调', '講': '讲', '謝': '谢',
  '議': '议', '譲': '让', '豊': '丰', '買': '买', '賣': '卖', '買': '买',
  '費': '费', '資': '资', '賛': '赞', '賞': '赏', '賑': '赈', '軽': '轻',
  '較': '较', '載': '载', '輪': '轮', '輸': '输', '連': '连', '進': '进',
  '過': '过', '達': '达', '遠': '远', '選': '选', '遺': '遗', '適': '适',
  '門': '门', '間': '间', '開': '开', '関': '关', '閉': '闭', '隊': '队',
  '階': '阶', '際': '际', '難': '难', '電': '电', '願': '愿', '類': '类',
  '顧': '顾', '風': '风', '飛': '飞', '飯': '饭', '飲': '饮', '養': '养',
  '館': '馆', '馬': '马', '駐': '驻', '驚': '惊', '魚': '鱼', '鳥': '鸟',
  '黒': '黑', '黙': '默', '體': '体', '發': '发', '運': '运', '內': '内',
  '設': '设', '備': '备', '學': '学', '習': '习', '師': '师', '對': '对',
  '錯': '错', '過': '过', '還': '还', '樣': '样', '處': '处', '邊': '边',
  '風': '风', '飛': '飞', '國': '国', '為': '为', '義': '义', '變': '变',
  '樂': '乐', '東': '东', '車': '车', '軍': '军', '聲': '声', '實': '实',
  '寶': '宝', '貴': '贵', '買': '买', '賣': '卖', '遠': '远', '靜': '静',
  '鏡': '镜', '長': '长', '龍': '龙', '漢': '汉', '讀': '读', '寫': '写',
  '書': '书', '間': '间', '腦': '脑', '廢': '废', '萬': '万', '歲': '岁',
  '應': '应', '讓': '让', '絕': '绝', '續': '续', '緣': '缘', '戲': '戏',
  '雙': '双', '動': '动', '夢': '梦', '雲': '云', '電': '电', '話': '话',
  '進': '进', '覺': '觉', '門': '门', '問': '问', '題': '题', '裝': '装',
  '狀': '状', '態': '态', '屬': '属', '強': '强', '騎': '骑', '士': '士',
};
// merge extraChars into chars (chars wins for overlapping)
for (const [jp, cn] of Object.entries(extraChars)) {
  if (!chars.has(jp)) chars.set(jp, [cn]);
}

function toSimplified(text) {
  if (!text) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    let matched = false;
    const maxLen = Math.min(6, text.length - i);
    for (let len = maxLen; len >= 2; len--) {
      const key = text.substr(i, len);
      if (phraseMap.has(key)) {
        const val = phraseMap.get(key);
        if (val === key) continue;
        out += val; i += len; matched = true; break;
      }
    }
    if (matched) continue;
    const ch = text[i];
    out += chars.has(ch) ? String(chars.get(ch)).split(' ')[0] : ch;
    i++;
  }
  return out;
}

// unified names alias (same as merge script)
const unified = JSON.parse(fs.readFileSync(`${XDIR}/unified_names_v3.json`, 'utf8')).names;
const tskNameRaw = JSON.parse(fs.readFileSync(`${XDIR}/tsk_name.json`, 'utf8'));
const tskSubRaw = JSON.parse(fs.readFileSync(`${XDIR}/tsk_subname.json`, 'utf8'));
const aliasMap = new Map();
for (const [jp, cn] of Object.entries({ ...tskNameRaw, ...tskSubRaw })) {
  if (!unified[jp]) continue;
  const cnS = toSimplified(cn);
  if (cnS && cnS !== unified[jp]) aliasMap.set(cnS, unified[jp]);
}
const SKIP_ALIASES = new Set(['蕾拉','煌岭','艾琳','静羽','英格丽德','莉娜','小雏','紫乃','安洁','库莘','碧翠丝','贾桂琳','百可花','布特拉','希格']);
for (const a of SKIP_ALIASES) aliasMap.delete(a);
function applyUnifiedNames(cn) {
  if (!cn) return cn;
  let out = cn;
  for (const [alias, un] of aliasMap) {
    if (!alias || !un || alias === un) continue;
    if (out.includes(alias)) out = out.split(alias).join(un);
  }
  return out;
}

let files = 0, entries = 0, changed = 0;
const tradCheck = new Set('體隊聖稱這發們個時說問問題裝備狀態屬強騎應該學師間對錯過還樣處邊風飛國為義變樂東車軍聲實寶貴買賣運動遠靜鏡長龍馬鳥魚雞漢語讀寫書習內難腦廢賣萬歲應讓絕續緣戲雙動夢雲電話設備備頭發見現機樓橋鐵銀錢鐘飽飯飲館傷優會體眾華協單縣衛廳歷壓厭廚廠匯漢湯溝潔濟濃溫滿灣災靈爐燦煉燈燒熱牽猶獨貓獻環現瑪瓊婭絢綴綻嵐嶼帥師塵堯懼懾憶憂憐戀惡惱悅懸驚懶戲戰撲執擴掃揚撫擁攔擰撥擇掛擋撿換搗捧據捷掀授掉推描提插握揭揪搜援摟攪搏摧摸摔摘撇撂撐撒撕撞撤撩播撮撰擒撼擂操擎攀攢騷馨顆顫霸韻頂項順須頑顧頓頒頌預顱領頗頸頰頻頹穎顏額顛頁転発対関気読戦単団伝応広塩沢済縁続県険験権総職聴鉄図従収変辺楽労緑録論語誤護諸認訳誕説談調講謝議譲豊費資賛賞軽較載輪輸連進過達遠選遺適門間開閉階際難電願類顧風飛飯飲養館馬駐驚魚鳥黒黙');
let bad = 0;
for (const f of fs.readdirSync(OUT)) {
  if (!f.endsWith('.json')) continue;
  const p = path.join(OUT, f);
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    let fileChanged = false;
    for (const [k, v] of Object.entries(j)) {
      if (typeof v !== 'string') continue;
      entries++;
      const converted = applyUnifiedNames(toSimplified(v));
      if (converted !== v) { j[k] = converted; fileChanged = true; changed++; }
    }
    if (fileChanged) { fs.writeFileSync(p, JSON.stringify(j), 'utf8'); files++; }
  } catch {}
}
// 验证残留
for (const f of fs.readdirSync(OUT)) {
  if (!f.endsWith('.json')) continue;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
    for (const v of Object.values(j)) {
      if (typeof v !== 'string') continue;
      for (const c of v) if (tradCheck.has(c)) { bad++; break; }
    }
  } catch {}
}
console.log(`修复完成: 文件=${files} 词条=${entries} 修改=${changed} | 残留词条=${bad}`);
