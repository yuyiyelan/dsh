# TSKHook-zh-Hans — 简体中文汉化增强版

> 《Twinkle Star Knights》(闪亮星骑士,DMM Game Player 版)的 BepInEx IL2CPP 汉化插件。

**本项目的一切都建立在上游 [TSKModding/TSKHook](https://github.com/TSKModding/TSKHook)(v1.1.6, GPL-2.0) 之上**——
感谢原作者与社区提供的框架、在线词典与灵感。本仓库在其基础上把汉化从「繁体中文」全面修改为「简体中文」,
并增加离线词典、统一角色名、自动补翻、字形回退与词典编辑器等增强。许可同样为 **GPL-2.0**,请保留上游署名。
注：此插件完全由dsh生成并上传无任何人工，有任何疑问请直接去问ai,你问我我也是去问ai.
---

## ✨ 与上游版的区别

| 能力 | 上游 TSKHook | 本版 |
|---|---|---|
| 汉化语言 | 繁体中文 | **简体中文**(内置 OpenCC 繁→简转换:4148 字 + 2682 词组) |
| 角色名 | 繁体、不统一 | **统一简体译名**(多数据源合并 + 别名自动纠正) |
| 词典来源 | 仅在线 | 在线下载 + **本地离线词典**(`translation_zh_Hans/`,2600+ 章节) |
| 覆盖面 | 剧情 + 角色名 | + NPC 名 + 术语表 + 章节标题 + 对话历史 |
| 字体 | 繁体 TC 字库 | **ARIALUNI 全字库回退**:加载后简体原文直显,加载前按简→日/繁字形映射回退,无方框 |
| 未收录文本 | 显示原文 | **可选自动补翻**(OpenAI 兼容 API,后台线程、翻译一次永久复用、省 token) |
| 词典维护 | 手改 JSON | **可视化词典编辑器**(三列编辑 + 一键全替换 + 未翻译清单导入) |
| 网络健壮性 | 无超时可能卡死 | 15s 超时 + 本地缓存优先 + 失败退避 |

---

## 📦 安装(解压即用)

> ⚠️ 本仓库是**增强覆盖包**,不是独立插件:游戏本身不带 TSKHook,
> 请先到上游 [TSKModding/TSKHook](https://github.com/TSKModding/TSKHook)
> 按其说明安装基础版(自带 BepInEx 6 IL2CPP 注入 + 官方繁体插件 + 字库),
> 确认游戏里能看到繁体汉化后,再执行下面的覆盖安装。

1. 下载完整发布包,把其中的 `BepInEx` 文件夹**合并**进游戏根目录(如 `C:\Users\<你>\Twinkle_StarKnightsX\`);
3. **不要覆盖你原有的 `BepInEx\plugins\config.json`**(里面有你的设置与 API 密钥);
4. 启动游戏,按 **F10** 即可重载词典(改完词典不用重启)。

发布包内容:`TSKHook.dll` + `config.json` + 字体包(`font\`)+ 离线简体词典(`translation_zh_Hans\`)。

完整教程见发布包内 **使用说明.txt**(记事本一键打开)。

---

## ⚙️ 配置(config.json)

```json
{
    "speed": 0.5, "fps": 60, "translation": true,
    "translationLang": "zh_Hans",
    "translationApi": { "enabled": false, "url": "", "key": "", "model": "gpt-4o-mini" },
    "width": 1280, "height": 720, "zoom": 1.0,
    "diagnostics": false
}
```

- `translationLang`:`zh_Hans` 简体(默认)/ `zh_Hant` 繁体;
- `translationApi`:可选自动补翻(DeepSeek/通义/Kimi 等 OpenAI 兼容接口)。**密钥只保存在本机 config.json,严禁提交仓库**;
- `diagnostics`:诊断收集(Web 请求日志 / 字形导出 / 元数据扫描),默认关闭。

快捷键:**F1** 重读配置 · **F5-F8** 变速 · **F10** 清缓存+重载词典 · **F11** 开关汉化 · **F12** 截图 · **Ctrl** 跳过

---

## 🛠 词典编辑器(改译文不求人)

`tools/dict-editor.html` — 单文件,浏览器(Chrome/Edge)直接打开,无需任何环境:

- 三列编辑:**原文本 | 修改文本(在这里改) | 现文本(自动跟随)**;同原文本多处出现自动联动;
- **一键全替换**:查找→替换为→范围(全部/仅原文本/仅译文),批量统一译名;
- 导入 `tsk_nohit.txt` 未翻译清单,提前填好译文就**不再消耗 API**;
- 保存写盘 → 游戏内按 F10 生效。

---

## 🔨 构建(开发者)

```bash
# 要求:.NET SDK 8 + 游戏本体(提供 BepInEx interop DLL 引用)
# 1) 修改 TSKHook.csproj 的 <GamePath> 指向你的游戏目录
# 2) 编译
dotnet build TSKHook.csproj -c Release   # 产物 bin/Release/TSKHook.dll
```

> 注:tools/ 脚本内为开发机绝对路径(E:/dsh/TSKHook),克隆后按需替换;详见 `tools/工具使用教程.txt`。

数据生成工具(Node.js)与全部测试套件见 `tools/工具使用教程.md`。
修改代码后务必运行:
```bash
node tools/test-security.mjs && node tools/test-autotranslate.mjs && node tools/unit-test.mjs && node tools/unit-test2.mjs && node tools/test-dict-editor.mjs
dotnet run --project tools/verify -c Release && dotnet run --project tools/verify-equivalence -c Release
```

---

## 📁 仓库结构

```
├── *.cs                    # 插件源码(入口/Harmony Patch/词典/转换器)
├── SimToHanData.cs / HanConverterData.cs / UnifiedNames*.cs   # 自动生成数据表
├── config.json             # 配置模板(密钥留空)
├── translation_zh_Hans/    # 离线简体词典(2600+ 章节 JSON)
├── tools/                  # 生成器/测试/词典编辑器/开发工具包教程
└── SECURITY.md             # 安全边界(出站白名单/密钥纪律/无监听面)
```

> 字体包(约 150MB)与编译产物 DLL 不随仓库分发,请用发布包或自行构建。

---

## 🙏 致谢

- **[TSKModding/TSKHook](https://github.com/TSKModding/TSKHook)** — 上游项目(GPL-2.0),本仓库的基石,深表感谢;
- [translation.lolida.best](https://translation.lolida.best) — 社区协作翻译平台(zh_Hant,自动转简体);
- [OpenCC](https://github.com/BYVoid/OpenCC)(Apache-2.0) — 繁→简转换数据;
- [hanzi2kanji](https://github.com/BHznJNs/hanzi2kanji) — 简→日字形映射;
- BiliGame Wiki 与社区整理表格(kurusuta.xlsx) — 统一角色名来源。

---

## 📜 许可

GPL-2.0(继承自上游)。仅供学习交流,请勿用于商业用途。使用修改插件违反游戏与 DMM 用户协议,风险自负。
