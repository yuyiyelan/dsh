// 同步词典正文: 将所有旧中文名替换为 bwiki 名
// 注意顺序: 长名优先(最长匹配), 且排除会被误伤的短名
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'E:/dsh/TSKHook/translation_zh_Hans';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));

// 替换对: 旧名 -> bwiki名 (按长度降序, 避免 优莉 替换 优莉安娜 等)
const pairs = [
  ['玛古达蕾娜', '玛格妲蕾娜'],
  ['希尔忒欧娜', '希露迪欧涅'],
  ['伊克西利翁', '伊克希里昂'],
  ['艾斯梅拉露达', '艾丝梅拉妲'],
  ['爱尔戴丽泽', '艾尔狄丽洁'],
  ['莉可琳菲娅', '莉可林菲娅'],
  ['贝尔特丽丝', '贝阿朵莉丝'],
  ['特留法依娜', '特里菲娜'],
  ['柯哈露可', '小春子'],
  ['梅露艾尔', '梅尔艾尔'],
  ['夏露蕾努', '夏蕾努'],
  ['维斯特丽亚', '威斯缇利娅'],
  ['菲尼艾尔', '菲妮艾尔'],
  ['杰克利努', '杰奎琳'],
  ['罗库纱娜', '罗克姗娜'],
  ['爱思特露', '艾斯提尔'],
  ['蕾缇西娅', '蕾蒂西亚'],
  ['帕露米尔', '帕鲁米埃'],
  ['英格丽德', '英格丽特'],
  ['托瓦老师', '永远老师'],
  ['帕特露', '帕提尔'],
  ['芙莉希', '菲莉希'],
  ['瓦乐莉', '巴蕾莉'],
  ['朱丽尔特', '朱丽叶特'],
  ['美奈子', '米涅可'],
  ['克洛托', '库洛特'],
  ['玛托伊', '玛托依'],
  ['优莉', '尤莉'],
  ['夏珑', '莎隆'],
  ['莎兰', '莎朗'],
  ['赛娜里', '赛娜丽'],
  ['伊妮修', '伊妮什'],
  ['瑟多纳', '塞德娜'],
  ['尤里斯', '尤利斯'],
  ['特莉莎', '特莉夏'],
  ['莉普露', '莉普尔'],
  ['拉特耶', '拉缇耶'],
  ['莉娅', '莉亚'],
  ['赛西娅', '塞西亚'],
  ['蕾米卡', '雷米卡'],
  ['希佑', '希祐'],
  ['英古丽多', '英格丽特'],
  ['塞西莉娅', '塞西莉亚'],
  ['雷幸', '幸'],
  ['美游', '缪'],
  ['璃诺', '莉诺'],
  ['洛洛特', '萝萝特'],
  ['希露比', '希尔薇'],
  ['修蒂蕾', '施蒂勒'],
  ['梅特欧拉', '梅忒欧拉'],
  ['露涅娅', '露妮娅'],
  ['乌鲁斯拉', '乌尔斯拉'],
  ['彩花', '伊吕波'],
  ['镜流', '静流'],
  ['库莘', '空贤'],
  ['菲欧娜', '菲奥娜'],
  ['玛哈姆特', '玛哈姆特'], // 无变化, 跳过
].filter(([a, b]) => a !== b).sort((x, y) => y[0].length - x[0].length);

// 危险: '幸' 单字会误伤"幸福/幸运"等词! 移除单字替换
// 且 '雷幸'/'雷雷幸' 在正文中是 サチ 的称呼, 替换为'幸'会破坏语境, 跳过正文替换(仅姓名栏统一)
const filtered = pairs.filter(([a]) => a.length >= 2 && a !== '雷幸' && a !== '雷雷幸');

let totalFiles = 0, totalRepl = 0;
for (const f of files) {
  const p = path.join(DIR, f);
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { continue; }
  let out = raw;
  let fileRepl = 0;
  for (const [oldS, newS] of filtered) {
    if (out.includes(oldS)) {
      const cnt = (out.match(new RegExp(oldS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      out = out.split(oldS).join(newS);
      fileRepl += cnt;
    }
  }
  if (fileRepl > 0) {
    // 验证仍为合法 JSON
    JSON.parse(out);
    fs.writeFileSync(p, out, 'utf8');
    totalFiles++;
    totalRepl += fileRepl;
    console.log(`${f}: ${fileRepl} 处`);
  }
}
console.log(`\n共更新 ${totalFiles} 个文件, ${totalRepl} 处替换`);
