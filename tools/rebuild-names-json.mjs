// 按 bwiki 权威名重建 names.json(游戏目录版)
// 来源: unified_names_v3.names 中与日文名对应的中文名
// 但 names.json 只含角色名条目(629条), 直接逐条映射日文名 -> 新中文名
import fs from 'node:fs';

const DIR = 'E:/dsh/TSKHook/tools/xlsx-extract';
const unified = JSON.parse(fs.readFileSync(`${DIR}/unified_names_v3.json`, 'utf8')).names;

// 游戏目录 names.json
const SRC = 'C:/Users/KK/Twinkle_StarKnightsX/BepInEx/plugins/translation_zh_Hans/names.json';
const nj = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// 对 names.json 每个条目: 若日文名在 unified 中, 用 unified 值(已是bwiki名)
// 若不在(unified无此条目), 保持原值
let changed = 0;
for (const [jp, cn] of Object.entries(nj)) {
  const u = unified[jp];
  if (u !== undefined && u !== cn) {
    console.log(`${jp}: ${cn} -> ${u}`);
    nj[jp] = u;
    changed++;
  }
}
fs.writeFileSync('E:/dsh/TSKHook/translation_zh_Hans/names.json', JSON.stringify(nj, Object.keys(nj).sort(), 0), 'utf8');
console.log(`共更新 ${changed} 条 -> 已写入工作区 names.json`);
