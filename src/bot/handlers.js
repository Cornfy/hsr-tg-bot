// src/bot/handlers.js
/**
 * 机器人消息路由网关模块
 * 负责初始化业务处理链、处理全局指令、强制重载机制及日志记录
 */
const path = require('path');
const { Composer } = require('telegraf');
const { loadModule } = require('../utils/loader');
const logger = require('../utils/logger');

// 当前激活的动态路由 Composer 容器指针
let currentHandlers = null;

/**
 * 加载机器人所需的全部基础配置 (常量、语言包、设置)
 * @returns {Object} 包含 CONST, I18N_MODULE, SETTINGS 的对象
 */
const getFullCfg = () => ({
    CONST: loadModule(path.join(process.cwd(), 'config/game-constants.js'), true),
    I18N_MODULE: loadModule(path.join(process.cwd(), 'config/bot-i18n.js'), true),
    SETTINGS: loadModule(path.join(process.cwd(), 'config/app-settings.js'), true)
});

/**
 * 业务逻辑与 UI 文本的热重载机制
 * 清理 Node.js 模块缓存，重新初始化所有处理器和 Composer 路由链
 */
function reloadAllModules() {
    logger.info('正在执行全量业务逻辑热更新...');

    // 定义需要重载的核心模块绝对路径映射
    const paths = {
        scorer: path.join(process.cwd(), 'src/utils/relic-scorer'),
        meta: path.join(process.cwd(), 'src/utils/meta'),
        gachaRender: path.join(process.cwd(), 'src/utils/gacha-render'),
        gachaParser: path.join(process.cwd(), 'src/utils/gacha-parser'),
        conf_const: path.join(process.cwd(), 'config/game-constants'),
        conf_i18n: path.join(process.cwd(), 'config/bot-i18n'),
        conf_settings: path.join(process.cwd(), 'config/app-settings'),
        conf_weights: path.join(process.cwd(), 'config/weights'),
        profile: path.join(process.cwd(), 'src/bot/handlers/profile'),
        gacha: path.join(process.cwd(), 'src/bot/handlers/gacha')
    };

    // 1. 强力清除 require.cache，强制 Node 重新加载模块文件
    Object.values(paths).forEach(p => {
        try { delete require.cache[require.resolve(p)]; } catch (e) {}
    });

    // 2. 加载最新配置和处理器
    const { I18N_MODULE } = getFullCfg();
    const { WELCOME_MSG, I18N } = I18N_MODULE;
    const { setupProfileHandlers } = require('./handlers/profile');
    const { setupGachaHandlers } = require('./handlers/gacha');

    // 3. 执行工具类预加载 (确保重载后状态正确)
    loadModule(paths.scorer, true);
    loadModule(paths.meta, true);
    loadModule(paths.gachaRender, true);
    loadModule(paths.gachaParser, true);

    // 4. 创建隔离的全新 Composer 容器 (动态路由网关)
    const stage = new Composer();

    // a. 智能回复路由 (处理 Force Reply 场景)
    stage.on('text', async (ctx, next) => {
        if (ctx.message.text.startsWith('/')) return next();

        const reply = ctx.message.reply_to_message;
        if (!reply || reply.from.id !== ctx.botInfo.id) return next();

        const text = ctx.message.text.trim();

        // 识别 UID 绑定或查询场景
        if (reply.text.includes("UID")) {
            const uidMatch = text.match(/[1-9]\d{8}/);
            const cmd = (reply.text.includes("绑定") || reply.text.includes("bind")) ? 'bind' : 'profile';
            const input = uidMatch ? uidMatch[0] : text;

            ctx.message.text = `/${cmd} ${input}`;
            ctx.message.entities = [{ type: 'bot_command', offset: 0, length: cmd.length + 1 }];
            return next();
        }

        // 识别抽卡链接/文件处理场景
        if (reply.text.includes("抽卡") || reply.text.includes("链接") || reply.text.includes("gacha")) {
            const urlMatch = text.match(/https?:\/\/[^\s]+/);
            const input = urlMatch ? urlMatch[0] : text;

            ctx.message.text = `/gacha ${input}`;
            ctx.message.entities = [{ type: 'bot_command', offset: 0, length: 6 }];
            return next();
        }

        return next();
    });

    // b. 挂载子业务路由
    setupProfileHandlers(stage);
    setupGachaHandlers(stage);

    // c. 基础路由 (启动/帮助)
    const welcomeHandler = (ctx) => {
        ctx.reply(WELCOME_MSG, { parse_mode: 'HTML' });
    };

    stage.start(welcomeHandler);
    stage.command('help', welcomeHandler);

    stage.on('new_chat_members', (ctx) => {
        const isBot = ctx.message.new_chat_members.some(m => m.id === ctx.botInfo.id);
        if (isBot) welcomeHandler(ctx);
    });

    // d. 管理员指令：强制触发热重载
    stage.command('reload', async (ctx) => {
        if (!process.env.ADMIN_TG_ID || String(ctx.from.id) !== String(process.env.ADMIN_TG_ID)) {
            return ctx.reply(I18N.COMMON.ERROR_PERMISSION);
        }
        try {
            reloadAllModules();
            await ctx.reply(I18N.SYSTEM.RELOAD_SUCCESS);
        } catch (e) {
            logger.error('指令重载失败', e);
            await ctx.reply(I18N.SYSTEM.RELOAD_ERROR.replace('{error}', e.message));
        }
    });

    // 5. 更新全局指针
    currentHandlers = stage;
    logger.done('全量业务逻辑、元数据及 UI 配置已完成热更新');
}

// 模块初始化时执行一次重载，确保加载到最新代码
reloadAllModules();

/**
 * 初始化机器人中间件
 * @param {Object} bot - Telegraf 实例
 */
const setupHandlers = (bot) => {
    // 中间件：日志记录
    bot.use((ctx, next) => {
        if (ctx.message?.text?.startsWith('/')) {
            const cmd = ctx.message.text.split(/\s+/)[0];
            logger.command(ctx, cmd);
        } else if (ctx.callbackQuery) {
            logger.action(ctx, ctx.callbackQuery.data);
        }
        return next();
    });

    // 中间件：通过动态网关指针处理业务
    bot.use((ctx, next) => {
        if (currentHandlers) {
            return currentHandlers.middleware()(ctx, next);
        }
        return next();
    });

    // 回调动作：管理员强制重载
    bot.action('force_reload_cfg', async (ctx) => {
        const { I18N } = getFullCfg().I18N_MODULE;
        if (!process.env.ADMIN_TG_ID || String(ctx.from.id) !== String(process.env.ADMIN_TG_ID)) {
            logger.warn(`非法重载尝试: 用户 ${ctx.from.id}`);
            return ctx.answerCbQuery(I18N.COMMON.ERROR_PERMISSION, { show_alert: true }).catch(() => {});
        }

        try {
            reloadAllModules();
            await ctx.answerCbQuery(I18N.SYSTEM.RELOAD_SUCCESS, { show_alert: true }).catch(() => {});
        } catch (e) {
            logger.error('Action重载失败', e);
            await ctx.answerCbQuery(I18N.SYSTEM.RELOAD_ERROR.replace('{error}', e.message), { show_alert: true }).catch(() => {});
        }
    });
};

module.exports = { setupHandlers };
