// 应用 bwiki 权威名到 unified_names_v3.json
// 规则：对每个 日文名(基础或带形态后缀)，若其基础名在 bwiki 映射中，
//       则替换中文名为 bwiki名 + 原形态后缀。
// 形态后缀: （覚醒）（幼少）（魔王）《××》⟪××⟫(ちぃ) 等
import fs from 'node:fs';

const DIR = 'E:/dsh/TSKHook/tools/xlsx-extract';
const mapping = JSON.parse(fs.readFileSync(`${DIR}/final_bwiki_mapping.json`, 'utf8'));
const unified = JSON.parse(fs.readFileSync(`${DIR}/unified_names_v3.json`, 'utf8'));

// 构建: 基础日文名 -> bwiki名
// 注意 ソフィア -> 索菲娅 仅用于「新春加速器」限定，基础索菲亚保持"索菲亚"
// 处理: 若 bwiki名 与当前名只有细微差异，直接替换基础名
const changes = [];
let changedCount = 0;

// 特殊规则: 索菲亚 基础名保持"索菲亚"(bwiki基础页也是索菲亚), 仅限定形态用"索菲娅"
const special = {
  'ソフィア': { base: '索菲亚', suffix: '索菲娅' }, // 新春加速器
};

for (const [jp, cn] of Object.entries(unified.names)) {
  // 提取基础日文名(去形态)
  const jpBase = jp.replace(/（[^）]*）|\([^)]*\)|《[^》]*》|⟪[^⟫]*⟫|【[^】]*】|\[[^\]]*\]/g, '').trim();
  const mapped = mapping[jpBase];
  if (!mapped) continue;

  // 提取原形态后缀(中文侧)
  const suffixMatch = cn.match(/（[^）]*）|\([^)]*\)|《[^》]*》|⟪[^⟫]*⟫|【[^】]*】|\[[^\]]*\]/g);
  const suffix = suffixMatch ? suffixMatch.join('') : '';
  const cnBase = cn.replace(/（[^）]*）|\([^)]*\)|《[^》]*》|⟪[^⟫]*⟫|【[^】]*】|\[[^\]]*\]/g, '').trim();

  // 若基础中文名已经是 bwiki 名 -> 跳过
  if (cnBase === mapped) continue;

  // 特殊: 索菲亚
  if (jpBase === 'ソフィア') {
    if (suffix) { // 限定形态 -> 索菲娅
      const target = special['ソフィア'].suffix + suffix;
      if (cn !== target) { changes.push(`${jp}: ${cn} -> ${target}`); unified.names[jp] = target; changedCount++; }
    }
    continue;
  }

  const target = mapped + suffix;
  if (cn !== target) {
    changes.push(`${jp}: ${cn} -> ${target}`);
    unified.names[jp] = target;
    changedCount++;
  }
}

fs.writeFileSync(`${DIR}/unified_names_v3.json`, JSON.stringify(unified, null, 2), 'utf8');
console.log(`共修改 ${changedCount} 条:`);
changes.forEach((c) => console.log('  ' + c));
