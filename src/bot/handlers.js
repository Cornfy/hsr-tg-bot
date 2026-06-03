// src/bot/handlers.js
const path = require('path');
const { Composer } = require('telegraf');
const { loadModule } = require('../utils/loader');
const logger = require('../utils/logger');

// 内部核心状态：保持当前激活的动态路由网关指针
let currentHandlers = null;

/**
 * 统加载所有配置
 */
const getFullCfg = () => ({
    CONST: loadModule(path.join(process.cwd(), 'config/game-constants.js')),
    I18N_MODULE: loadModule(path.join(process.cwd(), 'config/bot-i18n.js')),
    SETTINGS: loadModule(path.join(process.cwd(), 'config/app-settings.js'))
});

/**
 * 安全清理所有业务文件、渲染器、元数据及 UI 文本的 Node 缓存并完成全量热重载
 */
function reloadAllModules() {
    logger.info('正在执行全量业务逻辑热更新...');

    // 统一定义需要斩断缓存的所有核心模块绝对路径
    const paths = {
        scorer: path.join(process.cwd(), 'src/utils/relic-scorer'),
        meta: path.join(process.cwd(), 'src/utils/meta'),
        gachaRender: path.join(process.cwd(), 'src/utils/gacha-render'),
        gachaParser: path.join(process.cwd(), 'src/utils/gacha-parser'),
        conf_const: path.join(process.cwd(), 'config/game-constants'),
        conf_i18n: path.join(process.cwd(), 'config/bot-i18n'),
        conf_settings: path.join(process.cwd(), 'config/app-settings'),
        profile: path.join(process.cwd(), 'src/bot/handlers/profile'),
        gacha: path.join(process.cwd(), 'src/bot/handlers/gacha')
    };

    // 1. 强力清除 require.cache 缓存
    Object.values(paths).forEach(p => {
        try { delete require.cache[require.resolve(p)]; } catch (e) {}
    });

    // 2. 加载最新配置
    const { I18N_MODULE } = getFullCfg();
    const { WELCOME_MSG, I18N } = I18N_MODULE;
    const { setupProfileHandlers } = require('./handlers/profile');
    const { setupGachaHandlers } = require('./handlers/gacha');

    // 3. 执行底层工具类的热重载加载 (可选，确保最新代码被引入)
    loadModule(paths.scorer);
    loadModule(paths.meta);
    loadModule(paths.gachaRender);
    loadModule(paths.gachaParser);

    // 4. 创建一个干净的、隔离的全新 Composer 容器
    const stage = new Composer();

    // a. 智能捕获：处理 Force Reply 的回复
    stage.on('text', async (ctx, next) => {
        if (ctx.message.text.startsWith('/')) return next();

        const reply = ctx.message.reply_to_message;
        if (!reply || reply.from.id !== ctx.botInfo.id) return next();

        const text = ctx.message.text.trim();

        // 处理 UID 类的回复 (用 I18N 中的关键词识别场景)
        if (reply.text.includes("UID")) {
            const uidMatch = text.match(/[1-9]\d{8}/);
            const cmd = (reply.text.includes("绑定") || reply.text.includes("bind")) ? 'bind' : 'profile';
            const input = uidMatch ? uidMatch[0] : text;

            ctx.message.text = `/${cmd} ${input}`;
            ctx.message.entities = [{ type: 'bot_command', offset: 0, length: cmd.length + 1 }];
            return next();
        }

        // 处理 Gacha 链接/文件类的回复
        if (reply.text.includes("抽卡") || reply.text.includes("链接") || reply.text.includes("gacha")) {
            const urlMatch = text.match(/https?:\/\/[^\s]+/);
            const input = urlMatch ? urlMatch[0] : text;

            ctx.message.text = `/gacha ${input}`;
            ctx.message.entities = [{ type: 'bot_command', offset: 0, length: 6 }];
            return next();
        }

        return next();
    });

    // b. 初始化挂载子业务路由
    setupProfileHandlers(stage);
    setupGachaHandlers(stage);

    // c. 基础公共基础指令
    const welcomeHandler = (ctx) => {
        ctx.reply(WELCOME_MSG, { parse_mode: 'HTML' });
    };

    stage.start(welcomeHandler);
    stage.command('help', welcomeHandler);

    stage.on('new_chat_members', (ctx) => {
        const isBot = ctx.message.new_chat_members.some(m => m.id === ctx.botInfo.id);
        if (isBot) welcomeHandler(ctx);
    });

    // d. 管理员专属 /reload 指令
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

    // 5. 替换外壳网关指向
    currentHandlers = stage;
    logger.done('全量业务逻辑、元数据及 UI 配置已完成热更新');
}

// 初始化
reloadAllModules();

const setupHandlers = (bot) => {
    bot.use((ctx, next) => {
        if (ctx.message?.text?.startsWith('/')) {
            const cmd = ctx.message.text.split(/\s+/)[0];
            logger.command(ctx, cmd);
        } else if (ctx.callbackQuery) {
            logger.action(ctx, ctx.callbackQuery.data);
        }
        return next();
    });

    bot.use((ctx, next) => {
        if (currentHandlers) {
            return currentHandlers.middleware()(ctx, next);
        }
        return next();
    });

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
