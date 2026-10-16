# HSR-TG-Bot

一个专为《崩坏：星穹铁道》设计的 Telegram 小助手，支持查询角色面板和抽卡分析。

## 🚀 核心功能
- **角色面板查询**：支持实时同步与本地持久化，内置遗器评分系统。
- **抽卡统计分析**：支持 URL 同步及 JSON 文件导入，提供可视化进度条与运气评价。
- **热重载机制**：支持业务逻辑、UI 配置及元数据的无缝热更新，无需重启服务。
- **并发 API 竞速**：集成多个数据源，确保高可用与快速响应。
- **云崽风格日志**：美观、直观的后台操作日志系统。

## 🛠️ 技术栈
- **框架**：[Telegraf](https://telegraf.js.org/) (Telegram Bot API)
- **数据库**：Valkey (兼容 Redis) + JSON 文件持久化
- **运行时**：Node.js
- **依赖**：Axios, Moment, Dotenv, ioredis

## 📦 快速开始

### 1. 安装依赖
```bash
pnpm install
```

### 2. 配置环境
复制 `.env.example` 为 `.env` 并填写相关信息：
- `BOT_TOKEN`: 你的 Telegram Bot Token
- `ADMIN_TG_ID`: 管理员的 Telegram ID (用于热重载权限)
- `VALKEY_URL`: 缓存数据库连接地址

### 3. 运行
```bash
node main.js
```

长期运行时应交由进程管理器托管。例如 systemd 服务使用
`Restart=on-failure` 和 `RestartSec=5`：启动失败或 Telegram 长轮询意外终止时，
程序会以状态码 1 退出，触发自动重启。直接在终端运行时，需要手动重新启动。
该错误路径仅记录错误类型和代码，不输出含 Telegram token 的请求 URL 或完整消息。

### 日志脱敏

通过 `main.js` 启动时，日志始终隐藏符合 Telegram bot token 格式的内容，
包括 console 输出、依赖直接写入 stdout/stderr 的内容和分段写入的 token。
此功能按格式匹配，不需要读取 token 配置。

如需同时隐藏 Telegram / 游戏 ID，添加启动参数：

```bash
bun main.js --redact-ids
```

Node.js 也支持相同参数。systemd 服务则在 `ExecStart` 的 `main.js` 后添加
`--redact-ids`，修改后执行 `systemctl --user daemon-reload` 并重启服务。
此选项隐藏连续的 5 位及以上数字（包括负数群 ID），也可能隐藏长计数或数字时间戳；
常见日期时间格式、HTTP 错误码及四位角色 ID 保留。用户名和昵称仍会显示。
脱敏仅影响新写出的日志，不修改机器人消息、请求、用户缓存或已有日志。
没有换行的分段输出会等到换行或进程正常退出时才写出。

## ⌨️ 指令说明
- `/start` - 开始使用
- `/bind [UID]` - 绑定账号
- `/me` - 个人中心
- `/profile [UID]` - 面板查询
- `/gacha [URL]` - 抽卡分析
- `/reload` - 重载配置 (管理员)

## 📄 开源协议
MIT
