// Match sheet6 JP names with biliwiki CN names via attributes
import fs from 'node:fs';

const DIR = 'E:/dsh/TSKHook/tools/xlsx-extract';

// 1. load sheet6 tsv (already dumped)
const tsv = fs.readFileSync(`${DIR}/sheet6_星骑士索引.tsv`, 'utf8').split('\n').filter(Boolean);
const sheet6 = tsv.map((line) => {
  const [id, title, name, star, kind, attr, race, type, weapon, school, date] = line.split('\t');
  return { id, title, name, star: star.replace('★', ''), kind, attr, race, type, weapon, school, date };
});
console.log('sheet6 count:', sheet6.length);

// 2. load biliwiki roles
const wiki = JSON.parse(fs.readFileSync(`${DIR}/biliwiki_roles.json`, 'utf8'));
console.log('wiki count:', wiki.length);

// type mapping: sheet6 ATK/DEF/SUP/HEAL/SPD -> wiki 攻击/防御/辅助/治疗/敏捷
const typeMap = { ATK: '攻击', DEF: '防御', SUP: '辅助', HEAL: '治疗', SPD: '敏捷' };

// build index from wiki by attribute tuple
const wikiByAttrs = new Map();
for (const w of wiki) {
  const key = [w.star, w.attr, w.race, typeMap[w.type] || w.type, w.weapon, w.school].join('|');
  if (!wikiByAttrs.has(key)) wikiByAttrs.set(key, []);
  wikiByAttrs.get(key).push(w);
}

// match each sheet6 entry
const matched = [];
const unmatched = [];
for (const s of sheet6) {
  const key = [s.star, s.attr, s.race, s.type, s.weapon, s.school].join('|');
  const cands = wikiByAttrs.get(key) || [];
  if (cands.length === 1) {
    matched.push({ ...s, cn: cands[0].fulltext, roleName: cands[0].roleName });
  } else if (cands.length > 1) {
    unmatched.push({ ...s, reason: `multiple(${cands.map(c => c.fulltext).join(',')})` });
  } else {
    unmatched.push({ ...s, reason: 'none' });
  }
}
console.log('matched:', matched.length, 'unmatched:', unmatched.length);
fs.writeFileSync(`${DIR}/matched_names.json`, JSON.stringify(matched, null, 1), 'utf8');
fs.writeFileSync(`${DIR}/unmatched_names.json`, JSON.stringify(unmatched, null, 1), 'utf8');

console.log('\n=== MATCHED sample ===');
for (const m of matched.slice(0, 15)) console.log(`${m.name} (${m.title}) => ${m.cn}`);
console.log('\n=== UNMATCHED ===');
for (const u of unmatched.slice(0, 60)) console.log(`${u.name} (${u.title}) [${u.star}星 ${u.attr} ${u.race} ${u.type} ${u.weapon} ${u.school}] reason=${u.reason}`);
