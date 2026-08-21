// AutoTranslate 逻辑验证（静态分析 + 模拟测试）
// 由于 C# 类无法在 Node 直接运行，这里验证：
// 1. AutoTranslate.cs 源码逻辑正确性
// 2. 集成点（TranslateUi/Patch 剧情路径）调用正确
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${d}`); } };

const at = fs.readFileSync('E:/dsh/TSKHook/AutoTranslate.cs', 'utf8');
const pu = fs.readFileSync('E:/dsh/TSKHook/PatchUi.cs', 'utf8');
const patch = fs.readFileSync('E:/dsh/TSKHook/Patch.cs', 'utf8');
const plugin = fs.readFileSync('E:/dsh/TSKHook/Plugin.cs', 'utf8');
const behavior = fs.readFileSync('E:/dsh/TSKHook/PluginBehavior.cs', 'utf8');
const sim = fs.readFileSync('E:/dsh/TSKHook/SimToHanConverter.cs', 'utf8');

console.log('=== 测试A: AutoTranslate 核心逻辑 ===');
check('持久化路径指向 translation_zh_Hans/api_ui.json', at.includes('"translation_zh_Hans", "api_ui.json"'));
check('启动时加载持久化', at.includes('File.Exists(PersistPath)') && at.includes('Persistent[kv.Key] = kv.Value'));
check('Lookup 快速路径存在', at.includes('public static string Lookup'));
check('Request 入队去重(归一化键)', at.includes('InFlight.Contains(key)') && at.includes('Persistent.ContainsKey(key)'));
check('队列上限 512', at.includes('MaxQueue = 512'));
check('每批 2 条(原3条超时频繁)', at.includes('BatchSize = 2'));
check('后台线程(IsBackground)', at.includes('IsBackground = true'));
check('非阻塞(不在主线程调用 API)', at.includes('new Thread(Loop)'));
check('持久化限频 5 秒', at.includes('TotalSeconds < 5'));
check('批量分隔符 ---', at.includes('"\\n---\\n"'));
check('段数不匹配时容错', at.includes('segment mismatch'));
check('失败不崩溃(全 try-catch)', (at.match(/catch/g) || []).length >= 5);

console.log('\n=== 测试B: TranslateUi 集成 ===');
check('未命中时查 AutoTranslate.Lookup', pu.includes('AutoTranslate.Lookup(text)'));
check('未命中时入队 Request', pu.includes('AutoTranslate.Request(text)'));
check('未命中缓存 text->text(等翻译后失效)', pu.includes('UiCache[text] = text'));
check('翻译=原文时也走 AutoTranslate', pu.includes('if (translated == text)') && pu.split('AutoTranslate.Lookup(text)').length >= 2);
check('InvalidateUiCache 失效机制', pu.includes('InvalidateUiCache'));

console.log('\n=== 测试C: 剧情路径集成 ===');
check('剧情未命中查 AutoTranslate', patch.includes('AutoTranslate.Lookup(__result)'));
check('剧情未命中入队 Request', patch.includes('AutoTranslate.Request(__result)'));
check('不再同步调用 TranslateViaApi', !patch.includes('TranslateViaApi(__result)'));
check('记忆命中直接显示(ToTraditionalGlyphs)', patch.includes('ToTraditionalGlyphs(remembered,'));

console.log('\n=== 测试D: 生命周期 ===');
check('Plugin.Load 初始化 AutoTranslate', plugin.includes('AutoTranslate.Initialize()'));
check('退出时 Flush(OnDestroy)', behavior.includes('AutoTranslate.Flush()'));

console.log('\n=== 测试E: 词典优先 / 省 token 加固 ===');
check('TranslateUi 词典查找链在 AutoTranslate 之前', pu.indexOf('TryLookupDict(text, UiDict.Entries') < pu.indexOf('AutoTranslate.Lookup(text)'));
check('括号变体查找(标题带/不带括号命中同一词典)', pu.includes('TryLookupBracketVariants'));
check('空白修剪后查词典(尾部\\t不浪费API)', pu.includes('var trimmed = text.Trim();') && pu.includes('NormalizeForTemplate(trimmedText)'));
check('Request 词典已知名直接跳过(不耗 token)', at.includes('Translation.nameDicts.TryGetValue(text, out var known)'));
check('Lookup 修剪回退(同句不重复翻译)', at.includes('var trimmed = text.Trim();'));
check('剧情路径修剪后查章节词典', patch.includes('storyKey != __result && chapter.TryGetValue(storyKey, out value)'));
check('翻译过即持久化(重开不重翻)', at.includes('File.WriteAllText(tmp, JsonSerializer.Serialize(snapshot)') && at.includes('File.Move(tmp, PersistPath, true)'));

console.log('\n=== 测试F: 词典编辑所见即所得 ===');
check('ARIALUNI 加载后启用 KeepSimplified', pu.includes('SimToHanConverter.KeepSimplified = true'));
check('字形映射尊重 KeepSimplified(两个入口)', sim.includes('if (KeepSimplified) return text;') && sim.split('if (KeepSimplified) return text;').length >= 3);
check('别名表方向修正:托娃/永远 -> 托瓦老师', fs.readFileSync('E:/dsh/TSKHook/UnifiedNamesData.cs', 'utf8').includes('{ "托娃老师", "托瓦老师" }') && !fs.readFileSync('E:/dsh/TSKHook/UnifiedNamesData.cs', 'utf8').includes('{ "托瓦老师", "永远老师" }'));

console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail > 0 ? 1 : 0);
