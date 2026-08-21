// 技能效果规则引擎：翻译 敵単体に144％のダメージ/重さ9.9％ダウン（27CT）/... 类文本
// 分析现有收集的技能效果文本，构建段级翻译规则
import fs from 'node:fs';

const log = (process.env.TSK_GAME || 'C:/Path/To/Twinkle_StarKnightsX') + '/BepInEx/LogOutput.log';
const nohit = fs.readFileSync(log, 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('[NoHit]'))
  .map((l) => l.replace(/^.*\[NoHit\]\s*/, '').trim())
  .filter((l) => /ダメージ|％|CT|ノックバック|ノーツ|萎縮|増加|減少/.test(l));

// 段级翻译规则
const segRules = [
  // 对象
  [/^敵単体に/, '对敌方单体造成'],
  [/^敵全体に/, '对敌方全体造成'],
  [/^対象とその左右２レーンにいる敵すべてに/, '对目标及左右两条车道上的所有敌人'],
  [/^対象とその左右１レーンにいる敵すべてに/, '对目标及左右一条车道上的所有敌人'],
  [/^味方全体の/, '我方全体的'],
  [/^自身の/, '自身的'],
  [/^いずれかの味方が/, '任意我方成员'],
  // 伤害
  [/(\d+(?:\.\d+)?)％のダメージ/, '$1%伤害'],
  [/(\d+(?:\.\d+)?)％のダメージを/, '$1%伤害'],
  // 增减
  [/被ダメージ(\d+(?:\.\d+)?)％増加/, '受击伤害增加$1%'],
  [/被ダメージ(\d+(?:\.\d+)?)％減少/, '受击伤害减少$1%'],
  [/ダメージ(\d+(?:\.\d+)?)％アップ/, '伤害提升$1%'],
  [/ダメージ(\d+(?:\.\d+)?)％ダウン/, '伤害降低$1%'],
  [/重さ(\d+(?:\.\d+)?)％ダウン/, '重量降低$1%'],
  [/ATK(\d+(?:\.\d+)?)％アップ/, 'ATK提升$1%'],
  [/基礎ATK(\d+(?:\.\d+)?)％アップ/, '基础ATK提升$1%'],
  [/EX消費量(\d+(?:\.\d+)?)％減少/, 'EX消耗量减少$1%'],
  // 状态
  [/(\d+)ノックバック/, '$1格击退'],
  [/(\d+)％の確率で萎縮を付与/, '$1%概率赋予萎缩'],
  [/萎縮を付与/, '赋予萎缩'],
  [/(\d+)CT/, '$1CT'],
  [/(\d+)ノーツ/, '$1音符'],
  [/前から(\d+)番目にいる味方のノーツを(\d+)前方に移動/, '将从前数第$1位我方成员的音符向前移动$2格'],
  [/味方のノーツを(\d+)前方に移動/, '将我方成员的音符向前移动$1格'],
];

// 段分割: / 分隔
function translateEffect(text) {
  const segs = text.split('/');
  const out = segs.map((seg) => {
    let s = seg.trim();
    for (const [re, fmt] of segRules) {
      s = s.replace(re, fmt);
    }
    return s;
  });
  return out.join('/');
}

const seen = new Set();
for (const l of nohit) {
  const t = translateEffect(l);
  if (t !== l) {
    if (!seen.has(l)) {
      seen.add(l);
      console.log(`  ${l.slice(0, 60)}`);
      console.log(`    -> ${t.slice(0, 60)}`);
    }
  }
}
console.log(`\n技能效果文本共 ${nohit.length} 条(去重 ${seen.size})`);
