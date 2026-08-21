# TSKHook 安全规则（Security Rules）

> 本文档定义 TSKHook 插件的安全边界与合规规则。
> 所有代码修改必须遵守本规则；安全审查测试见 `tools/test-security.mjs`。

## 1. 网络访问规则（禁止外部随意访问）

### 1.1 出站请求白名单
插件**只允许**发起以下出站 HTTPS 请求：

| 用途 | 目标 | 触发条件 |
|---|---|---|
| 在线词典下载 | `https://translation.lolida.best/download/...`（硬编码） | 本地词典缺失时 |
| 用户配置的翻译 API | `TSKConfig.ApiUrl`（用户手动填写） | 词典未命中且 `translationApi.enabled=true` |

**禁止**：
- ❌ 向白名单之外的任意域名发起请求（禁止 C2/回传/遥测）
- ❌ 使用 HTTP 明文协议（必须 HTTPS）
- ❌ 自动探测/扫描网络（禁止 SSRF 面）
- ❌ 将用户数据、游戏数据、日志上传到任何第三方（包括翻译 API 之外的服务）

### 1.2 无监听面
插件**不监听任何端口**、不开放任何本地服务、不接受外部连接：
- ❌ 禁止 `HttpListener` / `TcpListener` / `Socket` 监听
- ❌ 禁止 WebServer / 本地 HTTP 服务
- ❌ 禁止 RPC / IPC / 命名管道服务
- ✅ 插件是纯客户端单向调用（游戏内 Hook + 出站请求）

### 1.3 API 调用纪律
- 翻译 API 仅用于翻译词典未命中的游戏文本（原文逐句，无用户个人信息）
- 批量翻译时**同文本只请求一次**（InFlight 去重 + 持久化记忆）
- 默认限速：每批 3 条、每批间隔 350ms（牛翻译路径 200ms/条）
- API 失败/超时 → 静默显示原文，**不重试轰炸**、不影响游戏

## 2. 数据保护规则

### 2.1 日志脱敏
- 游戏 Web 请求日志（`[Web]`）**只记录 scheme+host+path**，剥离 `?`/`#` 后的 query 参数（防 token/会话泄露）
- 日志截断 150 字符
- **禁止**将 API 密钥、游戏会话凭证写入日志

### 2.2 密钥处理
- API 密钥存储在 `BepInEx/plugins/config.json`（明文，用户主目录私有文件）
- 插件**不读取**环境变量、注册表或其他位置的密钥
- 发布包中的 config.json 必须**密钥为空**（enabled=false）
- 开发机上的密钥文件 `tools/ds_key.txt`、`tools/nt_key.txt` 由 `.gitignore` 排除，**严禁提交仓库/打包分发**；仓库中只保留留空模板

### 2.3 文件写入边界
插件只能写入以下位置：
- `BepInEx/plugins/translation_zh_Hans/`（词典、api_ui.json 翻译记忆）
- `BepInEx/plugins/font/`（日志收集：tsk_nohit.txt 等）
- `./BepInEx/plugins/config.json`（配置回写）
- `C:\Users\<用户名>\Pictures\tsk_*.png`（F12 截图，官方功能）

**禁止**写入系统目录、其他用户目录、网络路径。

## 3. 命令执行规则

- 仅 `Notification` 类使用 `powershell.exe` 显示系统通知
- `Popup`：必须用 `-EncodedCommand`（Base64 UTF-16LE）传参——**防注入**
- `SsPopup`：文件路径必须**双引号包裹**
- **禁止**执行任意用户输入作为命令；禁止 `cmd.exe`、`ShellExecute` 动态命令

## 4. 外部输入处理

插件所有 Hook 处理的文本（游戏字符串）按**不可信数据**处理：
- 只读、不执行、不拼进命令
- 词典 key/value 不 eval、不反射调用
- 网络响应必须是 JSON 且经 `ReadJsonDictSafeAsync` 校验（非 `{` 开头即拒绝）

## 5. 审查流程

每次代码修改后运行：
```bash
node tools/test-security.mjs   # 安全审查（20 项）
node tools/test-review.mjs     # 代码结构审查（12 项）
node tools/unit-test.mjs       # 词典/配置一致性
```

任何修改不得破坏以上安全测试。

---

*最后更新：2026-08-20*
