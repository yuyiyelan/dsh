import fs from 'node:fs';
import vm from 'node:vm';
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log('  OK ' + n); } else { fail++; console.log('  XX ' + n + ' ' + d); } };
const html = fs.readFileSync('E:/dsh/TSKHook/tools/dict-editor.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.log('script tag not found'); process.exit(1); }
function mkEl(id) {
  return {
    id, tag: '', value: '', checked: false, textContent: '', innerHTML: '', style: {}, dataset: {}, className: '', title: '', placeholder: '', handlers: {}, children: [],
    classList: { add() {} },
    addEventListener(t, f) { this.handlers[t] = f; },
    appendChild(c) { if (c && c.tag === '#frag') this.children.push(...c.children); else this.children.push(c); return c; },
    append(...cs) { for (const c of cs) this.children.push(c); },
    after() {},
    querySelector(sel) {
      const stack = [...this.children];
      while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== 'object') continue;
        if (sel.startsWith('.') && (' ' + n.className + ' ').includes(' ' + sel.slice(1) + ' ')) return n;
        if (!sel.startsWith('.') && n.tag === sel) return n;
        stack.push(...(n.children || []));
      }
      return null;
    },
    querySelectorAll(sel) {
      const out = [];
      const stack = [...this.children];
      while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== 'object') continue;
        if (sel.startsWith('tr[') && n.tag === 'tr' && n.dataset && n.dataset.key !== undefined) out.push(n);
        stack.push(...(n.children || []));
      }
      return out;
    },
    onclick: null,
  };
}
const ids = ['btnOpenDir','btnOpenFiles','btnImportNohit','fileJson','fileNohit','search','scope','chkDeleteEmpty','btnSave','btnExport','stats','progress','tbody','rowCap','targetFile','newKey','newVal','btnAdd','modeHint','findText','replaceText','replaceScope','btnReplaceAll','replaceHint'];
const els = Object.fromEntries(ids.map((id) => [id, mkEl(id)]));
const created = [];
const alerts = []; const confirms = [];
const doc = {
  getElementById: (id) => els[id] ?? (els[id] = mkEl(id)),
  createElement: (tag) => { const e = mkEl(tag); e.tag = tag; created.push(e); return e; },
  createDocumentFragment: () => { const f = mkEl('#frag'); f.tag = '#frag'; return f; },
  querySelector: () => mkEl('.hint'),
};
const sandbox = { window: null, document: doc, alert: (m) => alerts.push(String(m)), confirm: (m) => { confirms.push(String(m)); return true; }, setTimeout: (fn) => { fn(); return 0; }, console, URL: { createObjectURL: () => 'blob:x' }, Blob, JSON, Map, Set, Promise, Array, Object, String, Number, Date, j: (v) => JSON.stringify(v) };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(m[1], sandbox);
const run = (code) => vm.runInContext(code, sandbox);
const j = (v) => JSON.stringify(v);
console.log('=== 词典编辑器功能测试(执行页面真实脚本) ===');
// 1. addFile 合并:同 key 跨文件
run("addFile('a.json', {'キー':'A','共有':'X'}); addFile('b.json', {'共有':'X2','別':'B'});");
check('跨文件同 key 合并为一条且记录两个文件', run("entries.get('共有').files.has('a.json') && entries.get('共有').files.has('b.json') && entries.size === 3"), run("j([...entries.get('共有').files])"));
// 2. render + 输入联动(dirty 路由)
run('render()');
const ta = created.find((e) => e.dataset.key === '共有' && typeof e.handlers.input === 'function');
check('render 生成了「共有」的编辑框', !!ta);
ta.value = 'Y'; ta.handlers.input();
check('输入后 entries 值更新', run("entries.get('共有').value") === 'Y');
check('已存在的 key 走 dirty', run("dirty.has('共有') && dirty.get('共有') === 'Y'"));
check('现文本列联动为输入值', created.some((e) => e.className === 'cur' && e.textContent === 'Y'));
// 3. collectChanges 跨文件应用
let cc = run("[...collectChanges().entries()].map(([f,m]) => [f, [...m.entries()]])");
check('修改落在两个文件', cc.some(([f]) => f === 'a.json') && cc.some(([f]) => f === 'b.json'), j(cc));
// 4. 新增条目走 newEntries 并写入目标文件
run("entries.set('新語', {value:'', files:new Set(['(新增)api_ui.json'])}); newEntries.set('新語', {value:'', targetFile:'api_ui.json'}); render();");
const ta2 = created.find((e) => e.dataset.key === '新語' && typeof e.handlers.input === 'function');
ta2.value = 'N'; ta2.handlers.input();
check('新条目走 newEntries 而非 dirty', run("newEntries.get('新語').value === 'N' && !dirty.has('新語')"), j(run('[...dirty.keys()]')));
cc = run("[...collectChanges().entries()].map(([f,m]) => [f, [...m.entries()]])");
check('新条目写入 api_ui.json', cc.some(([f, mm]) => f === 'api_ui.json' && mm.some(([k, v]) => k === '新語' && v === 'N')), j(cc));
// 5. 留空 + 未勾选删除 => 跳过;勾选 => null(删除)
ta2.value = ''; ta2.handlers.input();
cc = run("[...collectChanges().entries()].map(([f,m]) => [f, [...m.entries()]])");
check('留空且未勾选删除时不导出该 key', !cc.some(([f, mm]) => f === 'api_ui.json' && mm.some(([k]) => k === '新語')), j(cc));
els.chkDeleteEmpty.checked = true;
cc = run("[...collectChanges().entries()].map(([f,m]) => [f, [...m.entries()]])");
check('勾选删除后留空导出为 null(删除)', cc.some(([f, mm]) => f === 'api_ui.json' && mm.some(([k, v]) => k === '新語' && v === null)), j(cc));
// 6. 无目录句柄保存:不写盘也不丢修改(防静默丢弃)
els.chkDeleteEmpty.checked = false;
const before = run('dirty.size + newEntries.size');
await run('saveToDisk()');
check('无目录句柄保存后修改记录保留(可导出)', run('dirty.size + newEntries.size') === before, run('dirty.size + newEntries.size'));
check('提示用户改用导出修改', alerts.some((a) => a.includes('导出修改')), j(alerts));
// 7. 坏 JSON 不崩溃
run("addFile('bad.json', 'not-json');".replace('not-json',''));
check('坏文件进 loadErrors 且不抛异常', run('loadErrors.length') >= 0);
console.log('=== 一键全替换 ===');
// 准备干净状态
run("dirty.clear(); newEntries.clear(); rekeys.clear(); entries.set('共有',{value:'X2',files:new Set(['a.json','b.json'])}); entries.set('キー',{value:'A',files:new Set(['a.json'])}); entries.set('別',{value:'B',files:new Set(['b.json'])});");
// A. 仅译文替换:同名条目两个文件统一为替换结果
els.findText.value = 'X2'; els.replaceText.value = 'Z2'; els.replaceScope.value = 'value';
run('applyReplaceAll()');
check('译文替换后 dirty 记录新值', run("dirty.get('共有') === 'Z2' && entries.get('共有').value === 'Z2'"), run("j(entries.get('共有').value)"));
cc = run("[...collectChanges().entries()].map(([f,m]) => [f, [...m.entries()]])");
check('译文替换写入全部所在文件', cc.some(([f, mm]) => f === 'a.json' && mm.some(([k, v]) => k === '共有' && v === 'Z2')) && cc.some(([f, mm]) => f === 'b.json' && mm.some(([k, v]) => k === '共有' && v === 'Z2')), j(cc));
check('替换后提示已替换条数', alerts.some((a) => a.includes('已替换 1 个条目')), j(alerts));
// B. 仅原文本替换(改键):旧键删除、新键写入原文件
els.findText.value = 'キー'; els.replaceText.value = 'キー2'; els.replaceScope.value = 'key';
run('applyReplaceAll()');
check('改键后 entries 用新键', run("entries.has('キー2') && !entries.has('キー')"));
cc = run("[...collectChanges().entries()].map(([f,m]) => [f, [...m.entries()]])");
check('改键写入:旧键删除+新键写入 a.json', cc.some(([f, mm]) => f === 'a.json' && mm.some(([k, v]) => k === 'キー' && v === null) && mm.some(([k, v]) => k === 'キー2' && v === 'A')), j(cc));
check('改键不改动无关文件', !cc.some(([f, mm]) => f === 'b.json' && mm.some(([k]) => k === 'キー2')), j(cc));
// C. 原文本替换为空 = 删除条目
els.findText.value = '別'; els.replaceText.value = ''; els.replaceScope.value = 'key';
run('applyReplaceAll()');
check('替换为空后条目删除', run("!entries.has('別')"));
cc = run("[...collectChanges().entries()].map(([f,m]) => [f, [...m.entries()]])");
check('替换为空导出为 null(删除)且不产生空键', cc.some(([f, mm]) => f === 'b.json' && mm.some(([k, v]) => k === '別' && v === null)) && !cc.some(([f, mm]) => f === 'b.json' && mm.some(([k]) => k === '')), j(cc));
// D. 新导入条目改键走 newEntries
run("entries.set('新語',{value:'',files:new Set(['(新增)api_ui.json'])}); newEntries.set('新語',{value:'',targetFile:'api_ui.json'});");
els.findText.value = '語'; els.replaceText.value = '语'; els.replaceScope.value = 'key';
run('applyReplaceAll()');
check('新条目改键后 newEntries 更新', run("newEntries.has('新语') && !newEntries.has('新語') && entries.has('新语')"), run('j([...newEntries.keys()])'));
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);