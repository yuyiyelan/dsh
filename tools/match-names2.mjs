// Retry matching with relaxed attrs (ignore school; normalize 炎/火, 学园/学院)
import fs from 'node:fs';

const DIR = 'E:/dsh/TSKHook/tools/xlsx-extract';

const tsv = fs.readFileSync(`${DIR}/sheet6_星骑士索引.tsv`, 'utf8').split('\n').filter(Boolean);
const sheet6 = tsv.map((line) => {
  const [id, title, name, star, kind, attr, race, type, weapon, school, date] = line.split('\t');
  return { id, title, name, star: star.replace('★', ''), kind, attr, race, type, weapon, school, date };
});

const wiki = JSON.parse(fs.readFileSync(`${DIR}/biliwiki_roles.json`, 'utf8'));

const normAttr = (a) => (a === '炎' ? '火' : a);
const normType = (t) => ({ ATK: '攻击', DEF: '防御', SUP: '辅助', HEAL: '治疗', SPD: '敏捷' }[t] || t);
const normSchool = (s) => s.replace(/学[院園]/g, '学园').replace(/[，,、]/g, ',');

// index wiki by tuple (star, attr, race-primary, type, weapon)
function wikiKey(w) {
  const race = w.race.split(',')[0].trim();
  return [w.star, normAttr(w.attr), race, w.type, w.weapon].join('|');
}
const wikiIdx = new Map();
for (const w of wiki) {
  const k = wikiKey(w);
  if (!wikiIdx.has(k)) wikiIdx.set(k, []);
  wikiIdx.get(k).push(w);
}

const matched = [], unmatched = [];
for (const s of sheet6) {
  const k = [s.star, normAttr(s.attr), s.race.split('/')[0].trim(), normType(s.type), s.weapon].join('|');
  const cands = wikiIdx.get(k) || [];
  if (cands.length === 1) matched.push({ ...s, cn: cands[0].fulltext });
  else unmatched.push({ ...s, reason: cands.length === 0 ? 'none' : `multi(${cands.map(c => c.fulltext).join(',')})` });
}
console.log('matched:', matched.length, '/', sheet6.length, ' unmatched:', unmatched.length);
fs.writeFileSync(`${DIR}/matched_names2.json`, JSON.stringify(matched, null, 1), 'utf8');
fs.writeFileSync(`${DIR}/unmatched_names2.json`, JSON.stringify(unmatched, null, 1), 'utf8');

console.log('\n=== MATCHED ===');
for (const m of matched.slice(0, 20)) console.log(`${m.name} (${m.title}) => ${m.cn}`);
console.log('\n=== UNMATCHED (first 40) ===');
for (const u of unmatched.slice(0, 40)) console.log(`${u.name} (${u.title}) [${u.star}星 ${u.attr} ${u.race} ${u.type} ${u.weapon} ${u.school}] ${u.reason}`);
