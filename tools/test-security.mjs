// 安全审查专项测试: 验证所有安全加固点
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${d}`); } };

const patch = fs.readFileSync('E:/dsh/TSKHook/Patch.cs', 'utf8');
const notif = fs.readFileSync('E:/dsh/TSKHook/Notification.cs', 'utf8');
const auto = fs.readFileSync('E:/dsh/TSKHook/AutoTranslate.cs', 'utf8');
const trans = fs.readFileSync('E:/dsh/TSKHook/Translation.cs', 'utf8');
const config = fs.readFileSync('E:/dsh/TSKHook/Config.cs', 'utf8');
const plugin = fs.readFileSync('E:/dsh/TSKHook/Plugin.cs', 'utf8');
const windowCs = fs.readFileSync('E:/dsh/TSKHook/Window.cs', 'utf8');

console.log('=== 1. 网络请求面(应仅限白名单 HTTPS) ===');
// 所有出站 URL
const urls = [];
for (const [name, code] of [['Translation.cs', trans], ['AutoTranslate.cs', auto]]) {
  const re = /https?:\/\/[^\s"']+/g;
  for (const m of code.matchAll(re)) urls.push(`${name}: ${m[0]}`);
}
check('出站 URL 仅 HTTPS', urls.every((u) => u.includes('https://')), urls.join('; '));
check('Translation 固定白名单域名', trans.includes('https://translation.lolida.best/'));
check('API URL 来自配置(用户自选)', auto.includes('TSKConfig.ApiUrl'));
check('无 HTTP(明文)出站', !trans.includes('http://') && !auto.includes('http://'), '发现 http://');

console.log('\n=== 2. 无监听/服务端口 ===');
const allCode = [patch, notif, auto, trans, config, plugin, windowCs].join('\n');
check('无 HttpListener(不监听端口)', !allCode.includes('HttpListener'));
check('无 TcpListener/Socket 监听', !allCode.includes('TcpListener') && !allCode.includes('Socket('));
check('无 WebServer/端口绑定', !allCode.includes('WebServer') && !allCode.includes('Listen('));

console.log('\n=== 3. Web 日志脱敏(query 剥离) ===');
check('SendWebRequestDiag 剥离 query', patch.includes('url.IndexOfAny(QuerySeparators)'));
check('SendWebRequestDiag 默认关闭(诊断门控)', patch.includes('if (!TSKConfig.DiagnosticsEnabled || WebDiagCount >= 40) return;'));
check('日志截断 150 字符', patch.includes('safe.Length > 150'));

console.log('\n=== 4. 命令执行面 ===');
check('Notification 用 EncodedCommand(Base64, 防注入)', notif.includes('-EncodedCommand'));
check('SsPopup 路径引号包裹', notif.includes('\\"" + location + "\\"'));
check('无 cmd.exe 直接调用', !allCode.includes('cmd.exe'));

console.log('\n=== 5. 文件读写面(应限插件目录) ===');
check('词典目录固定', trans.includes('"./BepInEx/plugins/translation_zh_Hans"'));
const patchUi = fs.readFileSync('E:/dsh/TSKHook/PatchUi.cs', 'utf8');
check('字体路径硬编码候选', patchUi.includes('FontBundleCandidates'));
check('日志/收集文件在 plugins/font', allCode.includes('"font"'));

console.log('\n=== 6. 网络超时保护 ===');
check('HttpClient 15s 超时', trans.includes('TimeSpan.FromSeconds(15)'));
check('AutoTranslate API 超时有界', auto.includes('TimeSpan.FromSeconds(ApiTimeoutSec)') && auto.includes('ApiTimeoutSec = 45'));
check('词典加载不阻塞启动(本地秒载5s上限/远程转后台)', plugin.includes('initTask.Wait(TimeSpan.FromSeconds(5))') && plugin.includes('loading in background'));

console.log('\n=== 7. 密钥处理 ===');
check('密钥不写入日志', !allCode.includes('ApiKey') || !allCode.includes('LogInfo') || !/LogInfo.*ApiKey/.test(allCode));
check('无硬编码密钥', !allCode.includes('sk-') && !allCode.includes('apikey = "'));

console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail > 0 ? 1 : 0);
