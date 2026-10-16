// main.js
// 必须先于 dotenv、业务模块和依赖安装，覆盖初始化阶段的日志。
require('./src/utils/log-redaction').installLogRedaction();
const { Telegraf } = require('telegraf');
require('dotenv').config();
const valkeyServer = require('./src/cache/server');
const { setupHandlers } = require('./src/bot/handlers');
const logger = require('./src/utils/logger');
const { summarizeError } = require('./src/utils/error-summary');

async function bootstrap() {
    try {
        // 1. 启动缓存数据库服务
        await valkeyServer.start();

        // 2. 初始化 Telegram Bot 实例
        const bot = new Telegraf(process.env.BOT_TOKEN);

        // 默认处理器会输出完整 update；改为安全摘要，再让致命错误交给顶层处理。
        bot.catch((err) => {
            logger.error('Telegram 消息处理失败', summarizeError(err));
            throw err;
        });

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
            try {
                await bot.telegram.setMyCommands([
                    ...publicCommands,
                    { command: 'reload', description: '【管理员】重载全量业务与配置文件' }
                ], {
                    scope: { type: 'chat', chat_id: process.env.ADMIN_TG_ID }
                });
                logger.done('管理员专属菜单已成功同步');
            } catch (err) {
                logger.error('设置管理员菜单失败', summarizeError(err));
            }
        }
        logger.done('菜单指令已成功同步至 Telegram 服务器 (已隔离用户权限)');

        // 4. 初始化业务流网关 (全局仅此一次绑定，内部实现路由平滑替换)
        setupHandlers(bot);

        // 5. 启动长轮询监听
        // 长轮询模式下 launch() 会持续等待，不能在 await 后记录启动成功。
        await bot.launch({}, () => logger.done('Telegram 身份验证成功，正在启动长轮询'));
        // 此程序没有主动停止轮询的路径；意外返回也必须通知进程管理器。
        throw new Error('Polling stopped unexpectedly');
    } catch (err) {
        logger.error('机器人启动或长轮询终止，退出并等待进程管理器重启', summarizeError(err));
        try {
            // 只停止本进程拉起的私有 Valkey，不影响已有的系统服务。
            valkeyServer.stop();
        } finally {
            // Redis 连接可能继续占用事件循环，仅设置 exitCode 不会让进程退出。
            process.exit(1);
        }
    }
}
bootstrap();
