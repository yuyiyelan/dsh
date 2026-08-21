// 一键打包:生成单一完整包 zip(无删除操作,时间戳目录/zip)
//   TSKHook-zh-Hans-完整包-<时间戳>.zip
//     ├── 使用说明.txt            (记事本一键打开)
//     ├── README.txt              (仓库说明)
//     ├── 1-汉化插件/             (解压覆盖游戏根目录)
//     └── 2-开发工具包/           (词典编辑器+工具+教程)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = 'E:/dsh';
const SRC = path.join(ROOT, 'TSKHook');
const GAME_DICT = 'C:/Users/KK/Twinkle_StarKnightsX/BepInEx/plugins/translation_zh_Hans';
const REL = path.join(ROOT, 'TSKHook-zh-Hans-发布包');
const d = new Date();
const stamp = d.toISOString().slice(0, 10).replaceAll('-', '') + '-' +
  String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
const STAGE = path.join(ROOT, 'TSKHook-完整包-' + stamp);
// 用纯 ASCII 文件名:GitHub Release 上传中文名会被替换成 '.' 等字符
const ZIP = path.join(ROOT, 'TSKHook-zh-Hans-v1.0-' + stamp + '.zip');

function zip(srcDir, zipPath) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command',
    'Compress-Archive -Path ' + JSON.stringify(srcDir + '\\*') + ' -DestinationPath ' + JSON.stringify(zipPath) + ' -CompressionLevel Optimal'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  console.log('ZIP ->', zipPath, (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1), 'MB');
}
function copyFiltered(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) {
      if (['bin', 'obj', 'xlsx-full', '_archive'].includes(f)) continue;
      copyFiltered(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}
function scanSecret(dir) {
  const hits = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (/ds_key|nt_key|api_ui_backup/.test(f)) { hits.push(p); continue; }
      if (/\.(json|mjs|md|txt|cs|html|ps1|csproj)$/.test(f)) {
        const s = fs.readFileSync(p, 'utf8');
        if (/sk-[A-Za-z0-9]{20,}/.test(s)) hits.push(p + ' (含sk-密钥)');
      }
    }
  };
  walk(dir);
  return hits;
}

console.log('=== 1. 组装 1-汉化插件(解压覆盖游戏) ===');
const modDst = path.join(STAGE, '1-汉化插件');
const pPlugins = path.join(modDst, 'BepInEx', 'plugins');
fs.mkdirSync(pPlugins, { recursive: true });
fs.copyFileSync(path.join(SRC, 'bin', 'Release', 'TSKHook.dll'), path.join(pPlugins, 'TSKHook.dll'));
fs.copyFileSync(path.join(SRC, 'config.json'), path.join(pPlugins, 'config.json'));
fs.copyFileSync(path.join(SRC, 'SS_Notification.ps1'), path.join(pPlugins, 'SS_Notification.ps1'));
copyFiltered(GAME_DICT, path.join(pPlugins, 'translation_zh_Hans'));
copyFiltered(path.join(REL, 'BepInEx', 'plugins', 'font'), path.join(pPlugins, 'font'));
console.log('词典:', fs.readdirSync(path.join(pPlugins, 'translation_zh_Hans')).length, '| 字体:', fs.readdirSync(path.join(pPlugins, 'font')).length);

console.log('=== 2. 组装 2-开发工具包 ===');
const devDst = path.join(STAGE, '2-开发工具包');
copyFiltered(path.join(SRC, 'tools'), devDst);
fs.renameSync(path.join(devDst, '工具使用教程.txt'), path.join(devDst, 'README.txt'));
console.log('工具包文件数:', fs.readdirSync(devDst).length);

console.log('=== 3. 根目录说明 ===');
fs.copyFileSync(path.join(REL, '使用说明.txt'), path.join(STAGE, '使用说明.txt'));
fs.copyFileSync(path.join(SRC, 'README.md'), path.join(STAGE, 'README.txt'));

console.log('=== 4. 打包 ===');
zip(STAGE, ZIP);

console.log('=== 5. 密钥终检(暂存目录,第1遍) ===');
const h = scanSecret(STAGE);
console.log(h.length ? h : '(无)');