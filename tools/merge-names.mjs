// Merge all name sources into a unified JP->Simplified-CN dictionary (v2)
// Rules:
//  - Platform tsk_name/tsk_subname (zh_Hant) converted to Simplified = base for ALL keys.
//  - sheet2 manual mapping:
//      * key WITHOUT suffix (《》/（）/()): only override base when the CN value
//        has NO limited-edition qualifier (新春/泳装/万圣/圣诞/花嫁/幼/限定/活动...).
//      * key WITH suffix: override freely (limited/alt forms).
//  - biliwiki matched names: same qualifier rule as sheet2.
import fs from 'node:fs';

const DIR = 'E:/dsh/TSKHook/tools/xlsx-extract';

// source 1: sheet2 manual mapping (jp -> cn with aliases)
const sheet2 = JSON.parse(fs.readFileSync(`${DIR}/sheet2_jp_cn.json`, 'utf8'));
// source 2: matched names (jp -> cn from biliwiki)
const matched = JSON.parse(fs.readFileSync(`${DIR}/matched_names2.json`, 'utf8'));
// source 3: platform tsk_name + tsk_subname (jp -> zh_Hant)
const tskName = JSON.parse(fs.readFileSync(`${DIR}/tsk_name.json`, 'utf8'));
const tskSub = JSON.parse(fs.readFileSync(`${DIR}/tsk_subname.json`, 'utf8'));

// ---- minimal zh_TW -> zh_CN char converter (fallback) ----
const tw2cn = {
  '歐': '欧', '亞': '亚', '薩': '萨', '維': '维', '納': '纳', '覺': '觉', '醒': '醒',
  '波': '波', '羅': '罗', '菲': '菲', '娜': '娜', '艾': '艾', '西': '西', '蘇': '苏',
  '克': '克', '洛': '洛', '托': '托', '爾': '尔', '雷': '雷', '德': '德', '弗': '弗',
  '蘭': '兰', '緹': '缇', '婭': '娅', '諾': '诺', '貝': '贝', '兒': '儿', '蒂': '蒂',
  '愛': '爱', '麗': '丽', '賽': '赛', '瑪': '玛', '格': '格', '達': '达', '蕾': '蕾',
  '盧': '卢', '露': '露', '卡': '卡', '潔': '洁', '傑': '杰', '華': '华', '妲': '妲',
  '瑟': '瑟', '忒': '忒', '涅': '涅', '緋': '绯', '宮': '宫', '會': '会', '長': '长',
  '時': '时', '間': '间', '學': '学', '園': '园', '對': '对', '說': '说', '話': '话',
  '這': '这', '個': '个', '嗎': '吗', '沒': '没', '關': '关', '係': '系', '東': '东',
  '後': '后', '裏': '里', '為': '为', '於': '于', '與': '与', '們': '们', '來': '来',
  '兩': '两', '體': '体', '龍': '龙', '鳳': '凤', '烏': '乌', '魯': '鲁', '斯': '斯',
  '庫': '库', '蓮': '莲', '葉': '叶', '普': '普', '莉': '莉', '姆': '姆', '拉': '拉',
  '曼': '曼', '黛': '黛', '絲': '丝', '姬': '姬', '繆': '缪', '鈴': '铃', '鈍': '钝',
  '鍵': '键', '臨': '临', '終': '终', '戰': '战', '爭': '争', '驗': '验', '點': '点',
  '馬': '马', '飛': '飞', '鳥': '鸟', '魚': '鱼', '釣': '钓', '燈': '灯', '籠': '笼',
  '煙': '烟', '霧': '雾', '雲': '云', '電': '电', '風': '风', '閃': '闪', '震': '震',
  '靈': '灵', '魂': '魂', '鬼': '鬼', '魔': '魔', '聖': '圣', '賢': '贤', '醫': '医',
  '藥': '药', '診': '诊', '療': '疗', '護': '护', '衛': '卫', '將': '将', '帥': '帅',
  '軍': '军', '隊': '队', '員': '员', '價': '价', '錢': '钱', '銀': '银', '銅': '铜',
  '鐵': '铁', '鋼': '钢', '鑑': '鉴', '賞': '赏', '譽': '誉', '讚': '赞', '諷': '讽',
  '訓': '训', '練': '练', '習': '习', '慣': '惯', '紀': '纪', '錄': '录', '記': '记',
  '憶': '忆', '誌': '志', '謀': '谋', '劃': '划', '畫': '画', '圖': '图', '書': '书',
  '讀': '读', '寫': '写', '聽': '听', '語': '语', '詞': '词', '詩': '诗', '戲': '戏',
  '劇': '剧', '團': '团', '圍': '围', '環': '环', '鏡': '镜', '鎖': '锁', '鏈': '链',
  '輪': '轮', '轉': '转', '載': '载', '運': '运', '輸': '输', '送': '送', '遲': '迟',
  '緩': '缓', '速': '速', '進': '进', '退': '退', '過': '过', '還': '还', '返': '返',
  '歸': '归', '樣': '样', '種': '种', '類': '类', '態': '态', '勢': '势', '權': '权',
  '術': '术', '藝': '艺', '異': '异', '導': '导', '遊': '游', '擊': '击', '處': '处',
  '內': '内', '外': '外', '側': '侧', '邊': '边', '緣': '缘', '際': '际', '陳': '陈',
  '陽': '阳', '陰': '阴', '隱': '隐', '藏': '藏', '顯': '显', '現': '现', '狀': '状',
  '況': '况', '實': '实', '質': '质', '則': '则', '創': '创', '辦': '办', '動': '动',
  '靜': '静', '穩': '稳', '變': '变', '化': '化', '換': '换', '優': '优', '勝': '胜',
  '敗': '败', '負': '负', '責': '责', '任': '任', '務': '务', '積': '积', '極': '极',
  '消': '消', '除': '除', '增': '增', '減': '减', '乘': '乘', '損': '损', '益': '益',
  '獲': '获', '取': '取', '尋': '寻', '找': '找', '檢': '检', '查': '查', '覓': '觅',
  '觀': '观', '察': '察', '視': '视', '觸': '触', '摸': '摸', '握': '握', '持': '持',
  '擺': '摆', '搖': '摇', '彈': '弹', '跳': '跳', '躍': '跃', '跑': '跑', '走': '走',
  '停': '停', '駐': '驻', '留': '留', '滯': '滞', '剩': '剩', '餘': '余', '匯': '汇',
  '總': '总', '計': '计', '算': '算', '數': '数', '據': '据', '檔': '档', '案': '案',
  '資': '资', '訊': '讯', '報': '报', '告': '告', '簽': '签', '證': '证', '憑': '凭',
  '開': '开', '閉': '闭', '啟': '启', '發': '发', '佈': '布', '鎮': '镇', '壓': '压',
  '張': '张', '緊': '紧', '鬆': '松', '綁': '绑', '束': '束', '縛': '缚', '繞': '绕',
  '繼': '继', '續': '续', '斷': '断', '絕': '绝', '滅': '灭', '毀': '毁', '壞': '坏',
  '破': '破', '裂': '裂', '縫': '缝', '隙': '隙', '補': '补', '充': '充', '足': '足',
  '夠': '够', '滿': '满', '溢': '溢', '洩': '泄', '漏': '漏', '餘': '余',
  '薩': '萨', '維': '维', '納': '纳', '爾': '尔', '兒': '儿', '絲': '丝', '裡': '里',
  '迴': '回', '閣': '阁', '灣': '湾', '證': '证', '觀': '观', '點': '点',
};
const twToCn = (s) => [...s].map((ch) => tw2cn[ch] || ch).join('');

// qualifier regex: limited-edition / alt-form prefixes that must NOT override a base name
const QUALIFIER = /^(新春|泳装|万圣|圣诞|花嫁|幼|限定|活动|夏|水着|新年|正月|春|秋|冬|悪戯|極光|螺旋|開花|鳳凰|傲慢|怠惰|心願|光誕|絕冰|纏雷|星靈|女帝|超竜|煌炎|彩愛|運命|葬礼|第二|究明)/;

function hasSuffixKey(jp) {
  return /[《》（）()]/.test(jp);
}

function cnHasQualifier(cn) {
  // take first alias part (before '/')
  const primary = cn.split('/')[0].trim();
  return QUALIFIER.test(primary);
}

// ---- build unified ----
const unified = {}; // jp -> cn
const aliases = {};
const notes = {};

// 1) base: platform tsk_name (converted)
for (const [jp, tw] of Object.entries(tskName)) {
  unified[jp] = twToCn(tw);
  notes[jp] = 'platform';
}
for (const [jp, tw] of Object.entries(tskSub)) {
  unified[jp] = twToCn(tw);
  notes[jp] = 'platform';
}

// 2) sheet2 overrides
for (const m of sheet2) {
  const parts = m.cn.split('/').map((p) => p.trim()).filter(Boolean);
  const primary = parts[0] || m.cn;
  const jp = m.jp;
  if (hasSuffixKey(jp) || !cnHasQualifier(m.cn)) {
    unified[jp] = primary;
    notes[jp] = 'sheet2';
    if (parts.length > 1) aliases[jp] = parts.slice(1);
  } else {
    // qualified CN vs base key: keep platform base, record alias info only
    notes[jp] = notes[jp] || 'platform';
  }
}

// 3) biliwiki matched overrides (same qualifier rule)
for (const m of matched) {
  const jp = m.name;
  if (!unified[jp]) continue;
  if (hasSuffixKey(jp) || !cnHasQualifier(m.cn)) {
    unified[jp] = m.cn;
    notes[jp] = 'biliwiki';
  }
}

const result = { names: unified, aliases, notes };
fs.writeFileSync(`${DIR}/unified_names_v2.json`, JSON.stringify(result, null, 1), 'utf8');
console.log('unified total:', Object.keys(unified).length);
console.log('from sheet2:', Object.values(notes).filter((n) => n === 'sheet2').length);
console.log('from biliwiki:', Object.values(notes).filter((n) => n === 'biliwiki').length);
console.log('from platform:', Object.values(notes).filter((n) => n === 'platform').length);

// spot check important names
for (const jp of ['フィオナ', 'サーシャ', 'アナ', 'ソフィア', 'アポロ', 'コハルコ', 'ヴィーナス', 'せつな', 'イレーナ', 'ユーリス', 'みんな', '女子生徒Ａ']) {
  console.log(`${jp} => ${unified[jp] || 'MISSING'}  [${notes[jp]}]`);
}
