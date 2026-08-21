// v3 matching: prefer plain (no-bracket) biliwiki pages; extract name from bracketed variants
import fs from 'node:fs';

const DIR = 'E:/dsh/TSKHook/tools/xlsx-extract';

const tsv = fs.readFileSync(`${DIR}/sheet6_星骑士索引.tsv`, 'utf8').split('\n').filter(Boolean);
const sheet6 = tsv.map((line) => {
  const [id, title, name, star, kind, attr, race, type, weapon, school, date] = line.split('\t');
  return { id, title, name, star: star.replace('★', ''), kind, attr, race, type, weapon, school, date };
});

const wiki = JSON.parse(fs.readFileSync(`${DIR}/biliwiki_roles.json`, 'utf8'));
// split plain vs bracketed
const plain = wiki.filter((w) => !/^［.+］/.test(w.fulltext));
const bracketed = wiki.filter((w) => /^［.+］/.test(w.fulltext));
console.log('plain:', plain.length, 'bracketed:', bracketed.length);

const normAttr = (a) => (a === '炎' ? '火' : a);
const normType = (t) => ({ ATK: '攻击', DEF: '防御', SUP: '辅助', HEAL: '治疗', SPD: '敏捷' }[t] || t);

// extract name after ］ from bracketed fulltext: ［称号］菲奥娜《魔王》 -> 菲奥娜《魔王》
function extractName(fulltext) {
  const m = fulltext.match(/］(.+)$/);
  return m ? m[1].trim() : fulltext;
}

function key(w, star, attr, race, type, weapon) {
  return [star, normAttr(attr), race.split(/[,，/]|、/)[0].trim(), normType(type), weapon].join('|');
}

// index bracketed by key (star+attr+race+type+weapon)
const bracketIdx = new Map();
for (const w of bracketed) {
  const k = key(w, w.star, w.attr, w.race, w.type, w.weapon);
  if (!bracketIdx.has(k)) bracketIdx.set(k, []);
  bracketIdx.get(k).push(w);
}

const matched = [];
const unmatched = [];
for (const s of sheet6) {
  // 1) exact plain match by attributes
  const pk = key(s, s.star, s.attr, s.race, s.type, s.weapon);
  const plainCands = plain.filter((w) => key(w, w.star, w.attr, w.race, w.type, w.weapon) === pk);
  if (plainCands.length === 1) {
    matched.push({ ...s, cn: plainCands[0].fulltext, source: 'plain' });
    continue;
  }
  // 2) bracketed candidates -> extract name
  const bCands = bracketIdx.get(pk) || [];
  if (bCands.length === 1) {
    matched.push({ ...s, cn: extractName(bCands[0].fulltext), source: 'bracket', page: bCands[0].fulltext });
    continue;
  }
  // 3) loose match: star+attr+race only (ignore type/weapon)
  const loose = wiki.filter((w) => w.star === s.star && normAttr(w.attr) === normAttr(s.attr) && w.race.split(/[,，/]|、/)[0].trim() === s.race.split(/[,，/]|、/)[0].trim());
  const loosePlain = loose.filter((w) => !/^［.+］/.test(w.fulltext));
  const looseBracketed = loose.filter((w) => /^［.+］/.test(w.fulltext));
  if (loosePlain.length === 1) {
    matched.push({ ...s, cn: loosePlain[0].fulltext, source: 'loose-plain' });
    continue;
  }
  if (looseBracketed.length === 1) {
    matched.push({ ...s, cn: extractName(looseBracketed[0].fulltext), source: 'loose-bracket', page: looseBracketed[0].fulltext });
    continue;
  }
  unmatched.push({ ...s, reason: 'none' });
}

console.log('matched:', matched.length, 'unmatched:', unmatched.length);
fs.writeFileSync(`${DIR}/matched_names3.json`, JSON.stringify(matched, null, 1), 'utf8');
fs.writeFileSync(`${DIR}/unmatched_names3.json`, JSON.stringify(unmatched, null, 1), 'utf8');

// summary by source
const bySrc = {};
for (const m of matched) bySrc[m.source] = (bySrc[m.source] || 0) + 1;
console.log('by source:', bySrc);

// show key characters
for (const id of ['001001', '002001', '003001', '001002', '001004']) {
  const m = matched.find((x) => x.id === id);
  console.log(id, m ? `${m.name} => ${m.cn} [${m.source}]` : 'NOT MATCHED');
}
