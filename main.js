// main.js
const { Telegraf } = require('telegraf');
require('dotenv').config();
const valkeyServer = require('./src/cache/server');
const { setupHandlers } = require('./src/bot/handlers');
const logger = require('./src/utils/logger');

async function bootstrap() {
    try {
        // 1. 启动缓存数据库服务
        await valkeyServer.start();

        // 2. 初始化 Telegram Bot 实例
        const bot = new Telegraf(process.env.BOT_TOKEN);

        // 3. --- 配置全局菜单指令 ---
        const publicCommands = [
            { command: 'start', description: '开始使用并获取欢迎信息' },
            { command: 'bind', description: '绑定星铁UID (开启数据持久化)' },
            { command: 'me', description: '个人中心 (查看已绑定信息)' },
            { command: 'profile', description: '角色面板查询 [UID]' },
            { command: 'gacha', description: '抽卡统计分析 [URL/JSON]' },
            { command: 'help', description: '查看详细功能说明与帮助' }
        ];

        // 刷新普通用户的公共菜单
        await bot.telegram.setMyCommands(publicCommands);

        // 刷新管理员菜单 (公共菜单 + 管理员特权指令合并展示)
        if (process.env.ADMIN_TG_ID) {
            await bot.telegram.setMyCommands([
                ...publicCommands,
                { command: 'reload', description: '【管理员】重载全量业务与配置文件' }
            ], {
                scope: { type: 'chat', chat_id: Number(process.env.ADMIN_TG_ID) }
            });
        }
        logger.done('菜单指令已成功同步至 Telegram 服务器 (已隔离用户权限)');

        // 4. 初始化业务流网关 (全局仅此一次绑定，内部实现路由平滑替换)
        setupHandlers(bot);

        // 5. 启动长轮询监听
        await bot.launch();
        logger.done('🚀 HSR-TG-Bot 已成功启动并安全运行中');
    } catch (err) {
        logger.error('机器人启动发生严重错误', err);
    }
}
bootstrap();
