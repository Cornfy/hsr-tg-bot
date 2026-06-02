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

## ⌨️ 指令说明
- `/start` - 开始使用
- `/bind [UID]` - 绑定账号
- `/me` - 个人中心
- `/profile [UID]` - 面板查询
- `/gacha [URL]` - 抽卡分析
- `/reload` - 重载配置 (管理员)

## 📄 开源协议
MIT
